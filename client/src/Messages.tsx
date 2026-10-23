import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MessagingApi, Target } from './messaging'
import { useDirectChat, useMessageInbox, useMessagingRefresh } from './useMessaging'

function Chat({api,target,userId,epoch,onSent,onClose}:{api:MessagingApi;target:Target;userId:string;epoch:number;onSent:()=>void;onClose:()=>void}){
 const chat=useDirectChat(api,target,userId,epoch,onSent)
 const heading=useRef<HTMLHeadingElement>(null),history=useRef<HTMLDivElement>(null),nearBottom=useRef(true),oldHeight=useRef<{height:number;top:number}|null>(null),lastSequence=useRef(0)
 const [newMessages,setNewMessages]=useState(false)
 useEffect(()=>{const timer=setTimeout(()=>heading.current?.focus(),0);return()=>clearTimeout(timer)},[])
 function bottom(){const node=history.current;if(node){node.scrollTop=node.scrollHeight;nearBottom.current=true;setNewMessages(false)}}
 useLayoutEffect(()=>{const node=history.current;if(!node)return;const sequence=chat.messages.at(-1)?.sequence??0
  if(oldHeight.current){node.scrollTop=oldHeight.current.top+node.scrollHeight-oldHeight.current.height;oldHeight.current=null}
  else if(nearBottom.current){node.scrollTop=node.scrollHeight;setNewMessages(false)}else if(sequence>lastSequence.current)setNewMessages(true)
  lastSequence.current=sequence
 },[chat.messages])
 return <section className="dm-chat" aria-labelledby="dm-chat-heading"><header className="dm-chat-header"><h2 id="dm-chat-heading" tabIndex={-1} ref={heading}>{chat.contact?.name??'Conversation'}</h2><button onClick={onClose}>Back to conversations</button></header>
  {chat.loading&&<p role="status">Loading chat…</p>}
  {chat.contact===null&&<p role="status">This contact is unavailable.</p>}
  {chat.error&&<div role="alert"><p>{chat.error}</p>{chat.attempt?.status!=='failed'&&<button onClick={chat.retry}>Retry chat</button>}</div>}
  <div ref={history} className="dm-history" role="region" aria-label="Message history" tabIndex={0} onScroll={()=>{const node=history.current!;nearBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<60;if(nearBottom.current)setNewMessages(false)}}>
   {chat.more&&<button disabled={chat.paging} onClick={()=>{const node=history.current!;oldHeight.current={height:node.scrollHeight,top:node.scrollTop};void chat.loadOlder().then(loaded=>{if(!loaded)oldHeight.current=null})}}>{chat.paging?'Loading older…':'Load older messages'}</button>}
   {!chat.loading&&chat.contact&&chat.messages.length===0&&<p>No messages yet.</p>}
   <ol className="dm-message-list">{chat.messages.map(row=><li key={row.id} className={`dm-message ${row.sender_id===userId?'dm-sent':'dm-received'}`}><span className="dm-author">{row.sender_id===userId?'You':chat.contact?.name??'Other participant'}</span><p>{row.body}</p><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</time></li>)}</ol>
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
export default function Messages({api,client,userId,initialTarget}:{api:MessagingApi;client?:SupabaseClient;userId:string;initialTarget:Target|null}){
 const [target,setTarget]=useState(initialTarget)
 const {epoch,refresh}=useMessagingRefresh(client),inbox=useMessageInbox(api,epoch)
 const title=useRef<HTMLHeadingElement>(null)
 function close(){setTarget(null);setTimeout(()=>title.current?.focus(),0)}
 return <section className={`dm-workspace ${target?'dm-has-chat':''}`} aria-labelledby="dm-title"><h1 id="dm-title" tabIndex={-1} ref={title}>Messages</h1><div className="dm-layout"><aside className="dm-inbox" aria-label="Saved conversations"><h2>Conversations</h2>
  {inbox.loading&&<p role="status">Loading conversations…</p>}{inbox.error&&<div role="alert"><p>{inbox.error}</p><button onClick={inbox.retry}>Retry conversations</button></div>}
  {!inbox.loading&&!inbox.error&&!inbox.rows.length&&<p>No conversations yet. Open a student's profile to send a message.</p>}
  <ul>{inbox.rows.map(row=><li key={row.conversation_id}><button aria-pressed={target?.student===row.student_id} onClick={()=>setTarget({student:row.student_id})}><strong>{row.name}</strong><span>{row.preview}</span><time dateTime={row.last_message_at}>{new Date(row.last_message_at).toLocaleString()}</time></button></li>)}</ul>
  {inbox.more&&<button disabled={inbox.paging} onClick={()=>void inbox.loadMore()}>{inbox.paging?'Loading…':'Load more conversations'}</button>}
 </aside>{target?<Chat key={`${userId}:${target.student}:${target.course??''}`} api={api} target={target} userId={userId} epoch={epoch} onSent={refresh} onClose={close}/>:<p className="dm-no-selection">Choose a conversation, or open a profile to start a new one.</p>}</div></section>
}
