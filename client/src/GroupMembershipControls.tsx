import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GroupAdditionPermission, GroupApi, GroupDetail } from './groupMessaging'

export default function GroupMembershipControls({api,group,onChanged,onLeft,children}:{api:GroupApi;group:GroupDetail;onChanged:()=>void;onLeft:()=>void;children?:(controls:ReactNode,leaveControl:ReactNode,leaveDisabled:boolean,feedback:ReactNode)=>ReactNode}){
 const [selection,setPermission]=useState<GroupAdditionPermission|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const permission=selection??group.addition_permission
 const [attempt,setAttempt]=useState<{kind:'permission'|'leave';id:string;permission:GroupAdditionPermission}|null>(null)
 const alive=useRef(true),pending=useRef(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 async function perform(kind:'permission'|'leave'){
  if(pending.current)return
  const next=attempt??{kind,id:crypto.randomUUID(),permission}
  pending.current=true;setAttempt(next);setBusy(true);setError('')
  try{
   if(next.kind==='leave')await api.leave(group.group_id,next.id)
   else await api.setPermission(group.group_id,next.permission,next.id)
   if(alive.current){setAttempt(null);setPermission(null);if(next.kind==='leave')onLeft();else onChanged()}
  }catch(error){if(alive.current)setError(error instanceof Error?error.message:'Group change could not be confirmed. Please retry.')}
  finally{pending.current=false;if(alive.current)setBusy(false)}
 }
 const feedback=error&&<div className="group-membership-feedback" role="alert"><p>{error}</p><button disabled={busy} onClick={()=>void perform(attempt!.kind)}>Retry group change</button><button disabled={busy} onClick={()=>{setAttempt(null);setError('')}}>Discard group attempt</button></div>
 const controls=<div className="group-membership-controls">
  <section className="group-policy-settings" aria-label="Member addition permissions"><h4>Member Addition Permissions</h4>
  <p>Member additions: {group.addition_permission==='creator_only'?'Creator Only':'All Members'}</p>
  {group.can_manage&&<><label>Who can add members<select value={permission} disabled={busy||!!attempt} onChange={event=>setPermission(event.target.value as GroupAdditionPermission)}><option value="all_members">All Members</option><option value="creator_only">Creator Only</option></select></label><button disabled={busy||!!attempt||permission===group.addition_permission} onClick={()=>void perform('permission')}>Save group setting</button></>}
  </section>
  <section className="group-leave-settings" aria-label="Leave group"><h4>Leave Group</h4>
  <button disabled={busy||!!attempt} onClick={()=>void perform('leave')}>Leave Group</button>
  {group.can_manage&&<p>Leaving permanently switches this group to All Members. Returning will not restore creator controls.</p>}
  </section>
  {feedback}
 </div>
 return children?children(controls,<button disabled={busy||!!attempt} onClick={()=>void perform('leave')}>Leave this group</button>,busy||!!attempt,feedback):controls
}
