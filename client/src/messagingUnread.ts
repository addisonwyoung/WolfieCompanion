import { createContext, useContext } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
export type UnreadCounts=Record<string,number>
export interface UnreadApi {
 load(signal:AbortSignal):Promise<UnreadCounts>
 read(conversation:string,sequence:number):Promise<void>
}
export function unreadApi(client:SupabaseClient):UnreadApi{return {
 async load(signal){const {data,error}=await client.rpc('dm_unread').abortSignal(signal);if(error)throw new Error('Unread status unavailable');if(!Array.isArray(data))throw new Error('Invalid unread status');const counts:UnreadCounts={};for(const row of data){if(!row||typeof row.conversation_id!=='string'||!Number.isSafeInteger(row.count)||row.count<1)throw new Error('Invalid unread status');counts[row.conversation_id]=row.count}return counts},
 async read(conversation,sequence){const {error}=await client.rpc('dm_mark_read',{p_conversation_id:conversation,p_sequence:sequence});if(error)throw new Error('Unable to mark read')},
}}
export const UnreadContext=createContext<{counts:UnreadCounts;markRead:(id:string,sequence:number)=>void}>({counts:{},markRead:()=>{}})
export const useMessageNotifications=()=>useContext(UnreadContext)
