import { useEffect, useMemo, useRef, useState } from 'react'
import type { GroupApi, GroupDetail } from './groupMessaging'
import type { Message, MessagingApi } from './messaging'
import { useDirectChat } from './useMessaging'
// Reuse exact pending/retry/paging mechanics, with a group-specific validating adapter.
export function useGroupChat(api:GroupApi,id:string,userId:string,epoch:number,onSent:()=>void){
 const [detail,setDetail]=useState<GroupDetail|null>(null)
 const latest=useRef<GroupDetail|null>(null)
 const adapter=useMemo<MessagingApi>(()=>{ function validate(rows:Message[]){const value=latest.current;if(!value)throw Error('Group unavailable');if(rows.some(row=>row.conversation_id!==id||row.sequence<=value.joined_after_sequence||!row.sender_name))throw Error('Invalid group message ownership');return rows}
return ({
  async contact(_target,signal){let value:GroupDetail;try{value=await api.detail(id,signal)}catch(error){if(!signal.aborted&&error instanceof Error&&'code' in error&&error.code==='42501'){latest.current=null;setDetail(null);return null}throw error}if(signal.aborted)throw Error('Aborted');if(!value.members.some(m=>m.student_id===userId))throw Error('Group membership unavailable');latest.current=value;setDetail(value);return {history_floor:value.joined_after_sequence,student_id:id,name:value.name,conversation_id:id,can_send:true,reason:null}},
  inbox:async()=>[],
  async history(group,signal,before,after){const floor=latest.current?.joined_after_sequence??0;if(before!==undefined&&before<=floor+1)return [];const rows=await api.history(group,signal,before,after===undefined?undefined:Math.max(after,floor));return validate(rows)},
  async send(_target,body,request){const row=await api.send(id,body,request);return validate([row])[0]},
 })},[api,id,userId])

 // The explicit group verifier above replaces, rather than relaxes, the pair verifier.
 const chat=useDirectChat(adapter,{student:id},userId,epoch,onSent, true)
 useEffect(()=>()=>{latest.current=null},[])
 const floor=detail?.joined_after_sequence
 const messages=useMemo(()=>floor===undefined?[]:chat.messages.filter(row=>row.sequence>floor),[chat.messages,floor])
 return {...chat,messages,detail}
}
