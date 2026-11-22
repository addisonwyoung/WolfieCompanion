import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SavedCourse } from '../src/account'
import StudyGroups from '../src/StudyGroups'
import { studyGroupApi } from '../src/studyGroupApi'
import type { StudyGroup, StudyGroupApi } from '../src/studyGroupApi'
const id=(n:number)=>`e1000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const self=id(1),groupId=id(20),generation=id(30)
const group:StudyGroup={group_id:groupId,course_code:'CSE 416',course_section:'01',name:'Shared workspace',owner_id:self,created_at:'2026-11-21T10:00:00Z',my_status:'accepted',
 members:[{user_id:self,name:'You',status:'accepted',role:'owner',study_role:null},{user_id:id(2),name:'Accepted peer',status:'accepted',role:'member',study_role:null}],availability:[],tasks:[],
 professor_first_name:'ada',professor_last_name:'lovelace',semester:'Fall',academic_year:2026,can_invite:true,pending_count:0,invitation_id:null,expires_at:null,invitation_state:null,inviter:null,outgoing_invitations:[]}
const pending:StudyGroup={...group,group_id:id(21),name:'Safe pending invitation',owner_id:null,my_status:'pending',members:[],can_invite:false,invitation_id:generation,expires_at:'2026-11-28T10:00:00Z',invitation_state:'pending',inviter:{student_id:id(2),name:'Actual inviter'}}
function apiFixture(rows:StudyGroup[]=[group]){
 const api:StudyGroupApi={list:vi.fn(async()=>structuredClone(rows)),candidates:vi.fn(async()=>[{student_id:id(3),name:'Public classmate',major:null},{student_id:id(4),name:'Private friend',major:null}]),create:vi.fn(async()=>groupId),invite:vi.fn(async()=>{}),respond:vi.fn(async()=>{}),leave:vi.fn(async()=>{}),saveAvailability:vi.fn(async()=>{}),setMemberRole:vi.fn(async()=>{}),addTask:vi.fn(async()=>id(40)),setTaskComplete:vi.fn(async()=>{}),deleteTask:vi.fn(async()=>{})}
 return api
}
function mount(api:StudyGroupApi,courses:SavedCourse[]=[]){return render(<StudyGroups userId={self} courses={courses} api={api} classmatesApi={vi.fn(async()=>[])} onGoToCourses={vi.fn()}/>)}
test('Study adapters use scoped offering/generation/nonces and conceal raw authorization reasons',async()=>{
 const rpc=vi.fn(async()=>({data:[],error:null as null|{code:string;message:string}})),api=studyGroupApi({rpc} as unknown as SupabaseClient)
 await api.candidates({courseCode:'CSE 416',section:'01',professorFirstName:'Ada',professorLastName:'Lovelace'})
 expect(rpc).toHaveBeenLastCalledWith('study_invitation_candidates',expect.objectContaining({p_group_id:null,p_professor_last_name:'Lovelace'}))
 await api.invite(groupId,[id(4),id(3)],id(50));expect(rpc).toHaveBeenLastCalledWith('study_invite',{p_group_id:groupId,p_invitees:[id(3),id(4)],p_request_id:id(50)})
 await api.respond(groupId,generation,true,id(51));expect(rpc).toHaveBeenLastCalledWith('study_respond',{p_group_id:groupId,p_invitation_id:generation,p_accept:true,p_request_id:id(51)})
 await api.leave(groupId,id(52));expect(rpc).toHaveBeenLastCalledWith('study_leave',{p_group_id:groupId,p_request_id:id(52)})
 rpc.mockResolvedValue({data:[],error:{code:'42501',message:'Private or blocked by Alice'}})
 await expect(api.invite(groupId,[id(3)],id(53))).rejects.toThrow('Study invitation or group unavailable')
})
test('pending parser denies roster/owner/outgoing leaks and missing migration fields',async()=>{
 const response:{data:unknown[];error:null}={data:[pending],error:null}
 const api=studyGroupApi({rpc:async()=>response} as unknown as SupabaseClient)
 expect((await api.list())[0].members).toEqual([])
 for(const patch of [{members:group.members},{owner_id:self},{outgoing_invitations:[{}]},{availability:[{}]},{can_invite:undefined}]){
  response.data=[{...pending,...patch}];await expect(api.list()).rejects.toThrow()
 }
})
test('pending and expired invitations show only safe metadata and expired acceptance stays disabled',async()=>{
 const api=apiFixture([pending,{...pending,group_id:id(22),name:'Expired invitation',invitation_id:id(31),invitation_state:'expired'}]);mount(api)
 const active=(await screen.findByRole('heading',{name:'Safe pending invitation'})).closest('article')!
 const expired=screen.getByRole('heading',{name:'Expired invitation'}).closest('article')!
 expect(within(active).getByRole('button',{name:'Accept'})).toBeEnabled();expect(within(expired).getByRole('button',{name:'Accept'})).toBeDisabled()
 expect(screen.queryByText('Accepted peer')).toBeNull();expect(within(active).getByText(/Actual inviter/)).toBeInTheDocument()
 fireEvent.click(within(expired).getByRole('button',{name:'Decline'}));await waitFor(()=>expect(api.respond).toHaveBeenCalledWith(id(22),id(31),false,expect.any(String)))
})
test('lost creation response retries the original offering, targets and nonce',async()=>{
 const api=apiFixture();vi.mocked(api.create).mockRejectedValueOnce(Error('Response lost'))
 const courses:SavedCourse[]=[{id:'course',databaseId:id(60),code:'CSE 416',section:'01',professorFirstName:'Ada',professorLastName:'Lovelace',verificationStatus:'verified'}]
 mount(api,courses);fireEvent.click(await screen.findByRole('checkbox',{name:/Public classmate/}));fireEvent.click(screen.getByRole('checkbox',{name:/Private friend/}));fireEvent.change(screen.getByLabelText('Group name'),{target:{value:'Original name'}});fireEvent.click(screen.getByRole('button',{name:'Create group and invite'}))
 await screen.findByText('Response lost');fireEvent.change(screen.getByLabelText('Group name'),{target:{value:'Unsaved other name'}});fireEvent.click(screen.getByRole('button',{name:'Retry Study change'}))
 await waitFor(()=>expect(api.create).toHaveBeenCalledTimes(2));expect(vi.mocked(api.create).mock.calls[0]).toEqual(vi.mocked(api.create).mock.calls[1]);expect(vi.mocked(api.create).mock.calls[0][0]).toMatchObject({name:'Original name',professorLastName:'Lovelace'})
})
test('accepted non-owner can invite within remaining capacity and failed retry keeps targets',async()=>{
 const api=apiFixture([{...group,owner_id:id(2),pending_count:5}]);vi.mocked(api.invite).mockRejectedValueOnce(Error('Unavailable'))
 mount(api);fireEvent.click(await screen.findByRole('button',{name:/Shared workspace/}));fireEvent.click(screen.getByText('Invite additional classmates'))
 const picker=await screen.findByRole('region',{name:'Invite additional classmates'});fireEvent.click(await within(picker).findByRole('checkbox',{name:'Public classmate'}));expect(within(picker).getByRole('checkbox',{name:'Private friend'})).toBeDisabled()
 fireEvent.click(within(picker).getByRole('button',{name:'Send invitations'}));await screen.findByText('Unavailable');fireEvent.click(screen.getByRole('button',{name:'Retry Study change'}))
 await waitFor(()=>expect(api.invite).toHaveBeenCalledTimes(2));expect(vi.mocked(api.invite).mock.calls[0]).toEqual(vi.mocked(api.invite).mock.calls[1])
})
test('legacy closed admission retains accepted availability and task controls',async()=>{
 const api=apiFixture([{...group,course_section:null,can_invite:false,tasks:[{id:id(70),title:'Existing note',details:'Keep this',is_complete:false,created_by:self,created_by_name:'You',created_at:group.created_at}]}]);mount(api)
 fireEvent.click(await screen.findByRole('button',{name:/Shared workspace/}));expect(screen.getByText('Existing note')).toBeInTheDocument();expect(screen.getByRole('heading',{name:'Your availability'})).toBeInTheDocument();expect(screen.queryByText('Invite additional classmates')).toBeNull();expect(screen.getByText(/Accepted members can continue collaborating/)).toBeInTheDocument()
})
test('old account response cannot open a private invitation in a replacement account',async()=>{
 let finish!:(rows:StudyGroup[])=>void;const api=apiFixture();vi.mocked(api.list).mockReturnValueOnce(new Promise(resolve=>{finish=resolve}))
 const view=mount(api);view.rerender(<StudyGroups key="replacement" userId={id(8)} courses={[]} api={apiFixture([])} classmatesApi={vi.fn(async()=>[])} onGoToCourses={vi.fn()}/>);finish([pending])
 await waitFor(()=>expect(screen.queryByText('Safe pending invitation')).toBeNull())
})


test('accepted-only roster and independent pending count survive API mapping',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:[{...group,pending_count:3}],error:null})
 const rows=await studyGroupApi({rpc} as unknown as SupabaseClient).list()
 expect(rows[0].members).toHaveLength(2);expect(rows[0].pending_count).toBe(3)
 expect(rows[0].outgoing_invitations).toEqual([])
 expect(rpc).toHaveBeenCalledWith('my_study_groups',undefined)
})

test('cards use authorized pending_count without pending identities and follow refreshed membership data',async()=>{
 const api=apiFixture([{...group,pending_count:2}]);vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');mount(api)
 const card=await screen.findByRole('button',{name:/Shared workspace/})
 expect(card).toHaveTextContent('2 members');expect(card).toHaveTextContent('2 pending')
 expect(screen.queryByText('Accepted peer')).not.toBeInTheDocument()
 vi.mocked(api.list).mockResolvedValue([{...group,pending_count:1,members:[...group.members,{user_id:id(3),name:'New member',status:'accepted',role:'member',study_role:null}]}])
 act(()=>window.dispatchEvent(new Event('student-communication-settings-changed')))
 await waitFor(()=>expect(card).toHaveTextContent('3 members'));expect(card).toHaveTextContent('1 pending')
 vi.mocked(api.list).mockResolvedValue([{...group,pending_count:0}])
 act(()=>window.dispatchEvent(new Event('student-communication-settings-changed')))
 await waitFor(()=>expect(card).toHaveTextContent('0 pending'));expect(card).toHaveTextContent('2 members')
})

test('confirmed additional invitation refreshes card pending count without optimistic changes',async()=>{
 const api=apiFixture();let resolve!:()=>void
 vi.mocked(api.invite).mockImplementationOnce(()=>new Promise<void>(yes=>{resolve=yes}))
 mount(api);const card=await screen.findByRole('button',{name:/Shared workspace/});fireEvent.click(card)
 fireEvent.click(screen.getByText('Invite additional classmates'))
 const picker=await screen.findByRole('region',{name:'Invite additional classmates'})
 fireEvent.click(await within(picker).findByRole('checkbox',{name:'Public classmate'}))
 fireEvent.click(within(picker).getByRole('button',{name:'Send invitations'}))
 expect(card).toHaveTextContent('0 pending')
 vi.mocked(api.list).mockResolvedValue([{...group,pending_count:1}]);await act(async()=>resolve())
 await waitFor(()=>expect(card).toHaveTextContent('1 pending'));expect(card).toHaveTextContent('2 members')
})

test('received and sent invitation expiration uses month names and omits seconds',async()=>{
 const expires=new Date(2026,10,28,19,12,38).toISOString()
 const api=apiFixture([{...pending,expires_at:expires},{...group,pending_count:1,outgoing_invitations:[{student_id:id(3),name:'Known invitee',invitation_id:id(32),expires_at:expires,state:'pending'}]}]);mount(api)
 expect(await screen.findByText(/Expires November 28, 2026 7:12 PM/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:/Shared workspace/}));fireEvent.click(screen.getByText('Your sent invitations'))
 expect(screen.getAllByText(/Expires November 28, 2026 7:12 PM/)).toHaveLength(2)
 expect(screen.queryByText(/7:12:38/)).not.toBeInTheDocument()
})


test('invitation management displays authorized sent rows, states and server-backed capacity',async()=>{
 const expires='2026-11-28T10:00:00Z'
 const api=apiFixture([{...group,pending_count:1,outgoing_invitations:[{student_id:id(3),name:'Known pending invitee',invitation_id:id(34),expires_at:expires,state:'pending'},{student_id:id(4),name:'Known expired invitee',invitation_id:id(35),expires_at:expires,state:'expired'}]}]);mount(api)
 fireEvent.click(await screen.findByRole('button',{name:/Shared workspace/}))
 expect(screen.getByText('2 accepted members')).toBeInTheDocument();expect(screen.getByText('1 pending invitation')).toBeInTheDocument()
 fireEvent.click(screen.getByText('Invite additional classmates'))
 const picker=await screen.findByRole('region',{name:'Invite additional classmates'})
 expect(within(picker).getByText('5 places available')).toBeVisible();expect(within(picker).getByText(/expire after 7 days/)).toBeVisible()
 fireEvent.click(screen.getByText('Your sent invitations'))
 const pendingRow=screen.getByText('Known pending invitee').closest('li')!,expiredRow=screen.getByText('Known expired invitee').closest('li')!
 expect(pendingRow).toBeVisible();expect(within(pendingRow).getByText('Pending')).toBeVisible();expect(within(pendingRow).getByText(/Expires November/)).toBeVisible()
 expect(within(expiredRow).getByText('Expired')).toBeVisible()
 expect(screen.queryByText('Withdraw invitation')).not.toBeInTheDocument()
 fireEvent.click(screen.getByText('Your sent invitations'));expect(pendingRow).not.toBeVisible()
})
