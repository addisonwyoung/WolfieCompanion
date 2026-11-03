import './academicDialogSupport'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { test, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import AcademicReminderProvider from '../src/AcademicReminderProvider'
import NotificationBell from '../src/NotificationBell'
import { defaultReminderSettings, parseOffsets, parseReminder, parseSettings, reminderApi } from '../src/academicReminders'
import type { AcademicReminder, ReminderApi, ReminderSettings } from '../src/academicReminders'
import { useAcademicReminders } from '../src/reminderContext'
import AcademicItemDialog from '../src/AcademicItemDialog'
import AcademicPlanner from '../src/AcademicPlanner'
import type { AcademicApi, AcademicItem } from '../src/academicItems'
const uid=(n:number)=>`d0000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const note=(n=1):AcademicReminder=>({id:uid(n),item_id:uid(100+n),title:`Exam ${n}`,course_code:'CSE 416',item_type:'exam',offset_key:'day',due_at:'2026-10-28T16:00:00Z',delivered_at:new Date(Date.UTC(2026,9,28,16,0,n)).toISOString(),read_at:null,deadline_date:'2026-10-29',deadline_time:'12:00:00'})
const item:AcademicItem={id:uid(101),user_course_id:uid(900),title:'Exam 1',type:'exam',due_date:'2026-10-29',due_time:'12:00',completed_at:null,location:null,notes:null,reminder_offsets:null}
const courses=[{id:'course',databaseId:uid(900),code:'CSE 416',sections:[]}] as never
function deferred<T>(){let resolve!:(v:T)=>void;let reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function fixture(count=1){let rows=Array.from({length:count},(_,i)=>note(i+1)),settings:ReminderSettings=structuredClone(defaultReminderSettings),bound=0
 const order=new Map(rows.map((r,i)=>[r.id,i+1]))
 const api:ReminderApi={refresh:vi.fn(async()=>{}),list:vi.fn(async(_signal,before)=>{const sorted=[...rows].sort((a,b)=>b.delivered_at.localeCompare(a.delivered_at));const start=before?sorted.findIndex(r=>r.id===before.id)+1:0;return {rows:sorted.slice(start,start+20),unread:rows.filter(r=>!r.read_at).length}}),settings:vi.fn(async()=>settings),saveSettings:vi.fn(async value=>{settings=value;return settings}),read:vi.fn(async id=>{rows=rows.map(r=>r.id===id?{...r,read_at:'2026-10-28T17:00:00Z'}:r)}),clear:vi.fn(async id=>{rows=rows.filter(r=>r.id!==id)}),bound:vi.fn(async()=>{bound=Math.max(0,...order.values());return bound}),clearAll:vi.fn(async value=>{rows=rows.filter(r=>(order.get(r.id)??999)>value)})}
 return {api,get rows(){return rows},incoming(){const row=note(999);rows.push(row);order.set(row.id,999)}}
}
const checkItem=vi.fn(async()=>true)
function view(api:ReminderApi,onViewItem=vi.fn()){return <AcademicReminderProvider api={api}><NotificationBell checkItem={checkItem} onViewItem={onViewItem}/></AcademicReminderProvider>}
async function bell(){fireEvent.click(await screen.findByRole('button',{name:/^Notifications/}));await screen.findByRole('heading',{name:'Reminders'})}
test('strict reminder parsing and typed scoped API reject forged shape and preserve errors',async()=>{
 expect(parseSettings(defaultReminderSettings)).toEqual(defaultReminderSettings);for(const v of [['day','day'],['bad'],null])expect(()=>parseOffsets(v)).toThrow();expect(parseReminder({...note(),owner:'secret'})).toEqual(note());expect(()=>parseReminder({...note(),item_id:'bad'})).toThrow()
 const result={data:{rows:[note()],unread:4},error:null as {code:string}|null};const rpc=vi.fn(()=>({then:(r:unknown)=>Promise.resolve(result).then(r as never),abortSignal:async()=>result}));const api=reminderApi({rpc} as unknown as SupabaseClient);expect((await api.list(new AbortController().signal)).unread).toBe(4);await api.read(uid(1));expect(rpc).toHaveBeenLastCalledWith('academic_reminder_read',{p_id:uid(1)});result.error={code:'PGRST202'};await expect(api.settings(new AbortController().signal)).rejects.toThrow('not set up');await expect(api.clear('bad')).rejects.toThrow('Invalid')
})
test('bell opening does not read; selecting reads one, details persist and View item uses original identity',async()=>{
 const f=fixture(2),navigate=vi.fn();render(view(f.api,navigate));await screen.findByRole('button',{name:'Notifications, 2 unread'});await bell();expect(f.api.read).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:/^Exam 2CSE/}));await screen.findByRole('heading',{name:'Exam 2'});await waitFor(()=>expect(f.api.read).toHaveBeenCalledWith(uid(2)));await screen.findByRole('button',{name:'Notifications, 1 unread'});await waitFor(()=>expect(screen.getByRole('button',{name:'View item'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'View item'}));expect(navigate).toHaveBeenCalledWith(uid(102));expect(f.rows).toHaveLength(2)
})
test('individual clear persists and failed clear retains context until explicit retry',async()=>{
 const f=fixture();vi.mocked(f.api.clear).mockRejectedValueOnce(Error('Offline'));render(view(f.api));await bell();fireEvent.click(await screen.findByRole('button',{name:'Clear reminder for Exam 1'}));await screen.findByText('Offline');expect(f.rows).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'Clear reminder for Exam 1'}));await screen.findByText(/No reminders/);expect(f.rows).toHaveLength(0);expect(f.api.read).not.toHaveBeenCalled()
})
test('clear all includes unloaded pages and retry retains original server bound, preserving new arrivals',async()=>{
 const f=fixture(25);vi.mocked(f.api.clearAll).mockRejectedValueOnce(Error('Lost response'));render(view(f.api));await screen.findByRole('button',{name:'Notifications, 25 unread'});await bell();expect(screen.getAllByRole('button',{name:/^Clear reminder for/})).toHaveLength(20);fireEvent.click(screen.getByRole('button',{name:'Clear all'}));await screen.findByText('Lost response');f.incoming();fireEvent.click(screen.getByRole('button',{name:'Retry clear all'}));await screen.findByRole('button',{name:/^Exam 999CSE/});expect(f.api.bound).toHaveBeenCalledOnce();expect(f.api.clearAll).toHaveBeenNthCalledWith(1,25);expect(f.api.clearAll).toHaveBeenNthCalledWith(2,25);expect(f.rows).toHaveLength(1)
})
test('settings save, cancel/discard and defaults persist without mutating current item overrides',async()=>{
 const f=fixture();render(view(f.api));await bell();await waitFor(()=>expect(screen.getByRole('button',{name:'Reminder settings'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Reminder settings'}));const enabled=screen.getByRole('checkbox',{name:'Enable academic reminders'});fireEvent.click(enabled);fireEvent.click(screen.getByRole('button',{name:'Cancel'}));await screen.findByText('Discard unsaved reminder settings?');fireEvent.click(screen.getByRole('button',{name:'Keep editing'}));expect(enabled).not.toBeChecked();fireEvent.click(screen.getByRole('button',{name:'Save settings'}));await waitFor(()=>expect(f.api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({enabled:false})));await waitFor(()=>expect(screen.queryByRole('heading',{name:'Reminder settings'})).not.toBeInTheDocument())
})
test('date-only editor excludes three hours, includes reminder changes in dirty discard and saves atomically',async()=>{
 const save=vi.fn(async()=>true);render(<AcademicItemDialog initial={{...item,due_time:'12:00',reminder_offsets:['three_hours']}} editing courses={courses} busy={false} saveError={null} onSave={save} onClose={vi.fn()}/>);fireEvent.change(screen.getByLabelText('Time (optional)'),{target:{value:''}});expect(screen.getByText(/Three-hour reminder removed/)).toBeInTheDocument();expect(screen.getByRole('checkbox',{name:'3 hours before'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Cancel'}));await screen.findByRole('heading',{name:'Discard unsaved changes?'});fireEvent.click(screen.getByRole('button',{name:'Keep Editing'}));fireEvent.click(screen.getByRole('button',{name:'Save item'}));await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({due_time:null,reminder_offsets:[]})))
})
test('paged retry uses same cursor and full count; Escape closes dropdown without marking read',async()=>{
 const f=fixture(25);render(view(f.api));await bell();await screen.findByRole('button',{name:'Load more reminders'});vi.mocked(f.api.list).mockRejectedValueOnce(Error('Page failed'));fireEvent.click(screen.getByRole('button',{name:'Load more reminders'}));await screen.findByText('Page failed');fireEvent.click(screen.getByRole('button',{name:'Load more reminders'}));await waitFor(()=>expect(screen.getAllByRole('button',{name:/^Clear reminder for/})).toHaveLength(25));const calls=vi.mocked(f.api.list).mock.calls;expect(calls.at(-1)?.[1]?.id).toBe(calls.at(-2)?.[1]?.id);fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('heading',{name:'Reminders'})).not.toBeInTheDocument();expect(f.api.read).not.toHaveBeenCalled()
})
test('account replacement ignores late settings/read/clear and refresh responses',async()=>{
 const f=fixture(),late=deferred<void>();vi.mocked(f.api.clear).mockReturnValueOnce(late.promise);const {rerender}=render(<div key="one">{view(f.api)}</div>);await bell();fireEvent.click(await screen.findByRole('button',{name:'Clear reminder for Exam 1'}));const other=fixture(0);rerender(<div key="two">{view(other.api)}</div>);await act(async()=>late.resolve());await bell();await screen.findByText(/No reminders/);expect(screen.queryByText('Exam 1')).not.toBeInTheDocument()
})
test('foreground refresh discovers arrivals without opening planner and hidden visibility pauses refresh',async()=>{
 const f=fixture(0);function Status(){const state=useAcademicReminders()!;return <p>Count {state.unread}</p>};render(<AcademicReminderProvider api={f.api}><Status/></AcademicReminderProvider>);await screen.findByText('Count 0');f.incoming();fireEvent.focus(window);await screen.findByText('Count 1');expect(f.api.refresh).toHaveBeenCalledTimes(2)
})
test('notification target opens existing editor before first planner use and preserves unmatched course filter',async()=>{
 const api:AcademicApi={load:vi.fn(async()=>[item]),save:vi.fn(async value=>({...value,id:item.id})),complete:vi.fn(),remove:vi.fn()};const {rerender}=render(<AcademicPlanner api={api} courses={courses} onAddCourses={vi.fn()}/>);await screen.findByText('Exam 1');fireEvent.change(screen.getByLabelText('Filter by type'),{target:{value:'assignment'}});rerender(<AcademicPlanner api={api} courses={courses} onAddCourses={vi.fn()} reminderTarget={{id:item.id,nonce:'one'}}/>);await screen.findByRole('heading',{name:'Edit academic item'});expect(screen.getByLabelText('Title')).toHaveValue('Exam 1');fireEvent.click(screen.getByRole('button',{name:'Cancel'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(screen.getByLabelText('Filter by type')).toHaveValue('assignment');expect(within(screen.getByRole('region',{name:'Assignments & Exams'})).queryByRole('heading',{name:'Edit academic item'})).not.toBeInTheDocument()
})

test('master settings save failure keeps draft and permits explicit retry',async()=>{
 const f=fixture();vi.mocked(f.api.saveSettings).mockRejectedValueOnce(Error('Settings offline'));render(view(f.api));await bell();await waitFor(()=>expect(screen.getByRole('button',{name:'Reminder settings'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Reminder settings'}));fireEvent.click(screen.getByRole('checkbox',{name:'Enable academic reminders'}));fireEvent.click(screen.getByRole('button',{name:'Save settings'}));await screen.findByText('Settings offline');expect(screen.getByRole('checkbox',{name:'Enable academic reminders'})).not.toBeChecked();fireEvent.click(screen.getByRole('button',{name:'Save settings'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(f.api.saveSettings).toHaveBeenCalledTimes(2)
})
for(const kind of ['read','saveSettings'] as const)test(`pending ${kind} cannot populate replacement account`,async()=>{
 const f=fixture(),late=deferred<never>();vi.mocked(f.api[kind]).mockReturnValueOnce(late.promise);
 const {rerender}=render(<div key="a">{view(f.api)}</div>);await bell();if(kind==='read'){fireEvent.click(await screen.findByRole('button',{name:/^Exam 1CSE/}))}else{await waitFor(()=>expect(screen.getByRole('button',{name:'Reminder settings'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Reminder settings'}));fireEvent.click(screen.getByRole('button',{name:'Save settings'}))}
 await waitFor(()=>expect(f.api[kind]).toHaveBeenCalledOnce());const other=fixture(0);rerender(<div key="b">{view(other.api)}</div>);await act(async()=>late.resolve(defaultReminderSettings as never));await bell();await screen.findByText(/No reminders/);expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
test('hidden app stops polling and returning refreshes; stale initial reads never restore old reminders',async()=>{
 const f=fixture(),late=deferred<void>();vi.mocked(f.api.refresh).mockReturnValueOnce(late.promise);const {rerender}=render(<div key="old">{view(f.api)}</div>);const other=fixture(0);rerender(<div key="new">{view(other.api)}</div>);await act(async()=>late.resolve());await bell();await screen.findByText(/No reminders/);
 const getter=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');fireEvent(document,new Event('visibilitychange'));const count=vi.mocked(other.api.refresh).mock.calls.length;fireEvent.focus(window);expect(other.api.refresh).toHaveBeenCalledTimes(count);getter.mockReturnValue('visible');fireEvent(document,new Event('visibilitychange'));await waitFor(()=>expect(other.api.refresh).toHaveBeenCalledTimes(count+1));getter.mockRestore()
})
test('item normalization handles distinct overrides and missing reminder columns preserve core CRUD',async()=>{
 const {normalizeItem,academicItemsApi}=await import('../src/academicItems');expect(normalizeItem({...item,reminder_offsets:['day','three_hours']})).toMatchObject({reminder_offsets:['day','three_hours']});expect(()=>normalizeItem({...item,due_time:null,reminder_offsets:['three_hours']})).toThrow('require');
 const order=vi.fn().mockResolvedValueOnce({data:null,error:{code:'42703'}}).mockResolvedValue({data:[item],error:null}),single=vi.fn(async()=>({data:item,error:null}));const insert=vi.fn(()=>({select:()=>({single})}));const api=academicItemsApi({from:()=>({select:()=>({order}),insert})} as unknown as SupabaseClient);expect(await api.load()).toEqual([item]);await expect(api.save({...item,reminder_offsets:['day']})).rejects.toThrow('not set up');const {reminder_offsets,...base}=item;expect(reminder_offsets).toBeNull();await api.save(base);expect(insert).toHaveBeenCalledOnce()
})

test('failed reminder read keeps unread count and explicit retry marks only that entry',async()=>{
 const f=fixture(2);vi.mocked(f.api.read).mockRejectedValueOnce(Error('Read offline'));render(view(f.api));await bell();fireEvent.click(await screen.findByRole('button',{name:/^Exam 2CSE/}));await screen.findByText('Reading was not saved.');expect(screen.getByRole('button',{name:'Notifications, 2 unread'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Retry read'}));await screen.findByRole('button',{name:'Notifications, 1 unread'});expect(f.rows.filter(row=>row.read_at)).toHaveLength(1)
})
test('missing reminder item produces unavailable state without opening an editor',async()=>{
 const f=fixture(),navigate=vi.fn();render(<AcademicReminderProvider api={f.api}><NotificationBell checkItem={async()=>false} onViewItem={navigate}/></AcademicReminderProvider>);await bell();fireEvent.click(await screen.findByRole('button',{name:/^Exam 1CSE/}));await screen.findByText('This academic item is no longer available.');expect(screen.getByRole('button',{name:'View item'})).toBeDisabled();expect(navigate).not.toHaveBeenCalled()
})
