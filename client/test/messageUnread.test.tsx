import './academicDialogSupport'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { MessagingNotifications, MessagesNavigation } from '../src/MessagingNotifications'
import { useMessageNotifications } from '../src/messagingUnread'
import Messages from '../src/Messages'
import type { MessagingApi } from '../src/messaging'
const thread='20000000-0000-0000-0000-000000000001'
function Read(){const {markRead}=useMessageNotifications();return <button onClick={()=>markRead(thread,1)}>Read</button>}
test('navigation highlights incoming counts outside chat, clears confirmed reads, and isolates account teardown',async()=>{
 let count=2
 const api={load:vi.fn(async()=>count?{[thread]:count}:{}),read:vi.fn(async()=>{count=0})}
 const {rerender}=render(<MessagingNotifications key="a" userId="a" api={api}><MessagesNavigation active={false} onClick={vi.fn()}/><Read/></MessagingNotifications>)
 expect(await screen.findByLabelText('2 unread messages')).toBeInTheDocument();expect(screen.getByRole('button',{name:/Messages/})).toHaveClass('dm-nav-unread')
 fireEvent.click(screen.getByText('Read'));await waitFor(()=>expect(screen.queryByLabelText('2 unread messages')).toBeNull());expect(api.read).toHaveBeenCalledWith(thread,1)
 fireEvent.click(screen.getByText('Read'));expect(api.read).toHaveBeenCalledTimes(1)
 count=3;act(()=>window.dispatchEvent(new Event('focus')));await screen.findByLabelText('3 unread messages')
 const next={load:vi.fn(async()=>({})),read:vi.fn()};rerender(<MessagingNotifications key="b" userId="b" api={next}><MessagesNavigation active={false} onClick={vi.fn()}/></MessagingNotifications>)
 expect(screen.queryByLabelText('3 unread messages')).toBeNull()
})
test('unread conversation stays highlighted in inbox and clears only after visible chat history loads',async()=>{
 let unread=1
 const notifications={load:vi.fn(async()=>unread?{[thread]:unread}:{}),read:vi.fn(async()=>{unread=0})}
 const api:MessagingApi={contact:vi.fn(async()=>({student_id:'peer',name:'Peer',conversation_id:thread,can_send:true,reason:null})),inbox:vi.fn(async()=>[{conversation_id:thread,student_id:'peer',name:'Peer',preview:'Hello',last_message_at:'2026-10-23T20:00:00Z'}]),history:vi.fn(async()=>[{id:'row',conversation_id:thread,sequence:1,sender_id:'peer',client_message_id:'request',body:'Hello',created_at:'2026-10-23T20:00:00Z'}]),send:vi.fn()}
 render(<MessagingNotifications userId="self" api={notifications}><Messages api={api} userId="self" initialTarget={null}/></MessagingNotifications>)
 const row=await screen.findByRole('button',{name:/Peer/});await waitFor(()=>expect(row).toHaveClass('dm-conversation-unread'));expect(notifications.read).not.toHaveBeenCalled()
 fireEvent.click(row);await waitFor(()=>expect(notifications.read).toHaveBeenCalledWith(thread,1));await waitFor(()=>expect(row).not.toHaveClass('dm-conversation-unread'))
})
test('a hidden chat waits until visible before marking saved incoming messages read',async()=>{
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'})
 const notifications={load:vi.fn(async()=>({[thread]:1})),read:vi.fn(async()=>{})}
 const api:MessagingApi={contact:vi.fn(async()=>({student_id:'peer',name:'Peer',conversation_id:thread,can_send:true,reason:null})),inbox:vi.fn(async()=>[]),history:vi.fn(async()=>[{id:'row',conversation_id:thread,sequence:1,sender_id:'peer',client_message_id:'request',body:'Hidden incoming',created_at:'2026-10-23T20:00:00Z'}]),send:vi.fn()}
 try{
 render(<MessagingNotifications userId="self" api={notifications}><Messages api={api} userId="self" initialTarget={{student:'peer'}}/></MessagingNotifications>)
 await screen.findByText('Hidden incoming');expect(notifications.read).not.toHaveBeenCalled()
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});act(()=>document.dispatchEvent(new Event('visibilitychange')))
 await waitFor(()=>expect(notifications.read).toHaveBeenCalledWith(thread,1))
 }finally{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'})}
})
test('failed read acknowledgement keeps unread highlight and permits an explicit later retry',async()=>{
 let unread=1
 const api={load:vi.fn(async()=>unread?{[thread]:unread}:{}),read:vi.fn().mockRejectedValueOnce(new Error('Offline')).mockImplementation(async()=>{unread=0})}
 render(<MessagingNotifications userId="self" api={api}><MessagesNavigation active={false} onClick={vi.fn()}/><Read/></MessagingNotifications>)
 await screen.findByLabelText('1 unread messages');fireEvent.click(screen.getByText('Read'));await act(async()=>{await Promise.resolve()});expect(screen.getByLabelText('1 unread messages')).toBeInTheDocument()
 fireEvent.click(screen.getByText('Read'));await waitFor(()=>expect(screen.queryByLabelText('1 unread messages')).toBeNull());expect(api.read).toHaveBeenCalledTimes(2)
})
