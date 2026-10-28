import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ReminderApi, AcademicReminder, ReminderSettings } from './academicReminders'
import { ReminderContext } from './reminderContext'
export default function AcademicReminderProvider({ api, children }: { api: ReminderApi; children: ReactNode }) {
 const [rows,setRows]=useState<AcademicReminder[]>([]),[unread,setUnread]=useState(0),[settings,setSettings]=useState<ReminderSettings|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[actionError,setActionError]=useState(''),[batchRetry,setBatchRetry]=useState(false),[busy,setBusy]=useState(false),[more,setMore]=useState(false),[paging,setPaging]=useState(false)
 const alive=useRef(false),generation=useRef(0),controller=useRef<AbortController|null>(null),pages=useRef(1),writing=useRef(false),pageBusy=useRef(false),pageController=useRef<AbortController|null>(null),batchBound=useRef<number|null>(null)
 const refresh=useCallback(async()=>{
  if(!alive.current||document.visibilityState==='hidden')return
  controller.current?.abort();pageController.current?.abort();pageBusy.current=false;setPaging(false)
  const abort=new AbortController();controller.current=abort;const run=++generation.current
  try {
   await api.refresh(abort.signal)
   const prefs=await api.settings(abort.signal)
   let all:AcademicReminder[]=[],count=0,hasMore=false
   for(let n=0;n<pages.current;n++){const page=await api.list(abort.signal,all.at(-1));all=[...all,...page.rows];count=page.unread;hasMore=page.rows.length===20;if(!hasMore)break}
   if(!alive.current||run!==generation.current||abort.signal.aborted)return
   setRows(all);setUnread(count);setSettings(prefs);setMore(hasMore);setError('');setLoading(false)
  } catch(problem){if(alive.current&&run===generation.current&&!abort.signal.aborted){setError(problem instanceof Error?problem.message:'Unable to load reminders. Please retry.');setLoading(false)}}
 },[api])
 useEffect(()=>{alive.current=true;let timer:ReturnType<typeof setInterval>|undefined
  function start(){if(timer)clearInterval(timer);timer=undefined;if(document.visibilityState==='hidden'){controller.current?.abort();pageController.current?.abort();return}void refresh();timer=setInterval(()=>void refresh(),30_000)}
  const foreground=()=>{void refresh()};start();document.addEventListener('visibilitychange',start);window.addEventListener('focus',foreground);window.addEventListener('online',foreground)
  return()=>{alive.current=false;
// Request generation counter, not a DOM ref.
// eslint-disable-next-line react-hooks/exhaustive-deps
generation.current++;controller.current?.abort();pageController.current?.abort();if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',start);window.removeEventListener('focus',foreground);window.removeEventListener('online',foreground)}
 },[refresh])
 async function loadMore(){if(pageBusy.current||!rows.length)return;pageBusy.current=true;setPaging(true);const run=generation.current,abort=new AbortController();pageController.current=abort
  try{const page=await api.list(abort.signal,rows.at(-1));if(alive.current&&run===generation.current&&!abort.signal.aborted){pages.current++;setRows(old=>[...new Map([...old,...page.rows].map(row=>[row.id,row])).values()]);setUnread(page.unread);setMore(page.rows.length===20);setError('')}}catch(problem){if(alive.current&&!abort.signal.aborted)setError(problem instanceof Error?problem.message:'Unable to load reminders.')}finally{if(pageController.current===abort){pageBusy.current=false;if(alive.current)setPaging(false)}}
 }
 async function mutate(action:()=>Promise<void>){if(writing.current||!alive.current)return false;writing.current=true;setBusy(true);setActionError('');try{await action();if(!alive.current)return false;await refresh();return alive.current}catch(problem){if(alive.current)setActionError(problem instanceof Error?problem.message:'Unable to update reminders.');return false}finally{writing.current=false;if(alive.current)setBusy(false)}}
 async function clearAll(){return mutate(async()=>{if(batchBound.current===null)batchBound.current=await api.bound();if(alive.current)setBatchRetry(true);await api.clearAll(batchBound.current);batchBound.current=null;if(alive.current)setBatchRetry(false)})}
 return <ReminderContext.Provider value={{rows,unread,settings,loading,error:actionError||error,batchRetry,busy,more,paging,refresh,loadMore,markRead:id=>mutate(()=>api.read(id)),clear:id=>mutate(()=>api.clear(id)),clearAll,saveSettings:value=>mutate(async()=>{await api.saveSettings(value)})}}>{children}</ReminderContext.Provider>
}
