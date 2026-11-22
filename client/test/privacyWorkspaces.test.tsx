import './academicDialogSupport'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import Messages from '../src/Messages'
import StudyGroups from '../src/StudyGroups'
import FriendProfileDialog from '../src/FriendProfileDialog'
import PeerProfileDialog from '../src/PeerProfileDialog'
import { useStudentPrivacy } from '../src/useStudentPrivacy'
import type { FriendApi } from '../src/friendshipApi'
import type { PeerApi } from '../src/classmateProfile'
import type { GroupApi, GroupDetail } from '../src/groupMessaging'
import type { MessagingApi } from '../src/messaging'
import type { StudyGroup, StudyGroupApi } from '../src/studyGroupApi'
import type { StudentPrivacyApi } from '../src/studentPrivacy'

const id=(n:number)=>`29000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const actor=id(1),peer=id(2),group=id(3)
function privacyApi() {
  return { block:vi.fn().mockResolvedValue(undefined),unblock:vi.fn().mockResolvedValue(undefined),blocks:vi.fn().mockResolvedValue([]),
    warnings:vi.fn().mockResolvedValue([{warning_id:id(5),blocked_student_id:peer,name:'Group peer'}]),dismiss:vi.fn().mockResolvedValue(undefined),groupPicture:vi.fn() } satisfies StudentPrivacyApi
}

test('Messages fetches warnings only after opening and verifying membership, even below the send minimum; banner reuses leave',async()=>{
  const privacy=privacyApi()
  let resolve!:(value:GroupDetail)=>void
  const loading=new Promise<GroupDetail>(yes=>{resolve=yes})
  const detail:GroupDetail={group_id:group,name:'Read-only team',creator_id:peer,addition_permission:'all_members',can_manage:false,can_add:true,can_send:false,joined_after_sequence:0,last_read_sequence:0,members:[{student_id:actor,name:'You'},{student_id:peer,name:'Group peer'}]}
  const groups={detail:vi.fn(()=>loading),history:vi.fn(async()=>[]),leave:vi.fn(async()=>{})} as unknown as GroupApi
  const api:MessagingApi={groups,inbox:vi.fn(async()=>[{kind:'group',conversation_id:group,student_id:null,name:'Read-only team',member_count:2,last_message_at:'2026-11-21T00:00:00Z',message_time:null,preview:null}]),contact:vi.fn(),history:vi.fn(),send:vi.fn()}
  render(<Messages api={api} userId={actor} initialTarget={null} privacyApi={privacy}/> )
  fireEvent.click(await screen.findByRole('button',{name:/Read-only team/}))
  expect(privacy.warnings).not.toHaveBeenCalled()
  await act(async()=>resolve(detail))
  await screen.findByText(/You blocked Group peer/)
  const settings=screen.getByRole('button',{name:'Group Settings'})
  expect(settings).toHaveAttribute('aria-expanded','false')
  fireEvent.click(settings);expect(screen.getByText(/You blocked Group peer/)).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'Close group settings'}));expect(screen.getByText(/You blocked Group peer/)).toBeVisible()
  expect(privacy.warnings).toHaveBeenCalledTimes(1)
  expect(screen.getByPlaceholderText(/Type a message/)).toBeDisabled()
  expect(privacy.warnings).toHaveBeenCalledWith('messaging',group,actor,expect.any(AbortSignal))
  fireEvent.click(screen.getByRole('button',{name:'Leave this group'}))
  await waitFor(()=>expect(groups.leave).toHaveBeenCalledTimes(1))
  await waitFor(()=>expect(screen.queryByText(/You blocked Group peer/)).not.toBeInTheDocument())
})

test('Study warnings exclude invitation previews and appear only in the selected accepted legacy workspace without can_invite',async()=>{
  const privacy=privacyApi()
  const accepted:StudyGroup={group_id:group,course_code:'CSE 416',course_section:null,name:'Legacy workspace',owner_id:peer,created_at:'2026-11-21T00:00:00Z',my_status:'accepted',members:[{user_id:actor,name:'You',role:'member',status:'accepted',study_role:null},{user_id:peer,name:'Group peer',role:'owner',status:'accepted',study_role:null}],availability:[],tasks:[],professor_first_name:null,professor_last_name:null,semester:null,academic_year:null,can_invite:false,pending_count:0,invitation_id:null,expires_at:null,invitation_state:null,inviter:null,outgoing_invitations:[]}
  const pending:StudyGroup={...accepted,group_id:id(4),name:'Pending workspace',my_status:'pending',owner_id:null,members:[],invitation_id:id(7),invitation_state:'expired',expires_at:'2026-11-21T00:00:00Z'}
  const api={list:vi.fn(async()=>[accepted,pending]),candidates:vi.fn(async()=>[]),leave:vi.fn(async()=>{})} as unknown as StudyGroupApi
  render(<StudyGroups api={api} userId={actor} courses={[]} classmatesApi={vi.fn()} onGoToCourses={vi.fn()} privacyApi={privacy}/> )
  await screen.findByText('Pending workspace')
  expect(privacy.warnings).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:/Legacy workspace/}))
  await screen.findByText(/You blocked Group peer/)
  expect(privacy.warnings).toHaveBeenCalledTimes(1)
  expect(privacy.warnings).toHaveBeenCalledWith('study',group,actor,expect.any(AbortSignal))
  fireEvent.click(screen.getByRole('button',{name:'Leave this group'}))
  await waitFor(()=>expect(api.leave).toHaveBeenCalledWith(group,expect.any(String)))
  await waitFor(()=>expect(screen.queryByText(/You blocked Group peer/)).not.toBeInTheDocument())
})

test.each(['friend','classmate'] as const)('authorized %s profile uses the shared block action and closes on confirmation',async(kind)=>{
  const privacy=privacyApi(),closed=vi.fn()
  const person={student_id:peer,name:'Authorized student',major:null,has_shared_avatar:false}
  const friend={profile:vi.fn(async()=>person)} as unknown as FriendApi
  const classmate={detail:vi.fn(async()=>person)} as unknown as PeerApi
  function Workspace(){
    const controller=useStudentPrivacy(privacy,actor)
    return kind==='friend'?<FriendProfileDialog api={friend} student={peer} onClose={closed} privacy={controller}/>:<PeerProfileDialog api={classmate} course="CSE 416" section="01" professorFirstName="Ada" professorLastName="Lovelace" student={peer} onClose={closed} privacy={controller}/>
  }
  render(<Workspace/>);fireEvent.click(await screen.findByRole('button',{name:'Block Authorized student'}))
  fireEvent.click(screen.getByRole('button',{name:'Confirm block'}))
  await waitFor(()=>expect(privacy.block).toHaveBeenCalledWith(peer,actor,expect.any(AbortSignal)))
  await waitFor(()=>expect(closed).toHaveBeenCalled())
})

test('an unavailable profile never receives a blocking action reconstructed from hidden data',async()=>{
  const privacy=privacyApi(),friend={profile:vi.fn(async()=>null)} as unknown as FriendApi
  function Workspace(){const controller=useStudentPrivacy(privacy,actor);return <FriendProfileDialog api={friend} student={peer} onClose={vi.fn()} privacy={controller}/>}
  render(<Workspace/>);await screen.findByText('Profile unavailable.')
  expect(screen.queryByRole('button',{name:/Block /})).not.toBeInTheDocument();expect(privacy.block).not.toHaveBeenCalled()
})


test('Messages banner leave shares available, busy and unconfirmed membership-control states',async()=>{
 const privacy=privacyApi();let reject!:(reason:Error)=>void
 const detail:GroupDetail={group_id:group,name:'Team',creator_id:actor,addition_permission:'all_members',can_manage:true,can_add:true,can_send:false,joined_after_sequence:0,last_read_sequence:0,members:[{student_id:actor,name:'You'},{student_id:peer,name:'Group peer'}]}
 const groups={detail:vi.fn(async()=>detail),history:vi.fn(async()=>[]),setPermission:vi.fn(()=>new Promise<void>((_,no)=>{reject=no})),leave:vi.fn().mockRejectedValueOnce(new Error('Lost leave reply')).mockResolvedValue(undefined)} as unknown as GroupApi
 const api={groups,inbox:vi.fn(async()=>[{kind:'group',conversation_id:group,name:'Team',member_count:2,message_time:null,preview:null}]),contact:vi.fn(),history:vi.fn(),send:vi.fn()} as unknown as MessagingApi
 render(<Messages api={api} userId={actor} initialTarget={null} privacyApi={privacy}/>)
 fireEvent.click(await screen.findByRole('button',{name:/Team/}))
 const leave=await screen.findByRole('button',{name:'Leave this group'});expect(leave).toBeEnabled()
 fireEvent.click(screen.getByRole('button',{name:'Group Settings'}))
 fireEvent.change(screen.getByLabelText('Who can add members'),{target:{value:'creator_only'}})
 fireEvent.click(screen.getByRole('button',{name:'Save group setting'}));expect(leave).toBeDisabled()
 await act(async()=>reject(new Error('Lost setting reply')))
 expect(leave).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Discard group attempt'}));expect(leave).toBeEnabled()
 fireEvent.click(leave);await screen.findByText('Lost leave reply');expect(leave).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'Retry group change'}))
 await waitFor(()=>expect(groups.leave).toHaveBeenCalledTimes(2))
 expect(vi.mocked(groups.leave).mock.calls[0]).toEqual(vi.mocked(groups.leave).mock.calls[1])
})

test('Study banner leave shares available, busy and unconfirmed retry states',async()=>{
 const privacy=privacyApi();let reject!:(reason:Error)=>void
 const accepted:StudyGroup={group_id:group,course_code:'CSE 416',course_section:null,name:'Legacy workspace',owner_id:peer,created_at:'2026-11-21T00:00:00Z',my_status:'accepted',members:[{user_id:actor,name:'You',role:'member',status:'accepted',study_role:null},{user_id:peer,name:'Group peer',role:'owner',status:'accepted',study_role:null}],availability:[],tasks:[],professor_first_name:null,professor_last_name:null,semester:null,academic_year:null,can_invite:false,pending_count:0,invitation_id:null,expires_at:null,invitation_state:null,inviter:null,outgoing_invitations:[]}
 const leave=vi.fn().mockImplementationOnce(()=>new Promise<void>((_,no)=>{reject=no})).mockResolvedValue(undefined)
 const api={list:vi.fn(async()=>[accepted]),candidates:vi.fn(async()=>[]),leave} as unknown as StudyGroupApi
 render(<StudyGroups api={api} userId={actor} courses={[]} classmatesApi={vi.fn()} onGoToCourses={vi.fn()} privacyApi={privacy}/>)
 fireEvent.click(await screen.findByRole('button',{name:/Legacy workspace/}))
 const button=await screen.findByRole('button',{name:'Leave this group'});expect(button).toBeEnabled()
 fireEvent.click(button);expect(button).toBeDisabled()
 await act(async()=>reject(new Error('Lost leave reply')))
 expect(button).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Retry Study change'}))
 await waitFor(()=>expect(leave).toHaveBeenCalledTimes(2));expect(leave.mock.calls[0]).toEqual(leave.mock.calls[1])
})


test('banner leave errors and same-nonce retries remain accessible while Group Settings is closed',async()=>{
 const privacy=privacyApi()
 const detail:GroupDetail={group_id:group,name:'Team',creator_id:peer,addition_permission:'all_members',can_manage:false,can_add:true,can_send:false,joined_after_sequence:0,last_read_sequence:0,members:[{student_id:actor,name:'You'},{student_id:peer,name:'Group peer'}]}
 const groups={detail:vi.fn(async()=>detail),history:vi.fn(async()=>[]),leave:vi.fn().mockRejectedValueOnce(new Error('Leave could not be confirmed')).mockResolvedValue(undefined)} as unknown as GroupApi
 const api={groups,inbox:vi.fn(async()=>[{kind:'group',conversation_id:group,name:'Team',member_count:2,message_time:null,preview:null}]),contact:vi.fn(),history:vi.fn(),send:vi.fn()} as unknown as MessagingApi
 render(<Messages api={api} userId={actor} initialTarget={null} privacyApi={privacy}/>)
 fireEvent.click(await screen.findByRole('button',{name:/Team/}));fireEvent.click(await screen.findByRole('button',{name:'Leave this group'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Leave could not be confirmed')
 expect(screen.getByRole('button',{name:'Group Settings'})).toHaveAttribute('aria-expanded','false')
 fireEvent.click(screen.getByRole('button',{name:'Retry group change'}))
 await waitFor(()=>expect(groups.leave).toHaveBeenCalledTimes(2));expect(vi.mocked(groups.leave).mock.calls[0]).toEqual(vi.mocked(groups.leave).mock.calls[1])
})
