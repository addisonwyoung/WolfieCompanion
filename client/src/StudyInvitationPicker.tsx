import { useEffect, useState } from 'react'
import type { Classmate } from './classmates'
import type { StudyGroup, StudyGroupApi } from './studyGroupApi'

export default function StudyInvitationPicker({api,group,disabled,onInvite}:{api:StudyGroupApi;group:StudyGroup;disabled:boolean;onInvite:(ids:string[])=>void}){
 const [search,setSearch]=useState(''),[rows,setRows]=useState<Classmate[]>([]),[selected,setSelected]=useState<string[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0)
 const remaining=Math.max(0,8-group.members.length-group.pending_count)
 useEffect(()=>{
  let alive=true
  void api.candidates(null,group.group_id,search).then(value=>{if(alive){setRows(value);setError('');setLoading(false)}},()=>{if(alive){setError('Classmates are unavailable. Please retry.');setLoading(false)}})
  return()=>{alive=false}
 },[api,group.group_id,search,retry])
 return <section aria-label="Invite additional classmates"><p>{remaining} places available. Invitations require acceptance and expire after 7 days.</p>
  <label>Find classmates in this offering<input value={search} disabled={disabled} maxLength={100} onChange={event=>{setSearch(event.target.value);setLoading(true)}}/></label>
  {loading&&<p role="status">Loading classmates...</p>}{error&&<p role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>Retry classmates</button></p>}
  <ul className="study-peer-list">{rows.map(row=><li key={row.student_id}><label className="study-peer-choice"><input type="checkbox" disabled={disabled||loading||!selected.includes(row.student_id)&&selected.length>=remaining} checked={selected.includes(row.student_id)} onChange={event=>setSelected(old=>event.target.checked?[...old,row.student_id]:old.filter(id=>id!==row.student_id))}/><span>{row.name}</span></label></li>)}</ul>
  <button disabled={disabled||loading||!selected.length||selected.length>remaining} onClick={()=>{onInvite([...selected].sort());setSelected([])}}>Send invitations</button>
 </section>
}
