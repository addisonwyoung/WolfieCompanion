// Test-only synthetic persistence and clock. Never imported by production.
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import AcademicReminderProvider from '../src/AcademicReminderProvider'
import NotificationBell from '../src/NotificationBell'
import AcademicPlanner from '../src/AcademicPlanner'
import { defaultReminderSettings } from '../src/academicReminders'
import type { AcademicReminder, ReminderApi, ReminderSettings } from '../src/academicReminders'
import type { AcademicItem, AcademicApi } from '../src/academicItems'
import type { SavedCourse } from '../src/account'
import '../src/index.css'
import '../src/App.css'
const uid=(n:number)=>`f0000000-0000-0000-0000-${String(n).padStart(12,'0')}`
type Store={rows:(AcademicReminder&{order:number})[];settings:ReminderSettings;items:AcademicItem[];next:number}
const courses=[{id:'course',databaseId:uid(900),code:'CSE 416',sections:[]}] as unknown as SavedCourse[]
function initial():Store{return {rows:[],settings:structuredClone(defaultReminderSettings),next:1,items:[{id:uid(101),user_course_id:uid(900),title:'Exam on distributed systems',type:'exam',due_date:'2026-11-10',due_time:'17:00',notes:null,location:null,completed_at:null,reminder_offsets:null}]}}
function read(account:string):Store{return JSON.parse(localStorage.getItem(`reminder-fixture-${account}`)??JSON.stringify(initial()))}
function write(account:string,data:Store){localStorage.setItem(`reminder-fixture-${account}`,JSON.stringify(data))}
declare global{interface Window{reminderFixture:{arrive:(n?:number)=>void;switchAccount:(id:string)=>void;hold:boolean;release?:()=>void;failClear:boolean;clock:number}}}
const fixture:{arrive:(n?:number)=>void;switchAccount:(id:string)=>void;hold:boolean;release?:()=>void;failClear:boolean;clock:number}={arrive:()=>{},switchAccount:()=>{},hold:false,release:undefined as undefined|(()=>void),failClear:false,clock:0};window.reminderFixture=fixture
export function Workspace({account}:{account:string}){
 const [view,setView]=useState('dashboard'),[target,setTarget]=useState<{id:string;nonce:string}|null>(null)
 const {api,items,arrive}=useMemo(()=>{
  const delay=async()=>{if(fixture.hold)await new Promise<void>(resolve=>{fixture.release=resolve})}
  const api:ReminderApi={refresh:async()=>{},list:async(_signal,before)=>{const data=read(account),sorted=[...data.rows].sort((a,b)=>b.order-a.order),start=before?sorted.findIndex(row=>row.id===before.id)+1:0;return {rows:sorted.slice(start,start+20),unread:data.rows.filter(row=>!row.read_at).length}},settings:async()=>read(account).settings,saveSettings:async settings=>{await delay();const data=read(account);data.settings=settings;write(account,data);return settings},read:async id=>{await delay();const data=read(account);data.rows=data.rows.map(row=>row.id===id?{...row,read_at:new Date().toISOString()}:row);write(account,data)},clear:async id=>{await delay();if(fixture.failClear){fixture.failClear=false;throw Error('Offline: clear was not confirmed.')}const data=read(account);data.rows=data.rows.filter(row=>row.id!==id);write(account,data)},bound:async()=>read(account).next-1,clearAll:async bound=>{await delay();if(fixture.failClear){fixture.failClear=false;throw Error('Offline: clear was not confirmed.')}const data=read(account);data.rows=data.rows.filter(row=>row.order>bound);write(account,data)}}
  const items:AcademicApi={load:async()=>read(account).items,save:async(input,id)=>{await delay();const data=read(account),item={...input,id:id??crypto.randomUUID()};data.items=[...data.items.filter(row=>row.id!==item.id),item];data.rows=data.rows.filter(row=>row.item_id!==item.id);write(account,data);return item},complete:async(id,complete)=>{const data=read(account),item={...data.items.find(row=>row.id===id)!,completed_at:complete?new Date().toISOString():null};data.items=data.items.map(row=>row.id===id?item:row);data.rows=data.rows.filter(row=>row.item_id!==id);write(account,data);return item},remove:async id=>{const data=read(account);data.items=data.items.filter(row=>row.id!==id);data.rows=data.rows.filter(row=>row.item_id!==id);write(account,data)}}
  const arrive=(count=1)=>{const data=read(account);fixture.clock++;for(let n=0;n<count;n++){const order=data.next++;data.rows.push({id:uid(order),item_id:uid(101),title:count>1?`Study deadline ${order} with a long but readable title`:data.items[0].title,course_code:'CSE 416',item_type:'exam',offset_key:'day',due_at:new Date(Date.UTC(2026,9,28,12,0,order)).toISOString(),delivered_at:new Date(Date.UTC(2026,9,28,12,0,order)).toISOString(),read_at:null,deadline_date:'2026-11-10',deadline_time:'17:00:00',order})}write(account,data);window.dispatchEvent(new Event('focus'))}
  return {api,items,arrive}
 },[account])
 useEffect(()=>{fixture.arrive=arrive},[arrive])
 const checkItem=useMemo(()=>async(id:string)=>(await items.load()).some(row=>row.id===id),[items])
 return <AcademicReminderProvider api={api}><div className="app"><h1>Reminders — synthetic fixture</h1><p>Account {account} · no hosted connection</p><nav className="app-nav"><NotificationBell checkItem={checkItem} onViewItem={id=>{setView('academic');setTarget({id,nonce:crypto.randomUUID()})}}/><button onClick={()=>setView('dashboard')}>Dashboard</button><button onClick={()=>setView('academic')}>Assignments &amp; Exams</button></nav>{view==='dashboard'&&<p>Dashboard</p>}<div hidden={view!=='academic'}><AcademicPlanner api={items} courses={courses} active={view==='academic'} onAddCourses={()=>{}} reminderTarget={target}/></div></div></AcademicReminderProvider>
}
export function App(){const [account,setAccount]=useState('one');useEffect(()=>{fixture.switchAccount=setAccount},[]);return <Workspace key={account} account={account}/>}
createRoot(document.getElementById('root')!).render(<App/>);
