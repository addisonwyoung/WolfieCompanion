import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UnreadContext, unreadApi, useMessageNotifications } from './messagingUnread'
import type { UnreadApi, UnreadCounts } from './messagingUnread'
import { useMessagingRefresh } from './useMessaging'
export function MessagingNotifications({client,userId,children,api:provided}:{client?:SupabaseClient;userId:string;children:ReactNode;api?:UnreadApi}){
 const api=useMemo(()=>provided??(client?unreadApi(client):null),[provided,client])
 const {epoch,refresh}=useMessagingRefresh(client),[counts,setCounts]=useState<UnreadCounts>({})
 const alive=useRef(false),acknowledged=useRef(new Map<string,number>()),pending=useRef(new Map<string,number>())
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[userId])
 useEffect(()=>{if(!api)return;const controller=new AbortController();void api.load(controller.signal).then(rows=>{if(!controller.signal.aborted)setCounts(rows)},()=>{/* Missing migration/network errors never hide the workspace. */});return()=>controller.abort()},[api,epoch,userId])
 const markRead=useCallback((id:string,sequence:number)=>{if(!api||sequence<=(acknowledged.current.get(id)??0)||sequence<=(pending.current.get(id)??0))return;pending.current.set(id,sequence);void api.read(id,sequence).then(()=>{if(alive.current){acknowledged.current.set(id,Math.max(sequence,acknowledged.current.get(id)??0));refresh()}},()=>{/* Visible refresh retries failed read positions. */}).finally(()=>{if(pending.current.get(id)===sequence)pending.current.delete(id)})},[api,refresh])
 return <UnreadContext.Provider value={{counts,markRead}}>{children}</UnreadContext.Provider>
}
export function MessagesNavigation({active,onClick}:{active:boolean;onClick:()=>void}){
 const {counts}=useMessageNotifications(),total=Object.values(counts).reduce((sum,n)=>sum+n,0)
 return <button className={total?'dm-nav-unread':undefined} aria-pressed={active} onClick={onClick}>Messages{total>0&&<span className="dm-unread-badge" aria-label={`${total} unread messages`}>{total>99?'99+':total}</span>}</button>
}
