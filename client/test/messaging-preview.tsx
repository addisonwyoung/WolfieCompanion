// Synthetic local-only fixture. No Supabase connection or real student data.
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Messages from '../src/Messages'
import PeerProfileDialog from '../src/PeerProfileDialog'
import FriendProfileDialog from '../src/FriendProfileDialog'
import Profile from '../src/Profile'
import type { MessagingApi, Message, Target } from '../src/messaging'
import { validateMessage } from '../src/messaging'
import type { FriendApi } from '../src/friendshipApi'
import type { StudentProfile } from '../src/account'
import '../src/index.css'
import '../src/App.css'
const uid=(n:number)=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const peer=uid(2),other=uid(3)
const name=(id:string)=>id===peer?'Classmate Ada':'Friend Grace'
const state={lost:false,hold:false,release:undefined as undefined|(()=>void),incoming:()=>{},switchAccount:()=>{},seed:()=>{}}
Object.assign(window,{messagingFixture:state})
const owner:StudentProfile={id:peer,name:'Classmate Ada',major:'Computer Science',year:null,interests:[],residence_status:null,avatar_path:null}
export function Fixture(){
 const [account,setAccount]=useState(uid(1)),[target,setTarget]=useState<Target|null>(null),[dialog,setDialog]=useState<'friend'|'classmate'|null>(null),[view,setView]=useState('profiles'),[profile,setProfile]=useState<StudentProfile>(()=>({...owner,allow_new_dms:localStorage.getItem('dm-fixture-open')!=='false'}))
 const api=useMemo<MessagingApi>(()=>{
 const key=(student:string)=>`dm-fixture:${account}:${student}`
 const read=(student:string):Message[]=>JSON.parse(localStorage.getItem(key(student))??'[]')
 const write=(student:string,rows:Message[])=>localStorage.setItem(key(student),JSON.stringify(rows))
 const make=(student:string,body:string,sender=student,request=crypto.randomUUID()):Message=>{const rows=read(student);const row={id:crypto.randomUUID(),conversation_id:student,sequence:rows.length+1,sender_id:sender,client_message_id:request,body,created_at:new Date().toISOString()};write(student,[...rows,row]);return row}
 return {
 contact:async({student})=>{const exists=read(student).length>0,open=student!==peer||localStorage.getItem('dm-fixture-open')!=='false';return {student_id:student,name:name(student),conversation_id:exists?student:null,can_send:exists||open,reason:exists||open?null:'closed'}},
 inbox:async()=>[peer,other].flatMap(student=>{const rows=read(student),last=rows.at(-1);return last?[{conversation_id:student,student_id:student,name:name(student),last_message_at:last.created_at,preview:last.body}]:[]}).sort((a,b)=>b.last_message_at.localeCompare(a.last_message_at)),
 history:async(student,_signal,before,after)=>{const rows=read(student).filter(row=>(before===undefined||row.sequence<before)&&(after===undefined||row.sequence>after));return after===undefined?rows.slice(-50):rows.slice(0,50)},
 send:async({student},body,request)=>{validateMessage(body);if(state.hold)await new Promise<void>(resolve=>{state.release=resolve});const rows=read(student),existing=rows.find(row=>row.client_message_id===request&&row.sender_id===account);if(existing)return existing;if(!rows.length&&student===peer&&localStorage.getItem('dm-fixture-open')==='false')throw Error('This person has closed new direct messages.');const row=make(student,body,account,request);if(state.lost){state.lost=false;throw Error('Response lost')}return row},
 }
 },[account])
 useEffect(()=>{
 state.switchAccount=()=>{setAccount(old=>old===uid(1)?uid(4):uid(1));setDialog(null);setView('profiles');setTarget(null)}
 const key=`dm-fixture:${account}:${peer}`
 const incoming=(body:string)=>{const rows:Message[]=JSON.parse(localStorage.getItem(key)??'[]');localStorage.setItem(key,JSON.stringify([...rows,{id:crypto.randomUUID(),conversation_id:peer,sequence:rows.length+1,sender_id:peer,client_message_id:crypto.randomUUID(),body,created_at:new Date().toISOString()}]))}
 state.incoming=()=>{incoming('Incoming saved text '+Date.now());window.dispatchEvent(new Event('focus'))}
 state.seed=()=>{const length=JSON.parse(localStorage.getItem(key)??'[]').length;for(let n=length+1;n<=65;n++)incoming(`Long history message ${n}`);window.dispatchEvent(new Event('focus'))}
 },[account])
 const open=(value:Target)=>{setDialog(null);setTarget(value);setView('messages')}
 const detail={student_id:peer,name:name(peer),major:'Computer Science',has_shared_avatar:false}
 const friendApi={profile:async()=>({...detail,student_id:other,name:name(other)}),picture:async()=>{throw Error('No picture')}} as unknown as FriendApi
 return <div style={{maxWidth:1100,margin:'auto',padding:12}}><h1>Messaging fixture — synthetic data</h1><nav style={{display:'flex',flexWrap:'wrap',gap:8}}><button onClick={()=>{setView('profiles');setTarget(null)}}>Profiles</button><button onClick={()=>{setView('messages');setTarget(null)}}>Inbox</button><button onClick={()=>setView('settings')}>Recipient settings</button></nav>
 {view==='profiles'&&<section><h2>Students in your class</h2><button onClick={()=>setDialog('classmate')}>View classmate profile</button><button onClick={()=>setDialog('friend')}>View friend profile</button></section>}
 {view==='settings'&&<Profile profile={profile} onSave={async next=>{setProfile(next);localStorage.setItem('dm-fixture-open',String(next.allow_new_dms))}}/>}
 {view==='messages'&&<Messages key={account} api={api} userId={account} initialTarget={target}/>}
 {dialog==='classmate'&&<PeerProfileDialog api={{detail:async()=>detail,picture:async()=>{throw Error('No picture')}}} course="CSE 310" student={peer} onClose={()=>setDialog(null)} messaging={api} onMessage={open}/>}
 {dialog==='friend'&&<FriendProfileDialog api={friendApi} student={other} onClose={()=>setDialog(null)} messaging={api} onMessage={open}/>}
 </div>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
