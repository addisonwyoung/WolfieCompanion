import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Contact, Conversation, Message, MessagingApi, Target } from './messaging'
import { validateMessage } from './messaging'

export function mergeMessages(previous: Message[], incoming: Message[]) {
 const rows = new Map(previous.map(row => [row.id,row]))
 incoming.forEach(row => rows.set(row.id,row))
 return [...rows.values()].sort((a,b)=>a.sequence-b.sequence)
}
export function useMessagingRefresh(client: SupabaseClient | undefined) {
 const [epoch,setEpoch]=useState(0)
 const refresh=useCallback(()=>setEpoch(value=>value+1),[])
 useEffect(()=>{
  let timer:ReturnType<typeof setInterval>|undefined
  let channel:ReturnType<SupabaseClient['channel']>|undefined
  function stop(){if(timer)clearInterval(timer);timer=undefined;if(channel&&client)void client.removeChannel(channel);channel=undefined}
  function start(){stop();if(document.visibilityState==='hidden')return;refresh();timer=setInterval(refresh,10_000)
   if(typeof client?.channel==='function')channel=client.channel(`messages-${crypto.randomUUID()}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'dm_messages'},refresh).on('postgres_changes',{event:'UPDATE',schema:'public',table:'dm_conversations'},refresh).subscribe(status=>{if(status==='SUBSCRIBED')refresh()})
  }
  const focus=()=>{if(document.visibilityState!=='hidden')refresh()}
  start();document.addEventListener('visibilitychange',start);window.addEventListener('focus',focus);window.addEventListener('online',focus)
  return()=>{stop();document.removeEventListener('visibilitychange',start);window.removeEventListener('focus',focus);window.removeEventListener('online',focus)}
 },[client,refresh])
 return {epoch,refresh}
}
export function useMessageInbox(api:MessagingApi,epoch:number){
 const [rows,setRows]=useState<Conversation[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[more,setMore]=useState(false),[paging,setPaging]=useState(false),[attempt,setAttempt]=useState(0)
 const generation=useRef(0),pageBusy=useRef(false),pageController=useRef<AbortController|null>(null)
 useEffect(()=>()=>{pageController.current?.abort()},[])
 const merge=(old:Conversation[],incoming:Conversation[])=>[...new Map([...old,...incoming].map(row=>[row.conversation_id,row])).values()].sort((a,b)=>b.last_message_at.localeCompare(a.last_message_at)||b.conversation_id.localeCompare(a.conversation_id))
 useEffect(()=>{const run=++generation.current,controller=new AbortController();void api.inbox(controller.signal).then(data=>{if(run!==generation.current)return;setRows(old=>merge(old,data));setMore(data.length===50);setLoading(false);setError('')},()=>{if(run===generation.current){setError('Unable to load conversations. Please retry.');setLoading(false)}});return()=>{
// Request generation counter, not a DOM ref.
// eslint-disable-next-line react-hooks/exhaustive-deps
generation.current++;controller.abort()
}},[api,epoch,attempt])
 async function loadMore(){if(pageBusy.current||!rows.length)return;pageBusy.current=true;setPaging(true);const controller=new AbortController();pageController.current=controller;const run=generation.current;try{const data=await api.inbox(controller.signal,rows.at(-1));if(!controller.signal.aborted&&run===generation.current){setRows(old=>merge(old,data));setMore(data.length===50);setError('')}}catch{if(!controller.signal.aborted&&run===generation.current)setError('Unable to load more conversations. Please retry.')}finally{pageBusy.current=false;if(!controller.signal.aborted)setPaging(false)}}
 return{rows,error,loading,more,paging,loadMore,retry:()=>setAttempt(value=>value+1)}
}
type Attempt={id:string;body:string;status:'pending'|'failed'}
export function useDirectChat(api:MessagingApi,target:Target,userId:string,epoch:number,onSent:()=>void){
 const [contact,setContact]=useState<Contact|null|undefined>(undefined),[messages,setMessages]=useState<Message[]>([]),[error,setError]=useState(''),[draft,setDraft]=useState(''),[attempt,setAttempt]=useState<Attempt|null>(null),[more,setMore]=useState(false),[paging,setPaging]=useState(false),[loading,setLoading]=useState(true),[retryKey,setRetryKey]=useState(0)
 const alive=useRef(false),request=useRef<Attempt|null>(null),known=useRef<Message[]>([]),currentContact=useRef<Contact|null>(null),pageBusy=useRef(false),pageController=useRef<AbortController|null>(null)
 const student=target.student,course=target.course
 function merge(data:Message[]){if(data.some(row=>![userId,student].includes(row.sender_id)||(currentContact.current?.conversation_id&&row.conversation_id!==currentContact.current.conversation_id)))throw new Error('Invalid message ownership');known.current=mergeMessages(known.current,data);setMessages(known.current);const pending=request.current;if(pending&&data.some(row=>row.sender_id===userId&&row.client_message_id===pending.id&&row.body===pending.body)){request.current=null;setAttempt(null);setDraft('');setError('')}}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;pageController.current?.abort()}},[])
 useEffect(()=>{
  let active=true;const controller=new AbortController()
  void(async()=>{
   try{const value=await api.contact({student,course},controller.signal);if(!active)return;setContact(value);currentContact.current=value
    if(value?.conversation_id){const same=known.current[0]?.conversation_id===value.conversation_id;const after=same?known.current.at(-1)?.sequence:undefined
     let cursor=after
     do{const page=await api.history(value.conversation_id,controller.signal,undefined,cursor);if(!active)return;merge(page);if(cursor===undefined){setMore(page.length===50);break}if(page.length<50)break;cursor=page.at(-1)!.sequence}while(active)
    }
    if(active){setLoading(false);if(!request.current)setError('')}
   }catch(error){if(active){setLoading(false);setError(error instanceof Error?error.message:'Unable to load chat. Please retry.')}}
  })()
  return()=>{active=false;controller.abort()}
  // Requests are keyed by primitive account/recipient context; saved state is merged by ID.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[api,student,course,userId,epoch,retryKey])
 async function send(retry=false){
  if(!alive.current||!currentContact.current?.can_send||request.current?.status==='pending')return
  let outgoing=request.current
  if(retry){if(!outgoing||outgoing.status!=='failed')return}else{if(outgoing)return;try{validateMessage(draft)}catch(error){setError((error as Error).message);return}outgoing={id:crypto.randomUUID(),body:draft,status:'pending'}}
  outgoing={...outgoing!,status:'pending'};request.current=outgoing;setAttempt(outgoing);setError('')
  try{const row=await api.send({student,course},outgoing.body,outgoing.id);if(!alive.current)return;if(row.sender_id!==userId||row.client_message_id!==outgoing.id||row.body!==outgoing.body||(currentContact.current?.conversation_id&&currentContact.current.conversation_id!==row.conversation_id))throw new Error('Send could not be confirmed. Please retry.');merge([row]);setContact(old=>old?{...old,conversation_id:row.conversation_id}:old);currentContact.current=currentContact.current?{...currentContact.current,conversation_id:row.conversation_id}:null;onSent()}
  catch(error){if(alive.current&&request.current?.id===outgoing.id){const failed={...outgoing,status:'failed' as const};request.current=failed;setAttempt(failed);setError(error instanceof Error?error.message:'Unable to send. Please retry.')}}
 }
 async function loadOlder(){const id=currentContact.current?.conversation_id,before=known.current[0]?.sequence;if(!id||!before||pageBusy.current)return false;pageBusy.current=true;setPaging(true);const controller=new AbortController();pageController.current=controller;try{const page=await api.history(id,controller.signal,before);if(alive.current){merge(page);setMore(page.length===50);setError('');return true}return false}catch{if(alive.current)setError('Unable to load older messages. Please retry.');return false}finally{pageBusy.current=false;if(alive.current)setPaging(false)}}
 return{contact,messages,error,draft,setDraft,attempt,more,paging,loading,send,loadOlder,retry:()=>setRetryKey(value=>value+1),discard:()=>{request.current=null;setAttempt(null);setDraft('');setError('')}}
}
