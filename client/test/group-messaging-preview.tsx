// Synthetic local browser acceptance only. No Supabase or real accounts.
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Messages from '../src/Messages'
import { MessagingNotifications, MessagesNavigation } from '../src/MessagingNotifications'
import type { GroupApi, GroupDetail } from '../src/groupMessaging'
import type { Message, MessagingApi } from '../src/messaging'
import { validateMessage } from '../src/messaging'
import type { UnreadApi } from '../src/messagingUnread'
import '../src/index.css'
import '../src/App.css'
const uid=(n:number)=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const names=['','Creator Alex','Friend Ada','Friend Grace','Later Friend Dana','Unrelated Evan']
const name=(id:string)=>names[Number(id.slice(-12))]??'Friend'
type Saved={detail:GroupDetail;rows:Message[];floors:Record<string,number>;reads:Record<string,number>}
type Store={groups:Saved[];receipts:Record<string,string>}
const read=():Store=>JSON.parse(localStorage.getItem('group-fixture-data')??'{"groups":[],"receipts":{}}')
const write=(data:Store)=>localStorage.setItem('group-fixture-data',JSON.stringify(data))
const state={lost:false,closed:false,hold:false,release:undefined as undefined|(()=>void),account:uid(1),switchAccount:(id:string)=>{void id},incoming:(body?:string)=>{void body},seed:()=>{},unfriend:false}
Object.assign(window,{groupFixture:state})
function group(id:string){const data=read(),saved=data.groups.find(g=>g.detail.group_id===id);if(!saved)throw Error('Group unavailable');return {data,saved}}
function view(id:string,account:string):GroupDetail{const {saved}=group(id);if(!(account in saved.floors))throw Error('Group unavailable');return {...saved.detail,joined_after_sequence:saved.floors[account],last_read_sequence:saved.reads[account]}}
function append(id:string,account:string,body:string,request=crypto.randomUUID()){
 validateMessage(body);const {data,saved}=group(id);if(!(account in saved.floors))throw Error('Group unavailable');const existing=saved.rows.find(r=>r.sender_id===account&&r.client_message_id===request);if(existing)return existing
 const next:Message={id:crypto.randomUUID(),conversation_id:id,sequence:saved.rows.length+1,sender_id:account,sender_name:name(account),client_message_id:request,body,created_at:new Date().toISOString()};saved.rows.push(next);write(data);return next
}
export function Fixture(){
 const [account,setAccount]=useState(uid(1)),[viewMode,setViewMode]=useState('messages')
 useEffect(()=>{state.account=account;state.switchAccount=(id:string)=>{setAccount(id);setViewMode('messages')};state.incoming=(body='Incoming from Ada')=>{const saved=read().groups[0];if(saved)append(saved.detail.group_id,uid(2),body);window.dispatchEvent(new Event('focus'))};state.seed=()=>{const saved=read().groups[0];if(saved)for(let n=saved.rows.length+1;n<=70;n++)append(saved.detail.group_id,uid(2),`Older group text ${n}`);window.dispatchEvent(new Event('focus'))}},[account])
 const {api,unread}=useMemo(()=>{
 const groups:GroupApi={remove:async(id,student)=>{const {data,saved}=group(id);if(saved.detail.creator_id!==account||student===account)throw Error('Creator required');saved.detail.members=saved.detail.members.filter(m=>m.student_id!==student);delete saved.floors[student];delete saved.reads[student];write(data);return view(id,account)},
  candidates:async(search,_signal,_before,id)=>[uid(2),uid(3),uid(4)].filter(student=>name(student).toLowerCase().includes(search.toLowerCase())&&(!id||!view(id,account).members.some(m=>m.student_id===student))).map(student_id=>({student_id,name:name(student_id),major:'Computer Science',can_add:!state.closed||student_id!==uid(4),reason:state.closed&&student_id===uid(4)?'closed' as const:null})),
  detail:async id=>view(id,account),
  create:async(title,students,request)=>{if(state.hold)await new Promise<void>(r=>{state.release=r});if(account!==uid(1))throw Error('Accepted friendship unavailable');const data=read(),old=data.receipts[request];if(old)return view(old,account);if(students.length<2||new Set(students).size!==students.length)throw Error('Choose two friends');const id=crypto.randomUUID(),members=[account,...students],detail:GroupDetail={group_id:id,name:title||'Group with Ada, Grace',creator_id:account,joined_after_sequence:0,last_read_sequence:0,members:members.map(student_id=>({student_id,name:name(student_id)}))};data.groups.push({detail,rows:[],floors:Object.fromEntries(members.map(id=>[id,0])),reads:Object.fromEntries(members.map(id=>[id,0]))});data.receipts[request]=id;write(data);if(state.lost){state.lost=false;throw Error('Response lost')}return detail},
  add:async(id,students,request)=>{if(state.hold)await new Promise<void>(r=>{state.release=r});const {data,saved}=group(id);if(saved.detail.creator_id!==account)throw Error('Creator required');if(data.receipts[request])return view(id,account);if(state.closed)throw Error('A selected friend has closed new messages.');if(state.unfriend)throw Error('Accepted friendship unavailable');for(const student_id of students){saved.detail.members.push({student_id,name:name(student_id)});saved.floors[student_id]=saved.rows.length;saved.reads[student_id]=saved.rows.length}data.receipts[request]=id;write(data);if(state.lost){state.lost=false;throw Error('Response lost')}return view(id,account)},
  history:async(id,_signal,before,after)=>{const {saved}=group(id),floor=view(id,account).joined_after_sequence;const rows=saved.rows.filter(row=>row.sequence>floor&&(before===undefined||row.sequence<before)&&(after===undefined||row.sequence>after));return after===undefined?rows.slice(-50):rows.slice(0,50)},
  send:async(id,body,request)=>{if(state.hold)await new Promise<void>(r=>{state.release=r});const row=append(id,account,body,request);if(state.lost){state.lost=false;throw Error('Response lost')}return row},
 }
 const api:MessagingApi={groups,contact:async()=>null,history:async()=>[],send:async()=>{throw Error('No direct fixture')},inbox:async()=>read().groups.filter(saved=>account in saved.floors).map(saved=>{const last=saved.rows.filter(row=>row.sequence>saved.floors[account]).at(-1);return {kind:'group' as const,conversation_id:saved.detail.group_id,student_id:null,name:saved.detail.name,member_count:saved.detail.members.length,last_message_at:last?.created_at??'2026-10-25T15:00:00Z',message_time:last?.created_at??null,preview:last?.body??null}})}
 const unread:UnreadApi={load:async()=>Object.fromEntries(read().groups.filter(saved=>account in saved.floors).map(saved=>['group:'+saved.detail.group_id,saved.rows.filter(row=>row.sender_id!==account&&row.sequence>saved.reads[account]).length]).filter(([,count])=>Number(count)>0)),read:async(key,sequence)=>{const {data,saved}=group(key.replace(/^group:/,''));if(!(account in saved.floors)||sequence<=saved.floors[account])throw Error('Invalid read');saved.reads[account]=Math.max(sequence,saved.reads[account]);write(data)}}
 return {api,unread}
 },[account])
 return <MessagingNotifications key={account} userId={account} api={unread}><main style={{maxWidth:1100,margin:'auto',padding:12}}><h1>Group fixture — synthetic data</h1><p>Signed in as {name(account)}</p><nav className="app-nav"><button onClick={()=>setViewMode('dashboard')}>Dashboard</button><MessagesNavigation active={viewMode==='messages'} onClick={()=>setViewMode('messages')}/></nav>{viewMode==='messages'?<Messages key={account} api={api} userId={account} initialTarget={null}/>:<p>Dashboard fixture</p>}</main></MessagingNotifications>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
