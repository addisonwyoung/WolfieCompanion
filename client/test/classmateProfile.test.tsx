import './academicDialogSupport'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import ClassmateProfile from '../src/PeerProfileDialog'
import CourseBrowser from '../src/CourseBrowser'
import { parsePeer, peerApi } from '../src/classmateProfile'
import type { PeerApi, ClassmateProfile as Peer } from '../src/classmateProfile'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useState } from 'react'

const peer: Peer={student_id:'b',name:'Real Peer',major:null,has_shared_avatar:false}
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function api():PeerApi{return {detail:vi.fn().mockResolvedValue(peer),picture:vi.fn().mockRejectedValue(new Error('offline'))}}
test('strict detail parsing allowlists fields and rejects invalid values and mismatched identities',()=>{
 expect(parsePeer({...peer,email:'private',avatar_path:'private',year:null,interests:[],residence_status:'commuter'},'b')).toEqual({...peer,year:null,interests:[],residence_status:'commuter'})
 for(const row of [{...peer,student_id:'c'},{...peer,year:'invalid'},{...peer,interests:['x',null]},{...peer,residence_status:'address'},{...peer,has_shared_avatar:'yes'},null])expect(()=>parsePeer(row,'b')).toThrow()
})
test('adapter derives caller from session, separates unavailable and errors and passes abort signal',async()=>{
 const response={data:peer,error:null} as {data:unknown,error:null|{code:string}}
 const abortSignal=vi.fn(async()=>response),rpc=vi.fn(()=>({abortSignal}))
 const adapter=peerApi({rpc} as unknown as SupabaseClient),signal=new AbortController().signal
 expect(await adapter.detail('CSE310','b',signal)).toEqual(peer)
 expect(rpc).toHaveBeenCalledWith('get_classmate_profile',{p_course_code:'CSE310',p_student_id:'b'});expect(abortSignal).toHaveBeenCalledWith(signal)
 response.data=null;expect(await adapter.detail('CSE310','b',signal)).toBeNull()
 response.error={code:'42501'};expect(await adapter.detail('CSE310','b',signal)).toBeNull()
 response.error={code:'network'};await expect(adapter.detail('CSE310','b',signal)).rejects.toThrow('retry')
})
function Flow({service}:{service:PeerApi}){
 const [selected,setSelected]=useState('cse-310'),[target,setTarget]=useState<string|null>(null)
 return <><CourseBrowser enrolledCourses={[{id:'cse-310',code:'CSE 310'}]} selectedId={selected} onSelect={setSelected} onAddClasses={vi.fn()} onRetry={vi.fn()} onViewProfile={setTarget} roster={{status:'success',classmates:[peer]}}/>{target&&<ClassmateProfile api={service} course="CSE 310" student={target} onClose={()=>setTarget(null)}/>}</>
}
test('class roster opens read-only profile and closes with focus restored and fresh lookup on reopening',async()=>{
 const service=api(),user=userEvent.setup();render(<Flow service={service}/> )
 const button=screen.getByRole('button',{name:'View profile of Real Peer'});button.focus();await user.keyboard('{Enter}')
 const dialog=screen.getByRole('dialog');expect(dialog).toHaveAttribute('open')
 await waitFor(()=>expect(screen.getAllByText('Major not added')).toHaveLength(2))
 expect(screen.queryByText('Year of study')).not.toBeInTheDocument();expect(screen.queryByText('Interests')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/message|edit profile/i})).not.toBeInTheDocument()
 screen.getByRole('button',{name:'Close profile'}).focus();await user.tab();expect(screen.getByRole('button',{name:'Close profile'})).toHaveFocus()
 fireEvent(dialog,new Event('cancel',{bubbles:true,cancelable:true}))
 expect(button).toHaveFocus();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:/CSE 310/})).toHaveAttribute('aria-pressed','true')
 vi.mocked(service.detail).mockResolvedValue({...peer,name:'New Name'})
 await user.click(button);await screen.findByRole('heading',{name:'New Name'});expect(service.detail).toHaveBeenCalledTimes(2);expect(service.detail).toHaveBeenLastCalledWith('CSE 310','b',expect.any(AbortSignal))
})
test('shared empty fields, picture-only failure, transient retry and unavailable states',async()=>{
 const service=api();vi.mocked(service.detail).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({...peer,year:null,residence_status:null,interests:[],has_shared_avatar:true}).mockResolvedValueOnce(null)
 const {unmount}=render(<ClassmateProfile api={service} course="CSE 310" student="b" onClose={vi.fn()}/> )
 await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Retry profile'}))
 await screen.findByText('Interests');expect(screen.getAllByText('Not added')).toHaveLength(2);expect(screen.getByText('No interests added yet.')).toBeInTheDocument()
 await waitFor(()=>expect(service.picture).toHaveBeenCalledOnce());expect(screen.getByRole('heading',{name:'Real Peer'})).toBeInTheDocument();expect(screen.queryByRole('img')).not.toBeInTheDocument()
 unmount();render(<ClassmateProfile api={service} course="CSE 310" student="b" onClose={vi.fn()}/> );await screen.findByText('Profile unavailable.')
})
test('unmount aborts late details and picture URLs are released',async()=>{
 const pending=deferred<Peer|null>(),latePicture=deferred<Blob>(),service=api();vi.mocked(service.detail).mockReturnValueOnce(pending.promise).mockResolvedValue({...peer,has_shared_avatar:true});vi.mocked(service.picture).mockReturnValue(latePicture.promise)
 const create=vi.fn(()=> 'blob:peer'),revoke=vi.fn();vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:revoke}))
 const first=render(<ClassmateProfile api={service} course="CSE 310" student="b" onClose={vi.fn()}/> );first.unmount();await act(async()=>pending.resolve({...peer,has_shared_avatar:true}));expect(service.picture).not.toHaveBeenCalled();expect(vi.mocked(service.detail).mock.calls[0][2].aborted).toBe(true)
 const second=render(<ClassmateProfile api={service} course="CSE 310" student="b" onClose={vi.fn()}/> );await waitFor(()=>expect(service.picture).toHaveBeenCalledOnce());await act(async()=>latePicture.resolve(new Blob(['png'],{type:'image/png'})));expect(screen.getByRole('img')).toHaveAttribute('src','blob:peer');second.unmount();expect(revoke).toHaveBeenCalledWith('blob:peer')
})

test('changing peer/course masks existing data synchronously and ignores a late picture',async()=>{
 const service=api(),pendingPicture=deferred<Blob>(),create=vi.fn(()=> 'blob:late')
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:vi.fn()}))
 vi.mocked(service.detail).mockResolvedValueOnce({...peer,interests:['Private old interest'],has_shared_avatar:true}).mockReturnValueOnce(new Promise(()=>{}))
 vi.mocked(service.picture).mockReturnValueOnce(pendingPicture.promise)
 const {rerender}=render(<ClassmateProfile api={service} course="CSE 310" student="b" onClose={vi.fn()}/> );await screen.findByText('Private old interest')
 rerender(<ClassmateProfile api={service} course="AMS 210" student="c" onClose={vi.fn()}/> )
 expect(screen.queryByText('Private old interest')).not.toBeInTheDocument();expect(screen.getByRole('status')).toHaveTextContent('Loading profile')
 await act(async()=>pendingPicture.resolve(new Blob(['late'])));expect(create).not.toHaveBeenCalled()
})
