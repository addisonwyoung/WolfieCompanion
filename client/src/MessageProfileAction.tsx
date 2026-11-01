import { useEffect, useState } from 'react'
import type { Contact, MessagingApi, Target } from './messaging'
export default function MessageProfileAction({api,target,onMessage}:{api:MessagingApi;target:Target;onMessage:(target:Target)=>void}){
 const [result,setResult]=useState<{key:string;contact:Contact|null}|null>(null),[failed,setFailed]=useState(''),[attempt,setAttempt]=useState(0)
 const {student,course}=target,key=JSON.stringify([student,course,attempt])
 useEffect(()=>{const controller=new AbortController();void api.contact({student,course},controller.signal).then(contact=>{if(!controller.signal.aborted)setResult({key,contact})},()=>{if(!controller.signal.aborted)setFailed(key)});return()=>controller.abort()},[api,student,course,key])
 if(failed===key)return <div><p role="status">Messaging could not be loaded.</p><button onClick={()=>setAttempt(value=>value+1)}>Retry messaging</button></div>
 const contact=result?.key===key?result.contact:undefined
 return <div className="dm-profile-action"><button className="primary" disabled={!contact?.can_send&&!(contact?.conversation_id)} onClick={()=>onMessage({student,course})}>Message</button><p className="field-help">{contact===undefined?'Checking messaging…':contact===null?'Messaging unavailable.':contact.reason==='closed'?'New conversations are closed.':contact.reason==='unavailable'?'This student is unavailable; saved history can still be opened.':'Text messages stay saved in your conversations.'}</p></div>
}
