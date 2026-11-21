import './academicDialogSupport'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import Messages from '../src/Messages'
import { MessagingNotifications } from '../src/MessagingNotifications'
import GroupPicker from '../src/GroupPicker'
import GroupMembershipControls from '../src/GroupMembershipControls'
import { conversationKey, groupApi, groupName, parseCombined, parseGroup, parseGroupMessage } from '../src/groupMessaging'
import type { GroupApi, GroupCandidate, GroupDetail } from '../src/groupMessaging'
import type { Message, MessagingApi } from '../src/messaging'
import { messagingApi } from '../src/messaging'
import { unreadApi } from '../src/messagingUnread'
import { useGroupChat } from '../src/useGroupChat'
import { messageSendTimeoutMs } from '../src/useMessaging'
const self='10000000-0000-0000-0000-000000000001',a='10000000-0000-0000-0000-000000000002',b='10000000-0000-0000-0000-000000000003',c='10000000-0000-0000-0000-000000000004',id='20000000-0000-0000-0000-000000000001'
const uuid=(n:number)=>`30000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const names:Record<string,string>={[self]:'Creator',[a]:'Ada',[b]:'Grace',[c]:'Later Friend'}
const initial:GroupDetail={group_id:id,name:'Study group',creator_id:self,addition_permission:'all_members',can_add:true,can_manage:true,can_send:true,joined_after_sequence:0,last_read_sequence:0,members:[self,a,b].map(student_id=>({student_id,name:names[student_id]}))}
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function fixture(){
 let detail={...initial,members:[...initial.members]},rows:Message[]=[],created=false,lost=false,closed=false
 const make=(n:number,sender=a):Message=>({id:uuid(n),conversation_id:id,sequence:n,sender_id:sender,sender_name:names[sender],body:`Group text ${n}`,client_message_id:uuid(n+500),created_at:'2026-10-25T15:00:00Z'})
 const candidates=[a,b,c].map((student_id):GroupCandidate=>({student_id,name:names[student_id],major:'Math',can_add:true,reason:null}))
 const groups:GroupApi={leave:vi.fn(async()=>{detail={...detail,members:detail.members.filter(m=>m.student_id!==self)};created=false}),setPermission:vi.fn(async(_id,permission)=>{detail={...detail,addition_permission:permission};return detail}),candidates:vi.fn(async(search,_signal,_before,group)=>candidates.filter(row=>row.name.toLowerCase().includes(search.toLowerCase())&&(!group||!detail.members.some(m=>m.student_id===row.student_id)))),detail:vi.fn(async()=>detail),create:vi.fn(async(name,students,_request,permission='all_members')=>{if(closed)throw Error('A selected friend does not allow group additions.');if(!created){detail={...initial,name:name||'Study group',addition_permission:permission,members:[self,...students].map(student_id=>({student_id,name:names[student_id]}))};created=true}if(lost){lost=false;throw Error('Response lost')}return detail}),add:vi.fn(async(_id,students)=>{if(closed)throw Error('A selected friend does not allow group additions.');for(const student_id of students)if(!detail.members.some(m=>m.student_id===student_id))detail={...detail,members:[...detail.members,{student_id,name:names[student_id]}]};return detail}),history:vi.fn(async(_id,_signal,before,after)=>{const filtered=rows.filter(row=>row.sequence>detail.joined_after_sequence&&(before===undefined||row.sequence<before)&&(after===undefined||row.sequence>after));return after===undefined?filtered.slice(-50):filtered.slice(0,50)}),send:vi.fn(async(_id,body,request)=>{const old=rows.find(row=>row.client_message_id===request);if(old)return old;const row={...make(rows.length+1,self),body,client_message_id:request};rows.push(row);if(lost){lost=false;throw Error('Response lost')}return row})}
 const api:MessagingApi={groups,contact:vi.fn(),inbox:vi.fn(async()=>created?[{kind:'group',conversation_id:id,student_id:null,name:detail.name,member_count:detail.members.length,last_message_at:'2026-10-25T15:00:00Z',message_time:rows.at(-1)?.created_at??null,preview:rows.at(-1)?.body??null}]:[]),history:vi.fn(),send:vi.fn()}
 return {api,groups,get detail(){return detail},setDetail:(value:GroupDetail)=>{detail=value},get rows(){return rows},seed:(n:number)=>{created=true;rows=Array.from({length:n},(_,i)=>make(i+1))},lose:()=>{lost=true},close:()=>{closed=true},incoming:()=>{rows.push(make(rows.length+1))}}
}
test('strict group projections strip private fields and reject invalid identity, sequence, sender and kinds',()=>{
 expect(parseGroup({...initial,email:'private'})).toEqual(initial)
 for(const value of [{...initial,group_id:'bad'},{...initial,last_read_sequence:-1},{...initial,members:[initial.members[0],initial.members[0]]}])expect(()=>parseGroup(value)).toThrow()
 expect(()=>parseGroup(initial,uuid(7))).toThrow();expect(groupName(' 😀 ')).toBe('😀');expect(()=>groupName('😀'.repeat(81))).toThrow()
 const raw={id:uuid(1),group_id:id,sender_id:null,sender_name:'Unavailable student',sequence:1,client_message_id:uuid(2),body:'<script>text</script>\n😀',created_at:'2026-10-25T15:00:00Z'}
 expect(parseGroupMessage(raw,id)).toMatchObject({sender_id:null,sender_name:'Unavailable student'});expect(()=>parseGroupMessage({...raw,sender_id:'forged'},id)).toThrow()
 const row={kind:'group',conversation_id:id,student_id:null,name:'Group',member_count:3,last_message_at:raw.created_at,message_time:null,preview:null}
 expect(parseCombined(row)).toMatchObject({kind:'group',preview:null});expect(()=>parseCombined({...row,student_id:a})).toThrow();expect(()=>parseCombined({...row,kind:'direct'})).toThrow();expect(conversationKey(id,'group')).not.toBe(conversationKey(id,'direct'))
})
test('adapters forward caller-scoped group parameters, validate responses and route combined fallback only for missing schema',async()=>{
 const response:{data:unknown;error:null|{code:string}}={data:initial,error:null}
 const abortSignal=vi.fn(async()=>response),rpc=vi.fn(()=>({...response,abortSignal})),client={rpc} as unknown as SupabaseClient,api=groupApi(client),signal=new AbortController().signal
 await api.create(' Study group ',[a,b],uuid(1));expect(rpc).toHaveBeenLastCalledWith('group_create_configured',{p_name:'Study group',p_members:[a,b],p_request_id:uuid(1),p_addition_permission:'all_members'})
 await expect(api.create('',[a],uuid(1))).rejects.toThrow('students');await expect(api.history(id,signal,2,3)).rejects.toThrow('cursor')
 response.data={...initial,group_id:uuid(99)};await expect(api.detail(id,signal)).rejects.toThrow()
 response.error={code:'PGRST202'};await expect(api.detail(id,signal)).rejects.toThrow('not set up')
 const calls:string[]=[];const fallbackClient={rpc:(name:string)=>{calls.push(name);return {abortSignal:async()=>name==='messaging_inbox'?{data:null,error:{code:'PGRST202'}}:{data:[],error:null}}}} as unknown as SupabaseClient
 expect(await messagingApi(fallbackClient).inbox(signal)).toEqual([]);expect(calls).toEqual(['messaging_inbox','dm_inbox'])
 const failed={rpc:()=>({abortSignal:async()=>({data:null,error:{code:'42501'}})})} as unknown as SupabaseClient;await expect(messagingApi(failed).inbox(signal)).rejects.toThrow('unavailable')
})
test('combined unread isolates identical direct/group IDs and routes read acknowledgements',async()=>{
 const rpc=vi.fn((name:string)=>({abortSignal:async()=>({data:[{kind:'direct',conversation_id:id,count:2},{kind:'group',conversation_id:id,count:3}],error:null}),error:null,name}))
 const api=unreadApi({rpc} as unknown as SupabaseClient);expect(await api.load(new AbortController().signal)).toEqual({[`direct:${id}`]:2,[`group:${id}`]:3})
 await api.read(`group:${id}`,4);expect(rpc).toHaveBeenLastCalledWith('group_mark_read',{p_group_id:id,p_sequence:4});await api.read(`direct:${id}`,5);expect(rpc).toHaveBeenLastCalledWith('dm_mark_read',{p_conversation_id:id,p_sequence:5})
})
test('picker requires two students, preserves search selections, and Cancel never writes',async()=>{
 const f=fixture(),close=vi.fn();render(<GroupPicker api={f.groups} onClose={close} onDone={vi.fn()}/> )
 const create=screen.getByRole('button',{name:'Create group'});expect(create).toBeDisabled();fireEvent.click(await screen.findByRole('checkbox',{name:/Ada/}));expect(create).toBeDisabled()
 fireEvent.change(screen.getByRole('textbox',{name:'Search students'}),{target:{value:'Grace'}});fireEvent.click(await screen.findByRole('checkbox',{name:/Grace/}));expect(create).toBeEnabled();expect(screen.getByText(/2 selected/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(close).toHaveBeenCalledOnce();expect(f.groups.create).not.toHaveBeenCalled()
})
test('unavailable students are disabled and a failed student page retry preserves selected people',async()=>{
 const f=fixture();vi.mocked(f.groups.candidates).mockResolvedValueOnce([{student_id:a,name:'Ada',major:null,can_add:true,reason:null},{student_id:b,name:'Grace',major:null,can_add:false,reason:'closed'}]).mockRejectedValueOnce(new Error('Offline'))
 render(<GroupPicker api={f.groups} onClose={vi.fn()} onDone={vi.fn()}/>);fireEvent.click(await screen.findByRole('checkbox',{name:/Ada/}));expect(screen.getByRole('checkbox',{name:/Grace/})).toBeDisabled()
 fireEvent.change(screen.getByRole('textbox',{name:'Search students'}),{target:{value:'Grace'}});await screen.findByText('Offline');expect(screen.getByText(/1 selected/)).toBeInTheDocument();fireEvent.click(screen.getByText('Retry students'));await screen.findByRole('checkbox',{name:/Grace/});expect(screen.getByText(/1 selected/)).toBeInTheDocument()
})
test('committed creation with a lost response retries exactly and opens the group after modal cleanup',async()=>{
 const f=fixture();f.lose();render(<Messages api={f.api} userId={self} initialTarget={null}/>);fireEvent.click(screen.getByText('New group'))
 fireEvent.click(await screen.findByRole('checkbox',{name:/Ada/}));fireEvent.click(screen.getByRole('checkbox',{name:/Grace/}));fireEvent.change(screen.getByRole('textbox',{name:'Group name (optional)'}),{target:{value:'Study group'}});fireEvent.click(screen.getByText('Create group'))
 await screen.findByText('Retry creation');expect(screen.getByRole('textbox',{name:'Group name (optional)'})).toBeDisabled();fireEvent.click(screen.getByText('Retry creation'))
 await waitFor(()=>expect(screen.getByRole('heading',{name:'Study group'})).toHaveFocus());expect(document.querySelector('dialog[open]')).toBeNull();expect(vi.mocked(f.groups.create).mock.calls[0]).toEqual(vi.mocked(f.groups.create).mock.calls[1])
 const input=screen.getByRole('textbox',{name:'Message'});fireEvent.change(input,{target:{value:'<b>Literal</b>\n😀'}});fireEvent.keyDown(input,{key:'Enter'});await waitFor(()=>expect(input).toHaveValue(''));expect(f.rows).toHaveLength(1);expect(document.querySelector('.dm-message b')).toBeNull()
 fireEvent.click(screen.getByText('Add members'));fireEvent.click(await screen.findByRole('checkbox',{name:/Later Friend/}));fireEvent.click(screen.getByText('Add selected members'));await waitFor(()=>expect(document.querySelector('dialog[open]')).toBeNull());await screen.findByText('Members (4)')
})
test('late members only see post-join text and cannot add in Creator Only mode',async()=>{
 const f=fixture();f.seed(6);f.setDetail({...initial,addition_permission:'creator_only',can_add:false,can_manage:false,joined_after_sequence:5,last_read_sequence:5,members:[...initial.members,{student_id:c,name:names[c]}]})
 render(<Messages api={f.api} userId={c} initialTarget={null}/>);fireEvent.click(await screen.findByRole('button',{name:/Study group/}));await screen.findByText('Group text 6');expect(screen.queryByText('Group text 5')).toBeNull();expect(screen.queryByText('Add members')).toBeNull();expect(document.querySelector('.dm-author')).toHaveTextContent('Ada')
})
test('group hook refuses pre-join or outsider senders and keeps failed retry payload immutable',async()=>{
 const f=fixture();f.setDetail({...initial,joined_after_sequence:5,last_read_sequence:5});vi.mocked(f.groups.history).mockResolvedValueOnce([{id:uuid(1),conversation_id:id,sequence:5,sender_id:a,sender_name:'Ada',body:'Secret',client_message_id:uuid(2),created_at:'2026-10-25T15:00:00Z'}])
 const {result}=renderHook(()=>useGroupChat(f.groups,id,self,0,vi.fn()));await waitFor(()=>expect(result.current.error).toContain('ownership'));expect(result.current.messages).toEqual([])
})
test('history older-page failure retries same cursor and group catch-up traverses multiple pages',async()=>{
 const f=fixture();f.seed(65);const {result,rerender}=renderHook(({epoch})=>useGroupChat(f.groups,id,self,epoch,vi.fn()),{initialProps:{epoch:0}})
 await waitFor(()=>expect(result.current.messages).toHaveLength(50));vi.mocked(f.groups.history).mockRejectedValueOnce(Error('Offline'));await act(()=>result.current.loadOlder());await act(()=>result.current.loadOlder());expect(result.current.messages).toHaveLength(65);expect(vi.mocked(f.groups.history).mock.calls.slice(-2).map(call=>call[2])).toEqual([16,16])
 for(let n=0;n<105;n++)f.incoming();rerender({epoch:1});await waitFor(()=>expect(result.current.messages).toHaveLength(170))
 act(()=>result.current.setDraft('Saved despite lost acknowledgement'));f.lose();await act(()=>result.current.send());expect(result.current.attempt?.status).toBe('failed');await act(()=>result.current.send(true));expect(result.current.draft).toBe('');expect(f.rows).toHaveLength(171)
})
test('group sends recover from a stalled request using the same message ID', async () => {
 const f=fixture(),stalled=deferred<Message>();f.seed(1)
 vi.mocked(f.groups.send).mockReturnValueOnce(stalled.promise)
 const {result,unmount}=renderHook(()=>useGroupChat(f.groups,id,self,0,vi.fn()))
 await waitFor(()=>expect(result.current.messages).toHaveLength(1))
 vi.useFakeTimers()
 try {
  act(()=>result.current.setDraft('Study at six?'))
  act(()=>{void result.current.send()})
  await act(async()=>{await vi.advanceTimersByTimeAsync(messageSendTimeoutMs)})
  expect(result.current.attempt?.status).toBe('failed');expect(result.current.draft).toBe('Study at six?')
  await act(async()=>{await result.current.send(true)})
  expect(vi.mocked(f.groups.send).mock.calls[0]).toEqual(vi.mocked(f.groups.send).mock.calls[1])
  expect(f.rows).toHaveLength(2);expect(result.current.draft).toBe('')
  await act(async()=>{stalled.resolve(f.rows[1])})
  expect(result.current.messages).toHaveLength(2)
  unmount();expect(vi.getTimerCount()).toBe(0)
 } finally { vi.useRealTimers() }
})
test('late creation result and private selection never enter a replacement account',async()=>{
 const f=fixture(),pending=deferred<GroupDetail>();vi.mocked(f.groups.create).mockReturnValueOnce(pending.promise)
 const {rerender}=render(<Messages key="a" api={f.api} userId={self} initialTarget={null}/>);fireEvent.click(screen.getByText('New group'));fireEvent.click(await screen.findByRole('checkbox',{name:/Ada/}));fireEvent.click(screen.getByRole('checkbox',{name:/Grace/}));fireEvent.change(screen.getByRole('textbox',{name:'Group name (optional)'}),{target:{value:'Private old title'}});fireEvent.click(screen.getByText('Create group'))
 const other=fixture();rerender(<Messages key="b" api={other.api} userId={c} initialTarget={null}/>);await act(async()=>pending.resolve(initial));expect(document.querySelector('dialog[open]')).toBeNull();expect(screen.queryByText('Private old title')).toBeNull();expect(screen.queryByRole('textbox')).toBeNull()
})

test('a native group picker does not mark covered incoming history read',async()=>{
 const f=fixture();f.seed(2);const notifications={load:vi.fn(async()=>({})),read:vi.fn(async()=>{})}
 render(<MessagingNotifications userId={self} api={notifications}><Messages api={f.api} userId={self} initialTarget={null}/></MessagingNotifications>)
 fireEvent.click(await screen.findByRole('button',{name:/Study group/}));await screen.findByRole('textbox',{name:'Message'});await waitFor(()=>expect(notifications.read).toHaveBeenCalledWith('group:'+id,2));notifications.read.mockClear()
 fireEvent.click(screen.getByText('Add members'));await screen.findByRole('dialog');act(()=>{f.incoming();window.dispatchEvent(new Event('focus'))})
 await waitFor(()=>expect(document.querySelectorAll('.dm-message')).toHaveLength(3));expect(notifications.read).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));await waitFor(()=>expect(notifications.read).toHaveBeenCalledWith('group:'+id,3))
})
test('student page failure retries the same cursor without losing selections',async()=>{
 const f=fixture(),first=Array.from({length:50},(_,n):GroupCandidate=>({student_id:uuid(100+n),name:`Friend ${n}`,major:null,can_add:true,reason:null}))
 vi.mocked(f.groups.candidates).mockResolvedValueOnce(first).mockRejectedValueOnce(Error('Page offline')).mockResolvedValueOnce([{student_id:c,name:'Later Friend',major:null,can_add:true,reason:null}])
 render(<GroupPicker api={f.groups} onClose={vi.fn()} onDone={vi.fn()}/>);fireEvent.click(await screen.findByRole('checkbox',{name:/^Friend 0/}));fireEvent.click(screen.getByText('Load more students'));await screen.findByText('Page offline');fireEvent.click(screen.getByText('Load more students'));await screen.findByRole('checkbox',{name:/Later Friend/})
 expect(screen.getByText(/1 selected/)).toBeInTheDocument();expect(vi.mocked(f.groups.candidates).mock.calls.slice(-2).map(call=>call[2]?.student_id)).toEqual([uuid(149),uuid(149)])
})
test('group retry reconciles incoming confirmation and ignores the later lost response',async()=>{
 const f=fixture();f.seed(1);const pending=deferred<Message>(),{result,rerender}=renderHook(({epoch})=>useGroupChat(f.groups,id,self,epoch,vi.fn()),{initialProps:{epoch:0}})
 await waitFor(()=>expect(result.current.messages).toHaveLength(1));act(()=>result.current.setDraft('Saved once'));f.lose();await act(()=>result.current.send());expect(result.current.attempt?.status).toBe('failed')
 vi.mocked(f.groups.send).mockReturnValueOnce(pending.promise);let sending!:Promise<void>;act(()=>{sending=result.current.send(true)});rerender({epoch:1});await waitFor(()=>expect(result.current.attempt).toBeNull());expect(result.current.messages).toHaveLength(2)
 await act(async()=>{pending.reject(Error('Late error'));await sending});expect(result.current.error).toBe('');expect(result.current.draft).toBe('')
})

test('self-leave replaces peer removal, safely retries and clears the active conversation',async()=>{
 const f=fixture();f.seed(1);vi.mocked(f.groups.leave).mockRejectedValueOnce(Error('Offline'))
 render(<Messages api={f.api} userId={self} initialTarget={null}/> )
 fireEvent.click(await screen.findByRole('button',{name:/Study group/}));await screen.findByText('Group text 1',{selector:'.dm-message p'})
 expect(screen.queryByRole('button',{name:'Remove Ada'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Leave Group'}));await screen.findByText('Offline')
 fireEvent.click(screen.getByRole('button',{name:'Retry group change'}))
 await waitFor(()=>expect(screen.queryByRole('textbox',{name:'Message'})).toBeNull())
 expect(f.groups.leave).toHaveBeenCalledTimes(2);expect(vi.mocked(f.groups.leave).mock.calls[0]).toEqual(vi.mocked(f.groups.leave).mock.calls[1])
 expect(screen.queryByRole('button',{name:/Study group/})).toBeNull()
})
test('non-creators cannot remove members and revoked membership clears cached history and draft',async()=>{
 const f=fixture();f.seed(1);const {result,rerender}=renderHook(({epoch})=>useGroupChat(f.groups,id,a,epoch,vi.fn()),{initialProps:{epoch:0}});
 await waitFor(()=>expect(result.current.messages).toHaveLength(1));act(()=>result.current.setDraft('Private draft'));
 vi.mocked(f.groups.detail).mockRejectedValue(Object.assign(Error('Group access or accepted friendship is unavailable.'),{code:'42501'}));rerender({epoch:1});
 await waitFor(()=>expect(result.current.contact).toBeNull());expect(result.current.messages).toEqual([]);expect(result.current.draft).toBe('');
})
test('membership adapters use session-scoped permission and self-leave RPCs',async()=>{
 const rpc=vi.fn(async()=>({data:initial,error:null}));const api=groupApi({rpc} as unknown as SupabaseClient)
 await api.setPermission(id,'all_members',uuid(6));expect(rpc).toHaveBeenLastCalledWith('group_set_addition_permission',{p_group_id:id,p_permission:'all_members',p_request_id:uuid(6)})
 await api.leave(id,uuid(7));expect(rpc).toHaveBeenLastCalledWith('group_leave',{p_group_id:id,p_request_id:uuid(7)})
 await expect(api.leave('bad',uuid(7))).rejects.toThrow('Invalid')
})

test('rejoining resets cached history even when removal was missed between refreshes',async()=>{
 const f=fixture();f.seed(3);const {result,rerender}=renderHook(({epoch})=>useGroupChat(f.groups,id,self,epoch,vi.fn()),{initialProps:{epoch:0}});
 await waitFor(()=>expect(result.current.messages).toHaveLength(3));
 f.setDetail({...initial,joined_after_sequence:3,last_read_sequence:3});f.incoming();rerender({epoch:1});
 await waitFor(()=>expect(result.current.messages.map(row=>row.sequence)).toEqual([4]));expect(result.current.more).toBe(false);
})
test('non-creator member list has no removal controls and inbox drops a removed group on refresh',async()=>{
 const f=fixture();f.seed(1);render(<Messages api={f.api} userId={a} initialTarget={null}/>);
 fireEvent.click(await screen.findByRole('button',{name:/Study group/}));await screen.findByRole('textbox',{name:'Message'});
 expect(screen.queryByRole('button',{name:/Remove /})).not.toBeInTheDocument();
 vi.mocked(f.api.inbox).mockResolvedValue([]);vi.mocked(f.groups.detail).mockRejectedValue(Object.assign(Error('Group access unavailable'),{code:'42501'}));
 fireEvent.focus(window);await waitFor(()=>expect(screen.queryByRole('button',{name:/Study group/})).not.toBeInTheDocument());await waitFor(()=>expect(screen.queryByRole('textbox',{name:'Message'})).not.toBeInTheDocument());
})

test('creation defaults to All Members and freezes Creator Only across a lost-response retry',async()=>{
 const f=fixture();f.lose();render(<GroupPicker api={f.groups} onClose={vi.fn()} onDone={vi.fn()}/> )
 const selector=screen.getByRole('combobox',{name:'Who can add members'});expect(selector).toHaveValue('all_members')
 fireEvent.change(selector,{target:{value:'creator_only'}})
 fireEvent.click(await screen.findByRole('checkbox',{name:/Ada/}));fireEvent.click(screen.getByRole('checkbox',{name:/Grace/}));fireEvent.click(screen.getByText('Create group'))
 await screen.findByText('Retry creation');expect(selector).toBeDisabled();fireEvent.click(screen.getByText('Retry creation'))
 await waitFor(()=>expect(f.groups.create).toHaveBeenCalledTimes(2));expect(vi.mocked(f.groups.create).mock.calls[0]).toEqual(vi.mocked(f.groups.create).mock.calls[1]);expect(vi.mocked(f.groups.create).mock.calls[0][3]).toBe('creator_only')
})

test('only unrevoked active creator gets settings and failed settings retry preserves nonce and mode',async()=>{
 const f=fixture(),changed=vi.fn();vi.mocked(f.groups.setPermission).mockRejectedValueOnce(Error('Offline'))
 const {rerender}=render(<GroupMembershipControls api={f.groups} group={initial} onChanged={changed} onLeft={vi.fn()}/> )
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'creator_only'}});fireEvent.click(screen.getByText('Save group setting'))
 await screen.findByText('Offline');expect(screen.getByRole('combobox')).toBeDisabled();fireEvent.click(screen.getByText('Retry group change'))
 await waitFor(()=>expect(changed).toHaveBeenCalledOnce());expect(vi.mocked(f.groups.setPermission).mock.calls[0]).toEqual(vi.mocked(f.groups.setPermission).mock.calls[1])
 rerender(<GroupMembershipControls api={f.groups} group={{...initial,can_manage:false}} onChanged={changed} onLeft={vi.fn()}/> )
 expect(screen.queryByRole('combobox')).toBeNull();expect(screen.getByText('Leave Group')).toBeEnabled()
})

test('small groups keep history and draft read-only, and regain sending after eligibility is restored',async()=>{
 const f=fixture();f.seed(1);const {result,rerender}=renderHook(({epoch})=>useGroupChat(f.groups,id,self,epoch,vi.fn()),{initialProps:{epoch:0}})
 await waitFor(()=>expect(result.current.messages).toHaveLength(1));act(()=>result.current.setDraft('Keep my draft'))
 f.setDetail({...initial,can_send:false});rerender({epoch:1});await waitFor(()=>expect(result.current.contact?.can_send).toBe(false))
 expect(result.current.draft).toBe('Keep my draft');expect(result.current.messages).toHaveLength(1);await act(()=>result.current.send());expect(f.groups.send).not.toHaveBeenCalled()
 f.setDetail(initial);rerender({epoch:2});await waitFor(()=>expect(result.current.contact?.can_send).toBe(true));expect(result.current.draft).toBe('Keep my draft')
})

test('legacy group projections fail closed until the matching database migration is installed',()=>{
 const {can_send: omitted,...legacy}=initial;void omitted
 expect(()=>parseGroup(legacy)).toThrow()
})
