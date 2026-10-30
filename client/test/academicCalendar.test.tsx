import './academicDialogSupport'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import AcademicPlanner from '../src/AcademicPlanner'
import AcademicCalendar from '../src/AcademicCalendar'
import { campusDate, itemsByDate, monthCells, monthSelection, readableDay, readableMonth, shiftMonth } from '../src/academicCalendarDates'
import type { AcademicApi, AcademicItem } from '../src/academicItems'
import type { SavedCourse } from '../src/account'

const courses:SavedCourse[]=[{id:'cse-310',databaseId:'10000000-0000-0000-0000-000000000021',code:'CSE 310'},{id:'ams-210',databaseId:'10000000-0000-0000-0000-000000000022',code:'AMS 210'}]
const item:AcademicItem={id:'one',user_course_id:courses[0].databaseId,title:'Homework',type:'assignment',due_date:'2026-10-23',due_time:null,notes:'Private notes',location:'Library',completed_at:null}
function fixture(seed:AcademicItem[]=[item]):AcademicApi {
 let rows=seed.map(row=>({...row}))
 return {load:vi.fn(async()=>rows),save:vi.fn(async(value,id)=>{const next={...value,id:id??'created'};rows=[...rows.filter(row=>row.id!==next.id),next];return next}),complete:vi.fn(async(id,done)=>{const next={...rows.find(row=>row.id===id)!,completed_at:done?new Date().toISOString():null};rows=rows.map(row=>row.id===id?next:row);return next}),remove:vi.fn(async(id)=>{rows=rows.filter(row=>row.id!==id)})}
}
function show(api=fixture()){return render(<AcademicPlanner api={api} courses={courses} onAddCourses={vi.fn()}/>)}
async function calendar(){await screen.findByRole('button',{name:'Add item'});fireEvent.click(screen.getByRole('tab',{name:'Calendar'}));await screen.findByRole('heading',{name:'October 2026'})}
function event(title='Homework'){return screen.getByRole('button',{name:new RegExp(`^Edit ${title},`)})}
function escape(){fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}))}
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-23T16:00:00Z'))})
afterEach(()=>vi.useRealTimers())

test('calendar helpers handle leap days, weekday alignment, early years, bounds and stable dates',()=>{
 expect(monthCells('2026-11')[0]).toBe('2026-11-01')
 expect(monthCells('2024-02').filter(Boolean)).toHaveLength(29)
 expect(monthCells('2025-02').filter(Boolean)).toHaveLength(28)
 expect(monthCells('0001-01')[1]).toBe('0001-01-01')
 expect(readableDay('0099-01-02')).toBe('January 2, 99')
 expect(readableMonth('0001-01')).toBe('January 1')
 expect(monthCells('9999-12').filter(Boolean).at(-1)).toBe('9999-12-31')
 expect(shiftMonth('2026-12',1)).toBe('2027-01');expect(shiftMonth('2027-01',-1)).toBe('2026-12')
 expect(shiftMonth('0001-01',-1)).toBeNull();expect(shiftMonth('9999-12',1)).toBeNull()
 expect(monthSelection('2026-10','2026-10-23')).toBe('2026-10-23');expect(monthSelection('2026-11','2026-10-23')).toBe('2026-11-01')
 for(const date of ['2026-03-08T06:59:59Z','2026-03-08T07:00:00Z'])expect(campusDate(new Date(date))).toBe('2026-03-08')
 expect(campusDate(new Date('2026-11-01T03:59:59Z'))).toBe('2026-10-31')
 expect(campusDate(new Date('2026-11-01T04:00:00Z'))).toBe('2026-11-01')
 const grouped=itemsByDate([{...item,id:'z'},{...item,id:'b',due_time:'12:00'},{...item,id:'a',due_time:'12:00'},{...item,id:'next',due_date:'2026-11-01'}],'2026-10')
 expect(grouped.get('2026-10-23')?.map(row=>row.id)).toEqual(['a','b','z'])
 expect(grouped.size).toBe(1);expect(item.due_time).toBeNull()
})

test('tabs retain independent status and shared filters/month without additional loads or writes',async()=>{
 const api=fixture([item,{...item,id:'completed',title:'Completed exam',type:'exam',completed_at:'2026-10-20T12:00:00Z'}]);show(api)
 await screen.findByRole('heading',{name:'Homework'})
 expect(screen.getByRole('tab',{name:'Agenda'})).toHaveAttribute('aria-selected','true')
 fireEvent.click(screen.getByRole('button',{name:'Actions for Homework'}));expect(screen.getByRole('menu')).toBeInTheDocument()
 const user=userEvent.setup();screen.getByRole('tab',{name:'Agenda'}).focus();await user.keyboard('{ArrowRight}')
 expect(screen.queryByRole('menu')).not.toBeInTheDocument();expect(screen.getByRole('tab',{name:'Calendar'})).toHaveFocus()
 expect(screen.getByLabelText('Calendar completion status')).toHaveValue('all');expect(event('Completed exam')).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Filter by course'),{target:{value:courses[0].databaseId}})
 fireEvent.change(screen.getByLabelText('Calendar completion status'),{target:{value:'completed'}})
 fireEvent.click(screen.getByRole('button',{name:'Next month'}));expect(screen.getByRole('heading',{name:'November 2026'})).toBeInTheDocument()
 screen.getByRole('tab',{name:'Calendar'}).focus();await user.keyboard('{Home}')
 expect(screen.getByRole('button',{name:'Pending'})).toHaveAttribute('aria-pressed','true')
 expect(screen.getByLabelText('Filter by course')).toHaveValue(courses[0].databaseId)
 await user.keyboard('{End}')
 expect(screen.getByLabelText('Calendar completion status')).toHaveValue('completed');expect(screen.getByRole('heading',{name:'November 2026'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Today'}));expect(event('Completed exam')).toBeInTheDocument()
 expect(api.load).toHaveBeenCalledTimes(1);expect(api.save).not.toHaveBeenCalled()
})

test('all types, dense entries, status filters and empty months remain reachable',async()=>{
 const rows=Array.from({length:12},(_,index)=>({...item,id:String(index),title:`Deadline ${index}`,type:(['assignment','exam','quiz','project'] as const)[index%4],due_time:index===0?'14:30:00':null,completed_at:index===1?'2026-10-22T12:00:00Z':null}))
 show(fixture(rows));await calendar()
 expect(screen.getAllByRole('button',{name:/^Edit Deadline/})).toHaveLength(12)
 expect(event('Deadline 0')).toHaveAccessibleName(/2:30 PM America\/New_York/)
 expect(event('Deadline 1')).toHaveAccessibleName(/Completed$/)
 expect(screen.queryByText('Private notes')).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Calendar completion status'),{target:{value:'pending'}});expect(screen.getAllByRole('button',{name:/^Edit Deadline/})).toHaveLength(11)
 fireEvent.change(screen.getByLabelText('Calendar completion status'),{target:{value:'completed'}});expect(screen.getAllByRole('button',{name:/^Edit Deadline/})).toHaveLength(1)
 fireEvent.click(screen.getByRole('button',{name:'Next month'}));expect(screen.getByText('No items match this month and filters.')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));expect(screen.getByText('No items due this month.')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Previous month'}));expect(screen.getAllByRole('button',{name:/^Edit Deadline/})).toHaveLength(12)
})

test('calendar editing preserves populated values, moves confirmed date once and restores visible fallback focus',async()=>{
 const api=fixture();show(api);await calendar();const user=userEvent.setup()
 const opener=event();opener.focus();await user.keyboard(' ')
 expect(screen.getByLabelText('Title')).toHaveValue('Homework');expect(screen.getByLabelText('Time (optional)')).toHaveValue('')
 expect(screen.getByLabelText('Notes (optional)')).toHaveValue('Private notes');expect(screen.getByLabelText('Location (optional)')).toHaveValue('Library')
 escape();expect(opener).toHaveFocus()
 await user.click(opener);fireEvent.change(screen.getByLabelText('Due date'),{target:{value:'2026-11-03'}})
 let resolve!:(row:AcademicItem)=>void;vi.mocked(api.save).mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
 fireEvent.click(screen.getByRole('button',{name:'Save item'}));fireEvent.click(screen.getByRole('button',{name:'Saving…'}));expect(api.save).toHaveBeenCalledTimes(1)
 expect(opener).toBeInTheDocument();escape();expect(screen.getByRole('dialog')).toBeInTheDocument()
 await act(async()=>resolve({...item,due_date:'2026-11-03'}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/^Edit Homework,/})).not.toBeInTheDocument()
 expect(screen.getByRole('heading',{name:'October 2026'})).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'October 23, 2026, 0 items'})).toHaveFocus()
 fireEvent.click(screen.getByRole('button',{name:'Next month'}));expect(screen.getAllByRole('button',{name:/^Edit Homework,/})).toHaveLength(1)
 fireEvent.click(screen.getByRole('tab',{name:'Agenda'}));expect(screen.getByText('Nov 3, 2026')).toBeInTheDocument()
 expect(api.save).toHaveBeenCalledWith(expect.objectContaining({due_date:'2026-11-03',due_time:null}),item.id)
})

test('failed calendar edits retain draft and saved item; dirty discard makes no extra mutation',async()=>{
 const api=fixture();vi.mocked(api.save).mockRejectedValueOnce(new Error('Offline; retry'));show(api);await calendar();fireEvent.click(event())
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Unsaved draft'}});fireEvent.click(screen.getByRole('button',{name:'Save item'}))
 await screen.findByRole('alert');expect(screen.getByLabelText('Title')).toHaveValue('Unsaved draft');expect(event()).toBeInTheDocument()
 escape();expect(screen.getByRole('alertdialog')).toHaveTextContent('Discard unsaved changes?');fireEvent.click(screen.getByRole('button',{name:'Keep Editing'}));expect(screen.getByLabelText('Title')).toHaveValue('Unsaved draft')
 escape();fireEvent.click(screen.getByRole('button',{name:'Discard Changes'}));expect(api.save).toHaveBeenCalledTimes(1);expect(event()).toBeInTheDocument()
 fireEvent.click(event());fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Confirmed revision'}});fireEvent.click(screen.getByRole('button',{name:'Save item'}));await screen.findByText('Item saved.');expect(event('Confirmed revision')).toBeInTheDocument()
})

test('add, completion editing, reopening and agenda deletion synchronize with calendar',async()=>{
 const api=fixture([]);show(api);await calendar()
 expect(screen.getByText('Nothing planned yet. Add your first item.')).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Filter by course'),{target:{value:courses[1].databaseId}})
 fireEvent.click(screen.getByRole('button',{name:'Add item'}));expect(within(screen.getByRole('dialog')).getByLabelText('Course')).toHaveValue(courses[1].databaseId)
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'New quiz'}});fireEvent.change(screen.getByLabelText('Due date'),{target:{value:'2026-10-24'}});fireEvent.click(screen.getByRole('button',{name:'Save item'}));await screen.findByText('Item saved.')
 fireEvent.click(event('New quiz'));fireEvent.click(screen.getByRole('checkbox',{name:'Completed'}));fireEvent.click(screen.getByRole('button',{name:'Save item'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(event('New quiz')).toHaveAccessibleName(/Completed$/)
 fireEvent.click(event('New quiz'));fireEvent.click(screen.getByRole('checkbox',{name:'Completed'}));fireEvent.click(screen.getByRole('button',{name:'Save item'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(event('New quiz')).toHaveAccessibleName(/Pending$/)
 fireEvent.click(screen.getByRole('tab',{name:'Agenda'}));fireEvent.click(screen.getByRole('button',{name:'Actions for New quiz'}));fireEvent.click(screen.getByRole('menuitem',{name:'Delete'}));fireEvent.click(screen.getByRole('button',{name:'Delete',exact:true}));await screen.findByText('Item deleted.')
 fireEvent.click(screen.getByRole('tab',{name:'Calendar'}));expect(screen.queryByRole('button',{name:/^Edit New quiz,/})).not.toBeInTheDocument()
})

test('phone date selection has one full event list and calendar today refresh does not reset browsed month',async()=>{
 vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})))
 const {rerender}=render(<AcademicCalendar items={[item,{...item,id:'second',title:'Tomorrow',due_date:'2026-10-24'}]} courses={courses} now={new Date('2026-10-23T16:00Z')} month="2026-10" selectedDay="2026-10-23" onSelect={vi.fn()} onEdit={vi.fn()} busy={false} hasItems hasFilters={false} onClear={vi.fn()}/> )
 expect(screen.getAllByRole('button',{name:/^Edit /})).toHaveLength(1);expect(event()).toBeInTheDocument()
 rerender(<AcademicCalendar items={[item]} courses={courses} now={new Date('2026-11-01T05:00Z')} month="2026-10" selectedDay="2026-10-24" onSelect={vi.fn()} onEdit={vi.fn()} busy={false} hasItems hasFilters={false} onClear={vi.fn()}/> )
 expect(screen.queryByRole('button',{name:/^Edit /})).not.toBeInTheDocument();expect(screen.getByText('No items due on this date.')).toBeInTheDocument();expect(screen.getByRole('heading',{name:'October 2026'})).toBeInTheDocument()
})

test('calendar load failure remains retryable and a successful empty calendar is navigable',async()=>{
 const api=fixture([]);vi.mocked(api.load).mockRejectedValueOnce(new Error('Storage unavailable'));show(api);await screen.findByRole('alert');fireEvent.click(screen.getByRole('tab',{name:'Calendar'}));expect(screen.queryByRole('table')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Retry academic items'}));await screen.findByRole('table');fireEvent.click(screen.getByRole('button',{name:'Next month'}));expect(screen.getByRole('heading',{name:'November 2026'})).toBeInTheDocument()
})

test('calendar edit leaving a type or status filter focuses an active calendar control',async()=>{
 show();await calendar();fireEvent.change(screen.getByLabelText('Filter by type'),{target:{value:'assignment'}});fireEvent.click(event())
 fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Type'),{target:{value:'exam'}});fireEvent.click(screen.getByRole('button',{name:'Save item'}));await screen.findByText('Item saved.')
 expect(screen.getByRole('button',{name:'October 23, 2026, 0 items'})).toHaveFocus();expect(screen.getByLabelText('Filter by type')).toHaveValue('assignment')
 fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));fireEvent.change(screen.getByLabelText('Calendar completion status'),{target:{value:'pending'}});fireEvent.click(event());fireEvent.click(screen.getByRole('checkbox',{name:'Completed'}));fireEvent.click(screen.getByRole('button',{name:'Save item'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(screen.getByRole('button',{name:'October 23, 2026, 0 items'})).toHaveFocus()
})

test('campus midnight updates today without resetting a browsed month',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T03:59:59Z'))
 show();await act(async()=>{});fireEvent.click(screen.getByRole('tab',{name:'Calendar'}))
 expect(screen.getByRole('button',{name:'October 23, 2026, 1 items'})).toHaveAttribute('aria-current','date')
 await act(async()=>{vi.advanceTimersByTime(15000)})
 expect(screen.getByRole('button',{name:'October 24, 2026, 0 items'})).toHaveAttribute('aria-current','date')
 fireEvent.click(screen.getByRole('button',{name:'Previous month'}));expect(screen.getByRole('heading',{name:'September 2026'})).toBeInTheDocument()
 vi.setSystemTime(new Date('2026-11-01T06:00:00Z'));fireEvent.focus(window);await act(async()=>{})
 expect(screen.getByRole('heading',{name:'September 2026'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Today'}));expect(screen.getByRole('heading',{name:'November 2026'})).toBeInTheDocument()
})

test('repeated Escape keeps the native editor open when returning from discard confirmation',async()=>{
 show();await calendar();fireEvent.click(event());fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Keep my draft'}})
 fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(screen.getByRole('alertdialog')).toHaveTextContent('Discard unsaved changes?')
 fireEvent.keyDown(screen.getByRole('alertdialog'),{key:'Escape'});expect(screen.getByRole('dialog')).toHaveAttribute('open');expect(screen.getByLabelText('Title')).toHaveValue('Keep my draft')
})
