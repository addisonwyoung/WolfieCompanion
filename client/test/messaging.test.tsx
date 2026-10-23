import './academicDialogSupport'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import Messages from '../src/Messages'
import FriendProfileDialog from '../src/FriendProfileDialog'
import type { FriendApi } from '../src/friendshipApi'
import MessageProfileAction from '../src/MessageProfileAction'
import { messagingApi, parseContact, parseMessage, validateMessage } from '../src/messaging'
import type { Contact, Conversation, Message, MessagingApi } from '../src/messaging'
import { mergeMessages, useDirectChat, useMessageInbox, useMessagingRefresh } from '../src/useMessaging'
const self='10000000-0000-0000-0000-000000000001',peer='10000000-0000-0000-0000-000000000002',thread='20000000-0000-0000-0000-000000000001'
const id=(n:number)=>`30000000-0000-0000-0000-${String(n).padStart(12,'0')}`
function message(n=1):Message{return {id:id(n),conversation_id:thread,sequence:n,sender_id:peer,client_message_id:id(n+500),body:`Saved message ${n}`,created_at:'2026-10-23T20:00:00Z'}}
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function fixture(seed:Message[]=[]){
 const rows=[...seed];let open=true,lost=false
 const contact:Contact={student_id:peer,name:'Classmate Peer',conversation_id:rows.length?thread:null,can_send:true,reason:null}
 const api:MessagingApi={contact:vi.fn(async()=>({...contact,conversation_id:rows.length?thread:null,can_send:open||rows.length>0,reason:!open&&!rows.length?'closed':null})),inbox:vi.fn(async()=>rows.length?[{conversation_id:thread,student_id:peer,name:'Classmate Peer',last_message_at:rows.at(-1)!.created_at,preview:rows.at(-1)!.body}]:[]),history:vi.fn(async(_id,_signal,before,after)=>rows.filter(row=>(before===undefined||row.sequence<before)&&(after===undefined||row.sequence>after)).slice(after===undefined?-50:0,after===undefined?undefined:50)),send:vi.fn(async(target,body,request)=>{validateMessage(body);const existing=rows.find(row=>row.client_message_id===request&&row.sender_id===self);if(existing)return existing;if(!open&&!rows.length)throw new Error('This person has closed new direct messages.');const next={...message(rows.length+1),sender_id:self,body,client_message_id:request};rows.push(next);if(lost){lost=false;throw new Error('Response lost')}return next})}
 return {api,get rows(){return rows},setOpen:(value:boolean)=>{open=value},loseNext:()=>{lost=true},incoming:(body:string)=>{const next={...message(rows.length+1),body};rows.push(next)}}
}
afterEach(()=>vi.useRealTimers())
test('plain Unicode validation and strict projection parsers reject malformed identities and payloads',()=>{
 validateMessage('😀'.repeat(2000));validateMessage('<script>literal</script>\nhello')
 for(const body of ['','\n\t\u00a0\ufeff','😀'.repeat(2001),'\0'])expect(()=>validateMessage(body)).toThrow()
 const row=message();expect(parseMessage({...row,email:'secret'},thread)).toEqual(row)
 for(const bad of [{...row,sequence:0},{...row,sender_id:'forged'},{...row,body:' '},{...row,created_at:'bad'}])expect(()=>parseMessage(bad,thread)).toThrow()
 expect(()=>parseMessage(row,id(9))).toThrow()
 expect(()=>parseContact({student_id:peer,name:'Peer',conversation_id:null,can_send:true,reason:'closed'},peer)).toThrow()
 expect(()=>parseContact({student_id:self,name:'Peer',conversation_id:null,can_send:true,reason:null},peer)).toThrow()
 expect(mergeMessages([message(1),message(2)],[message(2),message(3)]).map(row=>row.sequence)).toEqual([1,2,3])
})
test('adapter forwards authenticated RPC parameters, validates confirmations and safe errors',async()=>{
 const response:{data:unknown;error:null|{code:string}}={data:[message()],error:null}
 const abortSignal=vi.fn(async()=>response),rpc=vi.fn(()=>({...response,abortSignal}))
 const api=messagingApi({rpc} as unknown as SupabaseClient),signal=new AbortController().signal
 expect(await api.history(thread,signal)).toEqual([message()]);expect(abortSignal).toHaveBeenCalledWith(signal)
 expect(rpc).toHaveBeenLastCalledWith('dm_history',{p_conversation_id:thread,p_before_sequence:null,p_after_sequence:null,p_limit:50})
 await expect(api.history(thread,signal,0)).rejects.toThrow('cursor');await expect(api.history(thread,signal,2,3)).rejects.toThrow('cursor')
 response.data=[{...message(),conversation_id:id(7)}];await expect(api.history(thread,signal)).rejects.toThrow()
 response.data=Array.from({length:51},()=>message());await expect(api.history(thread,signal)).rejects.toThrow('page')
 response.data={...message(),client_message_id:id(700),body:'Hello'}
 await expect(api.send({student:peer,course:'CSE 101'},'Hello',id(700))).resolves.toMatchObject({body:'Hello'})
 expect(rpc).toHaveBeenLastCalledWith('dm_send_message',{p_student_id:peer,p_body:'Hello',p_client_message_id:id(700),p_course_code:'CSE 101'})
 await expect(api.send({student:peer},'Changed',id(700))).rejects.toThrow('confirmed')
 for(const [code,copy] of [['P0001','closed'],['42501','unavailable'],['42P01','not set up'],['unknown','retry']]){response.error={code};await expect(api.contact({student:peer},signal)).rejects.toThrow(copy)}
})
test('text UI persists confirmed rows across close, renders literal markup, and keyboard sends',async()=>{
 const store=fixture();render(<Messages api={store.api} userId={self} initialTarget={{student:peer,course:'CSE101'}}/> )
 const input=await screen.findByRole('textbox',{name:'Message'});const body='<img src=x onerror=alert(1)>\n😀 Hello'
 fireEvent.change(input,{target:{value:body}});fireEvent.keyDown(input,{key:'Enter',shiftKey:true});expect(store.api.send).not.toHaveBeenCalled()
 fireEvent.keyDown(input,{key:'Enter',isComposing:true});expect(store.api.send).not.toHaveBeenCalled()
 fireEvent.keyDown(input,{key:'Enter'});await waitFor(()=>expect(input).toHaveValue(''))
 expect(document.querySelector('.dm-message p')).toHaveTextContent('<img src=x onerror=alert(1)>');expect(document.querySelector('.dm-message img')).toBeNull()
 expect(document.querySelector('.dm-message time')).toHaveTextContent(new Date('2026-10-23T20:00:00Z').toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}))
 fireEvent.change(input,{target:{value:'Second'}});fireEvent.keyDown(input,{key:'Enter',metaKey:true});await waitFor(()=>expect(store.rows).toHaveLength(2))
 fireEvent.change(input,{target:{value:'Unsent'}});fireEvent.click(screen.getByRole('button',{name:'Back to conversations'}))
 fireEvent.click(await screen.findByRole('button',{name:/Classmate Peer.*Second/}));await waitFor(()=>expect(screen.getByRole('textbox')).toHaveValue(''))
 expect(document.querySelectorAll('.dm-message')).toHaveLength(2);expect(store.rows).toHaveLength(2)
})
test('lost send acknowledgement retains immutable retry identity and merges duplicate confirmation once',async()=>{
 const store=fixture();store.loseNext();render(<Messages api={store.api} userId={self} initialTarget={{student:peer}}/> )
 const input=await screen.findByRole('textbox');fireEvent.change(input,{target:{value:'Delivered despite lost response'}})
 fireEvent.click(screen.getByRole('button',{name:'Send',exact:true}));await screen.findByRole('button',{name:'Retry send'})
 expect(input).toHaveAttribute('readonly');expect(input).toHaveValue('Delivered despite lost response');expect(store.rows).toHaveLength(1)
 fireEvent.click(screen.getByRole('button',{name:'Retry send'}));await waitFor(()=>expect(input).toHaveValue(''))
 expect(store.rows).toHaveLength(1);expect(document.querySelectorAll('.dm-message')).toHaveLength(1)
 const calls=vi.mocked(store.api.send).mock.calls;expect(calls[0]).toEqual(calls[1])
})
test('recipient closure after opening rejects first send; failed attempts can be discarded',async()=>{
 const store=fixture();render(<Messages api={store.api} userId={self} initialTarget={{student:peer}}/> )
 const input=await screen.findByRole('textbox');store.setOpen(false);fireEvent.change(input,{target:{value:'Rejected'}})
 fireEvent.click(screen.getByRole('button',{name:'Send',exact:true}));await screen.findByRole('button',{name:'Retry send'});expect(store.rows).toHaveLength(0)
 fireEvent.click(screen.getByRole('button',{name:'Discard draft'}));expect(input).toHaveValue('');expect(input).not.toHaveAttribute('readonly')
})
test('history pages retry without advancing cursor and catch up across multiple missed pages',async()=>{
 const store=fixture(Array.from({length:65},(_,i)=>message(i+1)));const {result,rerender}=renderHook(({epoch})=>useDirectChat(store.api,{student:peer},self,epoch,vi.fn()),{initialProps:{epoch:0}})
 await waitFor(()=>expect(result.current.messages).toHaveLength(50));expect(result.current.messages[0].sequence).toBe(16)
 vi.mocked(store.api.history).mockRejectedValueOnce(new Error('Offline'));await act(()=>result.current.loadOlder());expect(result.current.messages).toHaveLength(50)
 await act(()=>result.current.loadOlder());expect(result.current.messages).toHaveLength(65)
 expect(vi.mocked(store.api.history).mock.calls.slice(-2).map(call=>call[2])).toEqual([16,16])
 for(let i=0;i<105;i++)store.incoming(`Missed ${i}`)
 rerender({epoch:1});await waitFor(()=>expect(result.current.messages).toHaveLength(170));expect(result.current.messages.at(-1)?.sequence).toBe(170)
})
test('pending duplicate activation is suppressed and late account results are abandoned',async()=>{
 const store=fixture(),pending=deferred<Message>();vi.mocked(store.api.send).mockReturnValue(pending.promise)
 const {result,unmount}=renderHook(()=>useDirectChat(store.api,{student:peer},self,0,vi.fn()))
 await waitFor(()=>expect(result.current.contact).toBeTruthy());act(()=>result.current.setDraft('Pending'))
 let sending!:Promise<void>;act(()=>{sending=result.current.send();void result.current.send()});expect(store.api.send).toHaveBeenCalledTimes(1)
 unmount();await act(async()=>{pending.resolve({...message(),sender_id:self});await sending})
 const other=fixture();render(<Messages key="other" api={other.api} userId={id(9)} initialTarget={null}/>);expect(screen.queryByRole('textbox')).toBeNull();expect(screen.queryByText('Pending')).toBeNull()
})
test('inbox keyset failure retries same cursor and merges activity without duplicate threads',async()=>{
 const page=Array.from({length:50},(_,i):Conversation=>({conversation_id:id(i+1),student_id:peer,name:'Peer',preview:'Text',last_message_at:`2026-10-23T20:00:${String(59-i).padStart(2,'0')}Z`}))
 const store=fixture();vi.mocked(store.api.inbox).mockResolvedValueOnce(page).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([{...page[0],conversation_id:id(60)}])
 const {result}=renderHook(()=>useMessageInbox(store.api,0));await waitFor(()=>expect(result.current.rows).toHaveLength(50))
 await act(()=>result.current.loadMore());expect(result.current.error).toContain('retry');await act(()=>result.current.loadMore());expect(result.current.rows).toHaveLength(51)
 expect(vi.mocked(store.api.inbox).mock.calls.slice(-2).map(call=>call[1]?.conversation_id)).toEqual([id(50),id(50)])
})
test('profile message action distinguishes loading, closure, saved history and isolated failure',async()=>{
 const store=fixture(),onMessage=vi.fn();store.setOpen(false)
 const {rerender}=render(<MessageProfileAction api={store.api} target={{student:peer}} onMessage={onMessage}/> )
 await waitFor(()=>expect(screen.getByRole('button',{name:'Message'})).toBeDisabled());expect(onMessage).not.toHaveBeenCalled()
 store.incoming('Saved');rerender(<MessageProfileAction key="existing" api={store.api} target={{student:peer}} onMessage={onMessage}/> )
 await waitFor(()=>expect(screen.getByRole('button',{name:'Message'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Message'}));expect(onMessage).toHaveBeenCalledWith({student:peer})
 vi.mocked(store.api.contact).mockRejectedValueOnce(new Error('Messaging offline'));rerender(<MessageProfileAction key="failed" api={store.api} target={{student:peer}} onMessage={onMessage}/> )
 await screen.findByRole('button',{name:'Retry messaging'});expect(screen.queryByRole('button',{name:'Message'})).toBeNull()
})
test('refresh combines events, visible polling and reconnect; hidden/unmounted views release subscriptions',async()=>{
 vi.useFakeTimers();let event!:()=>void;let subscribed!:(status:string)=>void
 const channel={on:vi.fn((_kind,_filter,callback)=>{event=callback;return channel}),subscribe:vi.fn(callback=>{subscribed=callback;return channel})}
 const client={channel:vi.fn(()=>channel),removeChannel:vi.fn()};const {result,unmount}=renderHook(()=>useMessagingRefresh(client as unknown as SupabaseClient))
 const initial=result.current.epoch;act(()=>{event();event();subscribed('SUBSCRIBED');vi.advanceTimersByTime(10_000);window.dispatchEvent(new Event('online'))});expect(result.current.epoch).toBe(initial+5)
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(client.removeChannel).toHaveBeenCalledTimes(1)
 const hidden=result.current.epoch;act(()=>vi.advanceTimersByTime(20_000));expect(result.current.epoch).toBe(hidden)
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(result.current.epoch).toBeGreaterThan(hidden)
 unmount();expect(client.removeChannel).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0)
})
test('incoming confirmation can reconcile a lost response while a retry is pending',async()=>{
 const store=fixture();store.loseNext();const retry=deferred<Message>();const {result,rerender}=renderHook(({epoch})=>useDirectChat(store.api,{student:peer},self,epoch,vi.fn()),{initialProps:{epoch:0}})
 await waitFor(()=>expect(result.current.contact).toBeTruthy());act(()=>result.current.setDraft('Saved once'));await act(()=>result.current.send());expect(result.current.attempt?.status).toBe('failed')
 vi.mocked(store.api.send).mockReturnValueOnce(retry.promise);let sending!:Promise<void>;act(()=>{sending=result.current.send(true)})
 rerender({epoch:1});await waitFor(()=>expect(result.current.attempt).toBeNull());expect(result.current.draft).toBe('');expect(result.current.messages).toHaveLength(1)
 await act(async()=>{retry.reject(new Error('Late network error'));await sending});expect(result.current.error).toBe('');expect(result.current.messages).toHaveLength(1)
})
test('invalid send sender or third-party history never appears as confirmed chat text',async()=>{
 const store=fixture();vi.mocked(store.api.history).mockResolvedValue([{...message(),sender_id:id(99)}]);store.incoming('Saved')
 const {result}=renderHook(()=>useDirectChat(store.api,{student:peer},self,0,vi.fn()));await waitFor(()=>expect(result.current.error).toContain('ownership'));expect(result.current.messages).toHaveLength(0)
 act(()=>result.current.setDraft('Private'));vi.mocked(store.api.send).mockResolvedValue({...message(),sender_id:peer});await act(()=>result.current.send());expect(result.current.attempt?.status).toBe('failed');expect(result.current.draft).toBe('Private')
})

test.each(['friend','pending-request'])('%s profile passes existing student identity without requiring a course',async()=>{
 const store=fixture(),onMessage=vi.fn()
 const api={profile:vi.fn().mockResolvedValue({student_id:peer,name:'Classmate Peer',major:'Math',has_shared_avatar:false}),picture:vi.fn()} as unknown as FriendApi
 render(<FriendProfileDialog api={api} student={peer} onClose={vi.fn()} messaging={store.api} onMessage={onMessage}/> )
 await waitFor(()=>expect(screen.getByRole('button',{name:'Message',exact:true})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'Message',exact:true}));expect(onMessage).toHaveBeenCalledWith({student:peer})
 expect(store.api.contact).toHaveBeenCalledWith({student:peer,course:undefined},expect.anything())
})
test('switching contacts and reopening abandons stale private reads and drafts',async()=>{
 const store=fixture([message()]),old=deferred<Message[]>(),other=id(40)
 const contact=vi.mocked(store.api.contact);contact.mockImplementation(async target=>({student_id:target.student,name:target.student===peer?'Classmate Peer':'Other Student',conversation_id:thread,can_send:true,reason:null}))
 vi.mocked(store.api.inbox).mockResolvedValue([{conversation_id:thread,student_id:peer,name:'Classmate Peer',last_message_at:message().created_at,preview:'Preview'},{conversation_id:id(41),student_id:other,name:'Other Student',last_message_at:message().created_at,preview:'Other preview'}])
 vi.mocked(store.api.history).mockReturnValueOnce(old.promise).mockResolvedValue([])
 render(<Messages api={store.api} userId={self} initialTarget={{student:peer}}/> )
 await screen.findByRole('textbox');fireEvent.change(screen.getByRole('textbox'),{target:{value:'Old contact draft'}})
 fireEvent.click(screen.getByRole('button',{name:/Other Student.*Other preview/}));await waitFor(()=>expect(screen.getByRole('heading',{name:'Other Student'})).toBeInTheDocument())
 await act(async()=>old.resolve([{...message(),body:'Late private history'}]));expect(screen.queryByText('Late private history')).toBeNull();expect(screen.getByRole('textbox')).toHaveValue('')
 fireEvent.click(screen.getByRole('button',{name:'Back to conversations'}));fireEvent.click(screen.getByRole('button',{name:/Classmate Peer.*Preview/}));await waitFor(()=>expect(screen.getByRole('heading',{name:'Classmate Peer'})).toBeInTheDocument());expect(screen.getByRole('textbox')).toHaveValue('')
})
