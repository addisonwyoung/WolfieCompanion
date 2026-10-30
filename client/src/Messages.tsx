import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import GroupPicker from './GroupPicker'
import { useGroupChat } from './useGroupChat'
import { conversationKey } from './groupMessaging'
import type { GroupApi, GroupDetail } from './groupMessaging'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MessagingApi, Target } from './messaging'
import { unreadCount, useMessageNotifications } from './messagingUnread'
import { useDirectChat, useMessageInbox, useMessagingRefresh } from './useMessaging'

function ChatView({chat,userId,onClose,group,headerActions}:{chat:ReturnType<typeof useDirectChat>;userId:string;onClose:()=>void;group?:GroupDetail|null;headerActions?:ReactNode}){
 const {markRead}=useMessageNotifications()
 const heading=useRef<HTMLHeadingElement>(null),history=useRef<HTMLDivElement>(null),nearBottom=useRef(true),oldHeight=useRef<{height:number;top:number}|null>(null),lastSequence=useRef(0)
 const [newMessages,setNewMessages]=useState(false)
 useEffect(()=>{const timer=setTimeout(()=>heading.current?.focus(),0);return()=>clearTimeout(timer)},[])
 const markVisible=useCallback(()=>{const last=chat.messages.at(-1);if(last&&nearBottom.current&&document.visibilityState!=='hidden'&&!document.querySelector('dialog[open]'))markRead(group?'group:'+last.conversation_id:last.conversation_id,last.sequence)},[chat.messages,markRead,group])
 useEffect(()=>{const read=()=>markVisible();read();window.addEventListener('focus',read);document.addEventListener('visibilitychange',read);document.addEventListener('focusin',read);return()=>{window.removeEventListener('focus',read);document.removeEventListener('visibilitychange',read);document.removeEventListener('focusin',read)}} , [markVisible])
 function bottom(){const node=history.current;if(node){node.scrollTop=node.scrollHeight;nearBottom.current=true;setNewMessages(false);markVisible()}}
 useLayoutEffect(()=>{const node=history.current;if(!node)return;const sequence=chat.messages.at(-1)?.sequence??0
  if(oldHeight.current){node.scrollTop=oldHeight.current.top+node.scrollHeight-oldHeight.current.height;oldHeight.current=null}
  else if(nearBottom.current){node.scrollTop=node.scrollHeight;setNewMessages(false)}else if(sequence>lastSequence.current)setNewMessages(true)
  lastSequence.current=sequence
 },[chat.messages])
 return <section className="dm-chat" aria-labelledby="dm-chat-heading"><header className="dm-chat-header"><h2 id="dm-chat-heading" tabIndex={-1} ref={heading}>{chat.contact?.name??'Conversation'}</h2>{headerActions}<button onClick={onClose}>Back to conversations</button></header>
  {chat.loading&&<p role="status">Loading chat…</p>}
  {chat.contact===null&&<p role="status">This contact is unavailable.</p>}
  {chat.error&&<div role="alert"><p>{chat.error}</p>{chat.attempt?.status!=='failed'&&<button onClick={chat.retry}>Retry chat</button>}</div>}
  <div ref={history} className="dm-history" role="region" aria-label="Message history" tabIndex={0} onScroll={()=>{const node=history.current!;nearBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<60;if(nearBottom.current){setNewMessages(false);markVisible()}}}>
   {chat.more&&<button disabled={chat.paging} onClick={()=>{const node=history.current!;oldHeight.current={height:node.scrollHeight,top:node.scrollTop};void chat.loadOlder().then(loaded=>{if(!loaded)oldHeight.current=null})}}>{chat.paging?'Loading older…':'Load older messages'}</button>}
   {!chat.loading&&chat.contact&&chat.messages.length===0&&<p>{group&&group.joined_after_sequence>0?'No messages since you joined. Earlier messages are private.':'No messages yet.'}</p>}
   <ol className="dm-message-list">{chat.messages.map(row=><li key={row.id} className={`dm-message ${row.sender_id===userId?'dm-sent':'dm-received'}`}><span className="dm-author">{row.sender_id===userId?'You':row.sender_name??chat.contact?.name??'Other participant'}</span><p>{row.body}</p><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</time></li>)}</ol>
  </div>
  {newMessages&&<button className="dm-new-messages" onClick={bottom}>New messages — jump to latest</button>}
  {chat.contact&&!chat.contact.can_send&&<p role="status">{chat.contact.reason==='closed'?'This person has closed new conversations. Existing chats can continue.':'This person is unavailable for new messages.'}</p>}
  {chat.contact&&<form className="dm-composer" onSubmit={event=>{event.preventDefault();void chat.send()}}>
   <label htmlFor="dm-text" className="sr-only">Message</label>
   <div className="dm-compose-row"><textarea id="dm-text" rows={1} placeholder="Type a message…" value={chat.draft} readOnly={!!chat.attempt} disabled={!chat.contact.can_send} aria-describedby="dm-help" onChange={event=>chat.setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void chat.send()}}}/>
   {chat.attempt?.status!=='failed'&&<button className="primary dm-send" aria-label={chat.attempt?'Sending…':'Send'} title="Send message" disabled={!!chat.attempt||!chat.contact.can_send}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></svg></button>}</div>
   <p id="dm-help" className="field-help">Enter to send · Shift+Enter for a new line · Up to 2000 characters</p>
   {chat.attempt?.status==='failed'&&<div><p>Your send was not confirmed; it may already have been delivered. Retry sends this same attempt once.</p><button type="button" onClick={()=>void chat.send(true)} disabled={!chat.contact.can_send}>Retry send</button><button type="button" onClick={chat.discard}>Discard draft</button></div>}
   {chat.attempt?.status==='pending'&&<p role="status">Sending message…</p>}
  </form>}
 </section>
}
function DirectChat({api,target,userId,epoch,onSent,onClose}:{api:MessagingApi;target:Target;userId:string;epoch:number;onSent:()=>void;onClose:()=>void}){
 const chat=useDirectChat(api,target,userId,epoch,onSent)
 return <ChatView chat={chat} userId={userId} onClose={onClose}/>
}
function GroupChat({api,id,userId,epoch,onSent,onClose}:{api:GroupApi;id:string;userId:string;epoch:number;onSent:()=>void;onClose:()=>void}){
 const chat=useGroupChat(api,id,userId,epoch,onSent),[adding,setAdding]=useState(false),[removing,setRemoving]=useState<string|null>(null),[removeBusy,setRemoveBusy]=useState(false),[removeError,setRemoveError]=useState('')
 const removeLock=useRef(false),active=useRef(true)
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 async function removeMember(){if(!removing||removeLock.current)return;removeLock.current=true;setRemoveBusy(true);setRemoveError('');try{await api.remove(id,removing);if(active.current){setRemoving(null);onSent()}}catch(error){if(active.current)setRemoveError(error instanceof Error?error.message:'Unable to remove member. Please retry.')}finally{removeLock.current=false;if(active.current)setRemoveBusy(false)}}
 return <><ChatView chat={chat} group={chat.detail} userId={userId} onClose={onClose} headerActions={chat.detail&&<div className="group-actions"><details><summary>Members ({chat.detail.members.length})</summary><ul>{chat.detail.members.map(member=><li key={member.student_id}>{member.name}{member.student_id===chat.detail?.creator_id?' · Creator':''}{chat.detail?.creator_id===userId&&member.student_id!==userId&&<button onClick={()=>{setRemoving(member.student_id);setRemoveError('')}} disabled={removeBusy} aria-label={`Remove ${member.name}`}>Remove</button>}</li>)}</ul></details>{chat.detail.creator_id===userId&&<button disabled={chat.detail.members.length>=50} onClick={()=>setAdding(true)}>Add members</button>}{removing&&<div className="group-removal" role="region" aria-label="Confirm member removal"><p>Remove {chat.detail?.members.find(member=>member.student_id===removing)?.name??'this member'}? They will lose access to this chat. Their messages will stay.</p>{removeError&&<p role="alert">{removeError}</p>}<button disabled={removeBusy} onClick={()=>void removeMember()}>{removeBusy?'Removing…':'Confirm removal'}</button><button disabled={removeBusy} onClick={()=>setRemoving(null)}>Cancel removal</button></div>}</div>}/>{adding&&chat.detail&&<GroupPicker api={api} group={chat.detail} onClose={()=>setAdding(false)} onDone={()=>{setAdding(false);onSent()}}/>}</>
}
export default function Messages({api,client,userId,initialTarget}:{api:MessagingApi;client?:SupabaseClient;userId:string;initialTarget:Target|null}){
 const [target,setTarget]=useState<Target|{group:string}|null>(initialTarget)
 const {counts}=useMessageNotifications()
 const {epoch,refresh}=useMessagingRefresh(client),inbox=useMessageInbox(api,epoch)
 const title=useRef<HTMLHeadingElement>(null),[creating,setCreating]=useState(false)
 function close(){setTarget(null);setTimeout(()=>title.current?.focus(),0)}
 return <section className={`dm-workspace ${target?'dm-has-chat':''}`} aria-labelledby="dm-title"><div className="section-top"><h1 id="dm-title" tabIndex={-1} ref={title}>Messages</h1>{api.groups&&<button className="primary" onClick={()=>setCreating(true)}>New group</button>}</div><div className="dm-layout"><aside className="dm-inbox" aria-label="Saved conversations"><h2>Conversations</h2>
  {inbox.loading&&<p role="status">Loading conversations…</p>}{inbox.error&&<div role="alert"><p>{inbox.error}</p><button onClick={inbox.retry}>Retry conversations</button></div>}
  {!inbox.loading&&!inbox.error&&!inbox.rows.length&&<p>No conversations yet. Open a student's profile to send a message.</p>}
  <ul>{inbox.rows.map(row=>{const kind=row.kind??'direct',count=unreadCount(counts,row.conversation_id,kind),selected=target&&('group' in target?kind==='group'&&target.group===row.conversation_id:kind==='direct'&&target.student===row.student_id);return <li key={conversationKey(row.conversation_id,kind)}><button className={count?'dm-conversation-unread':undefined} aria-pressed={!!selected} onClick={()=>{if(kind==='group')setTarget({group:row.conversation_id});else if(row.student_id)setTarget({student:row.student_id})}}><strong>{row.name}{count>0&&<span className="dm-unread-badge" aria-label={`${count} unread messages`}>{count>99?'99+':count}</span>}</strong>{kind==='group'&&<small>Group · {row.member_count} members</small>}<span>{row.preview??'No messages since you joined.'}</span>{row.message_time!==null&&<time dateTime={row.message_time??row.last_message_at}>{new Date(row.message_time??row.last_message_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</time>}</button></li>})}</ul>
  {inbox.more&&<button disabled={inbox.paging} onClick={()=>void inbox.loadMore()}>{inbox.paging?'Loading…':'Load more conversations'}</button>}
 </aside>{target?('group' in target?(api.groups?<GroupChat key={`${userId}:group:${target.group}`} api={api.groups} id={target.group} userId={userId} epoch={epoch} onSent={refresh} onClose={close}/>:<p role="status">Group messaging is unavailable.</p>):<DirectChat key={`${userId}:direct:${target.student}:${target.course??''}`} api={api} target={target} userId={userId} epoch={epoch} onSent={refresh} onClose={close}/>):<p className="dm-no-selection">Choose a conversation, or open a profile to start a new one.</p>}</div>{creating&&api.groups&&<GroupPicker api={api.groups} onClose={()=>setCreating(false)} onDone={group=>{setCreating(false);setTarget({group:group.group_id});refresh()}}/>}</section>
}
