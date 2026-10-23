import './academicDialogSupport'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import App from '../src/App'
import type { AccountApi, StudentProfile } from '../src/account'
import type { AcademicApi } from '../src/academicItems'
const mock=vi.hoisted(()=>({api:{} as AccountApi,items:{} as AcademicApi}))
vi.mock('../src/account',async original=>({...await original<typeof import('../src/account')>(),accountApi:()=>mock.api}))
vi.mock('../src/academicItems',async original=>({...await original<typeof import('../src/academicItems')>(),academicItemsApi:()=>mock.items}))
const profile=(id='a'):StudentProfile=>({id,name:`Student ${id}`,major:null,year:null,interests:[],residence_status:null,avatar_path:null})
const session=(id:string)=>({user:{id},access_token:`token-${id}`}) as Session
function fake(initial:Session|null=null){
 let current=initial;let listener:(event:string,s:Session|null)=>void=()=>{}
 const unsubscribe=vi.fn()
 const auth={getSession:vi.fn(async()=>({data:{session:current},error:null})),onAuthStateChange:vi.fn((fn:typeof listener)=>{listener=fn;return {data:{subscription:{unsubscribe}}}}),signInWithOAuth:vi.fn(async()=>({error:null})),signOut:vi.fn(async()=>{current=null;listener('SIGNED_OUT',null);return {error:null}})}
 return {client:{auth} as unknown as SupabaseClient,auth,unsubscribe,emit:(id:string|null,event='SIGNED_IN')=>{current=id?session(id):null;listener(event,current)}}
}
beforeEach(()=>{mock.api={eligible:vi.fn().mockResolvedValue(true),load:vi.fn().mockResolvedValue({profile:profile(),courses:[]}),saveClasses:vi.fn().mockResolvedValue([{id:'cse-310',code:'CSE 310',sections:['01']}]),saveProfile:vi.fn(async p=>({profile:p,cleanupPath:null})),pictureUrl:vi.fn(),removeObject:vi.fn()}})

test('Campus Explorer opens lazily, preserves filters across navigation and clears on account teardown', async () => {
 const f=fake(session('a'))
 const order=vi.fn(); order.mockReturnValueOnce({order}).mockResolvedValue({data:[],error:null})
 Object.assign(f.client,{from:vi.fn(()=>({select:()=>({order})})),rpc:vi.fn(async()=>({data:false,error:null}))})
 render(<App client={f.client}/>); await screen.findByText('Student a')
 expect(screen.queryByRole('heading',{name:'Campus Explorer'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Campus Explorer'}))
 await screen.findByRole('heading',{name:'Campus Explorer'})
 expect(screen.getByRole('button',{name:'Campus Explorer'})).toHaveAttribute('aria-pressed','true')
 const printers=screen.getByRole('checkbox',{name:'Printers'}); fireEvent.click(printers)
 fireEvent.click(screen.getByRole('button',{name:'My dashboard'}))
 expect(screen.queryByRole('heading',{name:'Campus Explorer'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Campus Explorer'}))
 expect(screen.getByRole('checkbox',{name:'Printers'})).not.toBeChecked()
 act(()=>f.emit(null)); await screen.findByRole('button',{name:'Continue with Google'})
 expect(screen.queryByRole('heading',{name:'Campus Explorer'})).not.toBeInTheDocument()
})
test('Google start failure, cancellation and unsubscribe',async()=>{
 const f=fake();const v=render(<App client={f.client}/>);await screen.findByRole('button',{name:'Continue with Google'})
 f.auth.signInWithOAuth.mockResolvedValueOnce({error:{message:'failed'}} as never);fireEvent.click(screen.getByRole('button',{name:'Continue with Google'}));expect(await screen.findByRole('alert')).toHaveTextContent('could not start')
 fireEvent.click(screen.getByRole('button',{name:'Continue with Google'}));await waitFor(()=>expect(f.auth.signInWithOAuth).toHaveBeenCalledTimes(2));expect(f.auth.signInWithOAuth).toHaveBeenLastCalledWith(expect.objectContaining({provider:'google',options:expect.objectContaining({redirectTo:expect.stringContaining('/auth/callback')})}))
 v.unmount();expect(f.unsubscribe).toHaveBeenCalled();window.history.replaceState({},'','/auth/callback?error=access_denied');render(<App client={fake().client}/>);expect(await screen.findByRole('alert')).toHaveTextContent('canceled');window.history.replaceState({},'','/')
})
test('restores empty account, manual classes call persistence, signout clears state',async()=>{
 const f=fake(session('a'));render(<App client={f.client}/>);await screen.findByText('Student a');expect(screen.getByText(/No saved classes yet/)).toBeInTheDocument();expect(screen.queryByText('Alex Morgan')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Enter classes manually'}));fireEvent.change(screen.getByLabelText('Manual course code 1'),{target:{value:'cse310'}});fireEvent.change(screen.getByLabelText('Manual section 1'),{target:{value:'01'}});fireEvent.click(screen.getByRole('button',{name:'Save classes',exact:true}));expect(await screen.findByRole('heading',{name:'Classmates in CSE 310'})).toBeInTheDocument();expect(mock.api.saveClasses).toHaveBeenCalledWith([{code:'cse310',section:'01'}])
 fireEvent.click(screen.getByRole('button',{name:'Sign out'}));await screen.findByRole('button',{name:'Continue with Google'});expect(screen.queryByText('Student a')).not.toBeInTheDocument()
})
test('ineligible signs out, failed load retries',async()=>{
 const f=fake(session('a'));vi.mocked(mock.api.eligible).mockResolvedValueOnce(false);const v=render(<App client={f.client}/>);expect(await screen.findByText(/Use a verified @stonybrook.edu/)).toBeInTheDocument();expect(mock.api.load).not.toHaveBeenCalled();v.unmount()
 vi.mocked(mock.api.load).mockRejectedValueOnce(new Error('Unable to load.'));render(<App client={fake(session('a')).client}/>);fireEvent.click(await screen.findByRole('button',{name:'Retry loading account'}));expect(await screen.findByText('Student a')).toBeInTheDocument()
})
test('late A cannot populate B and refresh does not discard workspace',async()=>{
 let resolveA!:(data:Awaited<ReturnType<AccountApi['load']>>)=>void
 vi.mocked(mock.api.load).mockImplementationOnce(()=>new Promise(r=>{resolveA=r})).mockResolvedValueOnce({profile:profile('b'),courses:[]});const f=fake(session('a'));render(<App client={f.client}/>);await waitFor(()=>expect(mock.api.load).toHaveBeenCalledTimes(1));act(()=>{f.emit(null);f.emit('b')});await screen.findByText('Student b')
 await act(async()=>resolveA({profile:profile('a'),courses:[{id:'bad',databaseId:'old-course',code:'AAA 100'}]}));expect(screen.queryByText('Student a')).not.toBeInTheDocument();act(()=>f.emit('b','TOKEN_REFRESHED'));expect(screen.getByText('Student b')).toBeInTheDocument();expect(mock.api.load).toHaveBeenCalledTimes(2);act(()=>f.emit(null));await screen.findByRole('button',{name:'Continue with Google'})
})
test('missing config is actionable',()=>{render(<App client={null}/>);expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL')})

test('planner failures stay isolated and private drafts survive navigation but clear on signout',async()=>{
 mock.items={load:vi.fn().mockRejectedValueOnce(new Error('Academic storage unavailable')).mockResolvedValue([]),save:vi.fn(),complete:vi.fn(),remove:vi.fn()}
 vi.mocked(mock.api.load).mockResolvedValue({profile:profile(),courses:[{id:'cse-310',databaseId:'10000000-0000-0000-0000-000000000021',code:'CSE 310'}]})
 const f=fake(session('a'));render(<App client={f.client}/>);await screen.findByText('Student a')
 fireEvent.click(screen.getByRole('button',{name:'Assignments & Exams'}));await screen.findByText('Academic storage unavailable')
 fireEvent.click(screen.getByRole('button',{name:'My dashboard'}));expect(screen.getByText('Student a')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Assignments & Exams'}));fireEvent.click(screen.getByRole('button',{name:'Retry academic items'}));await screen.findByText(/Nothing planned/)
 fireEvent.click(screen.getByRole('button',{name:'Add item'}));fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Private draft'}})
 // Native background blocking is verified in Chrome. External auth events must
 // tear down the account even while its modal has an unsaved draft.
 act(()=>f.emit(null));await screen.findByRole('button',{name:'Continue with Google'});expect(screen.queryByDisplayValue('Private draft')).not.toBeInTheDocument();expect(document.querySelector('dialog[open]')).toBeNull();expect(document.body.style.overflow).not.toBe('hidden')
})

test.each(['editor','discard','save','delete','deleting'] as const)('external account replacement tears down %s and ignores old results',async mode=>{
 const course={id:'cse-310',databaseId:'10000000-0000-0000-0000-000000000021',code:'CSE 310'}
 const item={id:'private-item',user_course_id:course.databaseId,title:'Private old item',type:'assignment' as const,due_date:'2026-10-23',due_time:null,notes:null,location:null,completed_at:null}
 let resolveWrite!:(value:unknown)=>void
 mock.items={load:vi.fn().mockResolvedValue([item]),save:vi.fn(()=>new Promise(resolve=>{resolveWrite=resolve})),complete:vi.fn(),remove:vi.fn(()=>new Promise(resolve=>{resolveWrite=resolve}))}
 vi.mocked(mock.api.load).mockResolvedValue({profile:profile(),courses:[course]})
 const f=fake(session('a'));render(<App client={f.client}/>);await screen.findByText('Student a')
 fireEvent.click(screen.getByRole('button',{name:'Assignments & Exams'}));await screen.findByRole('heading',{name:'Private old item'})
 if(mode==='delete'||mode==='deleting'){
   fireEvent.click(screen.getByRole('button',{name:'Actions for Private old item'}));fireEvent.click(screen.getByRole('menuitem',{name:'Delete'}))
   if(mode==='deleting')fireEvent.click(screen.getByRole('button',{name:'Delete',exact:true}))
 }else{
   fireEvent.click(screen.getByRole('button',{name:'Add item'}));fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Private unsaved draft'}})
   if(mode==='discard')fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}))
   if(mode==='save'){fireEvent.change(screen.getByLabelText('Due date'),{target:{value:'2026-10-23'}});fireEvent.click(screen.getByRole('button',{name:'Save item'}))}
 }
 expect(document.querySelectorAll('dialog[open]')).toHaveLength(1)
 vi.mocked(mock.items.load).mockResolvedValue([]);vi.mocked(mock.api.load).mockResolvedValue({profile:profile('b'),courses:[course]})
 act(()=>f.emit('b'));await screen.findByText('Student b')
 if(mode==='save'||mode==='deleting')await act(async()=>resolveWrite(mode==='save'?{...item,title:'Private unsaved draft'}:undefined))
 expect(document.querySelector('dialog[open]')).toBeNull();expect(document.body.style.overflow).not.toBe('hidden')
 expect(screen.queryByText('Private old item')).not.toBeInTheDocument();expect(screen.queryByDisplayValue('Private unsaved draft')).not.toBeInTheDocument()
 expect(window.confirm).not.toHaveBeenCalled();expect(window.alert).not.toHaveBeenCalled()
})

test('classmate dialog clears across course, navigation and auth changes and ignores stale detail results',async()=>{
 const courses=[{id:'cse-310',databaseId:'course1',code:'CSE 310'},{id:'ams-210',databaseId:'course2',code:'AMS 210'}]
 vi.mocked(mock.api.load).mockResolvedValue({profile:profile(),courses})
 const f=fake(session('a'))
 let resolve!:(result:unknown)=>void
 const abortSignals:AbortSignal[]=[]
 const rpc=vi.fn((name:string)=>name==='find_classmates'?Promise.resolve({data:[{student_id:'peer',name:'Peer Name',major:'Math'}],error:null}):{abortSignal:(signal:AbortSignal)=>{abortSignals.push(signal);return new Promise(r=>{resolve=r})}})
 Object.assign(f.client,{rpc})
 render(<App client={f.client}/>);await screen.findByRole('button',{name:'View profile of Peer Name'})
 fireEvent.click(screen.getByRole('button',{name:'View profile of Peer Name'}));expect(screen.getByRole('dialog')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:/AMS 210/}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(abortSignals[0].aborted).toBe(true)
 await act(async()=>resolve({data:{student_id:'peer',name:'Stale Secret',major:null,has_shared_avatar:false},error:null}));expect(screen.queryByText('Stale Secret')).not.toBeInTheDocument()
 await screen.findByRole('button',{name:'View profile of Peer Name'});fireEvent.click(screen.getByRole('button',{name:'View profile of Peer Name'}));fireEvent.click(screen.getByRole('button',{name:'Study spaces'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'My dashboard'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'View profile of Peer Name'}));act(()=>f.emit(null));await screen.findByRole('button',{name:'Continue with Google'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 await act(async()=>resolve({data:{student_id:'peer',name:'Stale Secret',major:null,has_shared_avatar:false},error:null}));expect(screen.queryByText('Stale Secret')).not.toBeInTheDocument()
})
