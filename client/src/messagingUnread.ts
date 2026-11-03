import { conversationKey, groupError, isUuid, missingGroups } from './groupMessaging'
import type { ConversationKind } from './groupMessaging'
import { createContext, useContext } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
export type UnreadCounts=Record<string,number>
export interface UnreadApi {
 load(signal:AbortSignal):Promise<UnreadCounts>
 read(conversation:string,sequence:number):Promise<void>
}
export function unreadApi(client:SupabaseClient):UnreadApi{return {
 async load(signal){
  let {data,error}=await client.rpc('messaging_unread').abortSignal(signal)
  let legacy=false
  if(error&&missingGroups(error)){legacy=true;const result=await client.rpc('dm_unread').abortSignal(signal);data=result.data;error=result.error}
  if(error)throw groupError(error);if(!Array.isArray(data))throw Error('Invalid unread status')
  const counts:UnreadCounts={};for(const row of data){const kind=legacy?'direct':row?.kind;if(!row||!isUuid(row.conversation_id)||!['direct','group'].includes(kind)||!Number.isSafeInteger(row.count)||row.count<1)throw Error('Invalid unread status');const key=conversationKey(row.conversation_id,kind);if(key in counts)throw Error('Duplicate unread status');counts[key]=row.count}return counts
 },
 async read(conversation,sequence){const grouped=conversation.startsWith('group:'),id=conversation.replace(/^(direct|group):/,'');if(!isUuid(id)||!Number.isSafeInteger(sequence)||sequence<=0)throw Error('Invalid read position');const {error}=await client.rpc(grouped?'group_mark_read':'dm_mark_read',grouped?{p_group_id:id,p_sequence:sequence}:{p_conversation_id:id,p_sequence:sequence});if(error)throw groupError(error)},
}}
export const UnreadContext=createContext<{counts:UnreadCounts;markRead:(id:string,sequence:number)=>void}>({counts:{},markRead:()=>{}})
export const useMessageNotifications=()=>useContext(UnreadContext)

export const unreadCount=(counts:UnreadCounts,id:string,kind:ConversationKind='direct')=>counts[conversationKey(id,kind)]??(kind==='direct'?counts[id]??0:0)
