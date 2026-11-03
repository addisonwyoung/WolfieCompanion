import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react'
import type { SavedCourse } from './account'
import { compareItems, itemGroup, itemTypes } from './academicItems'
import type { AcademicApi, AcademicInput, AcademicItem } from './academicItems'
import { useAcademicItems } from './useAcademicItems'
import AcademicItemActions from './AcademicItemActions'
import AcademicItemDialog from './AcademicItemDialog'
import AcademicDeleteDialog from './AcademicDeleteDialog'
import AcademicCalendar from './AcademicCalendar'
import { useAcademicReminders } from './reminderContext'
import { campusDate, readableTime } from './academicCalendarDates'

function empty(course: string): AcademicInput {
  return { user_course_id: course, title: '', type: 'assignment', due_date: '', due_time: null, notes: null, location: null, completed_at: null }
}
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
function readableDate(date: string) {
  // UTC is only a display anchor for calendar components, never the deadline.
  return dateFormat.format(new Date(`${date}T12:00:00Z`))
}
type Modal = { kind: 'edit'; item?: AcademicItem; initial: AcademicInput } | { kind: 'delete'; item: AcademicItem }

export default function AcademicPlanner({ api, courses, onAddCourses, active = true, reminderTarget }: {
  reminderTarget?: {id:string;nonce:string}|null; api: AcademicApi; courses: SavedCourse[]; onAddCourses: () => void; active?: boolean
}) {
  const state = useAcademicItems(api)
  const reminders=useAcademicReminders()
  const consumedTarget=useRef('')
  const [targetError,setTargetError]=useState('')
  const [targetRetry,setTargetRetry]=useState(0)
  const [course, setCourse] = useState('')
  const [type, setType] = useState('')
  const tabId = useId()
  const [calendarOpened, setCalendarOpened] = useState(false)
  const [view, setView] = useState<'agenda' | 'calendar'>('agenda')
  const [calendarStatus, setCalendarStatus] = useState('all')
  const [selectedDay, setSelectedDay] = useState(() => campusDate(new Date()))
  const month = selectedDay.slice(0, 7)
  const [completed, setCompleted] = useState(false)
  const [modal, setModal] = useState<Modal | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [focusAttempt, setFocusAttempt] = useState(0)
  const section = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const focusRequest = useRef<{ target?: HTMLElement | null; nextId?: string; completionTrigger?: HTMLInputElement } | null>(null)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; focusRequest.current = null } }, [])
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const timer = window.setInterval(refresh, 15000)
    const immediate = window.setTimeout(refresh, 0)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); clearTimeout(immediate); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [active])
  useLayoutEffect(() => {
    if (modal || state.busy || !focusRequest.current) return
    const request = focusRequest.current
    focusRequest.current = null
    // Decide after React has committed the updated rows, not when the request resolves.
    if (request.completionTrigger && (request.completionTrigger.isConnected || !active)) return
    const available = (element: HTMLElement | null | undefined): element is HTMLElement => {
      if (!element?.isConnected || element.closest('[hidden]') || element.matches(':disabled')) return false
      for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden') return false
      }
      return true
    }
    const target = request.target
    if (available(target)) { target.focus(); return }
    if (view === 'calendar') {
      const date = Array.from(section.current?.querySelectorAll<HTMLElement>('[data-calendar-day]') ?? []).find(node => node.dataset.calendarDay === selectedDay && available(node))
      const title = section.current?.querySelector<HTMLElement>('[data-calendar-heading]')
      const fallback = [date, title, heading.current].find(available)
      fallback?.focus()
      return
    }
    const checkboxes = Array.from(section.current?.querySelectorAll<HTMLInputElement>('[data-row-completion]') ?? []).filter(available)
    const next = checkboxes.find(input => input.dataset.rowCompletion === request.nextId)
    const group = Array.from(section.current?.querySelectorAll<HTMLElement>('.academic-group') ?? []).find(available)
    const status = section.current?.querySelector<HTMLElement>('.academic-status-filter [aria-pressed="true"]')
    const fallback = [next, request.completionTrigger ? checkboxes[0] : null, group,
      ...(request.completionTrigger ? [status, heading.current] : []), addButton.current, heading.current].find(available)
    fallback?.focus()
  }, [modal, state.busy, state.items, focusAttempt, active, view, selectedDay])

  const matching = state.items.filter(item => (!course || item.user_course_id === course) && (!type || item.type === type))
  const calendarItems = matching.filter(item => calendarStatus === 'all' || !!item.completed_at === (calendarStatus === 'completed'))
  const filtered = matching.filter(item => !!item.completed_at === completed).sort(compareItems)
  const groups = completed ? ['Completed'] as const : ['Overdue', 'Today', 'Upcoming'] as const
  function changeView(next: 'agenda' | 'calendar') {
    if (next === 'calendar' && !calendarOpened) { setSelectedDay(campusDate(new Date())); setCalendarOpened(true) }
    setMenuId(null); setView(next)
  }
  function nextId(item: AcademicItem) {
    const index = filtered.findIndex(row => row.id === item.id)
    return (filtered[index + 1] ?? filtered[index - 1])?.id
  }
  function openEdit(item?: AcademicItem, trigger: HTMLElement | null = addButton.current) {
    if (state.busy || modal) return
    opener.current = trigger; setMenuId(null)
    setModal({ kind: 'edit', item, initial: item ? { ...item } : empty(course || courses[0]?.databaseId || '') })
  }
  function close() { focusRequest.current = { target: opener.current }; setModal(null) }
  useEffect(()=>{
    if(!reminderTarget||!active||modal||state.busy||consumedTarget.current===reminderTarget.nonce)return
    let current=true
    void api.load().then(items=>{if(!current)return;const item=items.find(row=>row.id===reminderTarget.id);consumedTarget.current=reminderTarget.nonce;if(!item){setTargetError('This academic item is no longer available.');return}setTargetError('');opener.current=heading.current;setMenuId(null);setModal({kind:'edit',item,initial:{...item}})},()=>{if(current)setTargetError('Unable to open this reminder item. Please retry.')})
    return()=>{current=false}
  },[reminderTarget,active,modal,state.busy,api,targetRetry])
  async function complete(item: AcademicItem, trigger: HTMLInputElement) {
    const next = nextId(item)
    const success = await state.mutate(() => api.complete(item.id, !item.completed_at), item.completed_at ? 'Item reopened.' : 'Item completed.')
    if(success)void reminders?.refresh()
    if (success && mounted.current) { focusRequest.current = { nextId: next, completionTrigger: trigger }; setFocusAttempt(value => value + 1) }
  }
  return <section ref={section} className="academic-items" aria-labelledby="academic-heading">
    <>{targetError&&<p role="alert">{targetError}<button onClick={()=>setTargetRetry(n=>n+1)}>Retry item</button></p>}</><div className="academic-intro"><div><p className="eyebrow">YOUR COURSEWORK, IN ONE PLACE</p><h1 id="academic-heading" tabIndex={-1} ref={heading}>Assignments &amp; Exams</h1><p className="muted">A little clarity for what’s coming up.</p></div>
      {!!courses.length && <button ref={addButton} className="primary" disabled={state.busy || state.status !== 'success'} onClick={() => openEdit()}><span aria-hidden="true">+ </span>Add item</button>}
    </div>
    <div className="academic-view-tabs" role="tablist" aria-label="Academic item view">{(['agenda', 'calendar'] as const).map((tab, index) => <button key={tab} role="tab" id={`${tabId}-${tab}-tab`} aria-controls={`${tabId}-${tab}-panel`} aria-selected={view === tab} tabIndex={view === tab ? 0 : -1} onClick={() => changeView(tab)} onKeyDown={event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? 1 - index : null
      if (next === null) return
      event.preventDefault(); changeView(next ? 'calendar' : 'agenda')
      const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      buttons?.[next].focus()
    }}>{tab === 'agenda' ? 'Agenda' : 'Calendar'}</button>)}</div>
    {!courses.length ? <div className="panel empty-state"><p>Add a saved course before planning academic items.</p><button onClick={onAddCourses}>Add courses</button></div> : <div className="academic-filters">
      <label>Course<select aria-label="Filter by course" value={course} onChange={event => setCourse(event.target.value)}><option value="">All saved courses</option>{courses.map(saved => <option key={saved.databaseId} value={saved.databaseId}>{saved.code}</option>)}</select></label>
      <label>Type<select aria-label="Filter by type" value={type} onChange={event => setType(event.target.value)}><option value="">All types</option>{itemTypes.map(itemType => <option key={itemType} value={itemType}>{itemType[0].toUpperCase() + itemType.slice(1)}</option>)}</select></label>
      {view === 'calendar' ? <label>Status<select aria-label="Calendar completion status" value={calendarStatus} onChange={event => setCalendarStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option></select></label> : <div className="academic-status-filter" aria-label="Completion status"><button aria-pressed={!completed} onClick={() => setCompleted(false)}>Pending</button><button aria-pressed={completed} onClick={() => setCompleted(true)}>Completed</button></div>}
    </div>}
    {!modal && state.message && <p role={state.status === 'error' || state.actionFailed ? 'alert' : 'status'} className="academic-feedback">{state.message}</p>}
    {!modal && state.busy && <p role="status">Saving changes…</p>}
    {state.status === 'loading' && <p role="status">Loading academic items…</p>}
    {state.status === 'error' && <button onClick={state.retry}>Retry academic items</button>}
    <div role="tabpanel" id={`${tabId}-agenda-panel`} aria-labelledby={`${tabId}-agenda-tab`} hidden={view !== 'agenda'}>
    {state.status === 'success' && !!courses.length && view === 'agenda' && <>
      {!filtered.length && <div className="panel empty-state"><p>{state.items.length ? 'No items match this view.' : 'Nothing planned yet. Add your first item.'}</p>{(course || type) && <button onClick={() => { setCourse(''); setType('') }}>Clear filters</button>}</div>}
      {groups.map(group => {
        const items = filtered.filter(item => itemGroup(item, now) === group)
        return !!items.length && <section key={group} aria-label={group} className={`academic-section academic-${group.toLowerCase()}`}><div className="academic-group-heading"><h2 className="academic-group" tabIndex={-1}>{group}</h2><span className="academic-group-count">{items.length}</span></div>
          <ul className="academic-list">{items.map(item => <li className="academic-row" key={item.id}>
            <label className="academic-completion"><input type="checkbox" data-row-completion={item.id} aria-label={`${item.completed_at ? 'Reopen' : 'Mark complete'} ${item.title}`} checked={!!item.completed_at} disabled={state.busy} onChange={event => void complete(item, event.currentTarget)} /></label>
            <div className="academic-row-content"><h3>{item.title}</h3><div className="academic-row-meta"><span>{courses.find(saved => saved.databaseId === item.user_course_id)?.code ?? 'Saved course'}</span><span className={`academic-type academic-type-${item.type}`}>{item.type}</span>{item.location && <span className="academic-location">{item.location}</span>}</div></div>
            <div className="academic-deadline"><time dateTime={item.due_date}>{readableDate(item.due_date)}</time>{item.due_time && <span>{readableTime(item.due_time)} <span className="academic-zone">America/New_York</span></span>}</div>
            <AcademicItemActions title={item.title} open={menuId === item.id} disabled={state.busy} onOpenChange={open => setMenuId(open ? item.id : null)} onEdit={trigger => openEdit(item, trigger)} onDelete={trigger => { if (!modal && !state.busy) { opener.current = trigger; setModal({ kind: 'delete', item }) } }} />
          </li>)}</ul>
        </section>
      })}
    </>}
    </div>
    <div role="tabpanel" id={`${tabId}-calendar-panel`} aria-labelledby={`${tabId}-calendar-tab`} hidden={view !== 'calendar'}>
      {state.status === 'success' && !!courses.length && view === 'calendar' && <AcademicCalendar items={calendarItems} courses={courses} now={now} month={month} selectedDay={selectedDay} onSelect={setSelectedDay} onEdit={openEdit} busy={state.busy} hasItems={!!state.items.length} hasFilters={!!(course || type || calendarStatus !== 'all')} onClear={() => { setCourse(''); setType(''); setCalendarStatus('all') }} />}
    </div>
    <p className="academic-time-note">Deadlines use America/New_York. Dates without a time stay due for the full calendar day.</p>
    {modal?.kind === 'edit' && <AcademicItemDialog initial={modal.initial} editing={!!modal.item} courses={courses} busy={state.busy} saveError={state.actionFailed ? state.message : null} onClose={close} onSave={async value => {
      const success = await state.mutate(() => api.save(value, modal.item?.id), 'Item saved.')
      if(success)void reminders?.refresh()
      if (success && mounted.current) close()
      return success
    }} />}
    {modal?.kind === 'delete' && <AcademicDeleteDialog title={modal.item.title} course={courses.find(saved => saved.databaseId === modal.item.user_course_id)?.code ?? 'Saved course'} busy={state.busy} error={state.actionFailed ? state.message : null} onCancel={close} onDelete={async () => {
      const next = nextId(modal.item)
      const success = await state.mutate(() => api.remove(modal.item.id), 'Item deleted.', modal.item.id)
      if(success)void reminders?.refresh()
      if (success && mounted.current) { focusRequest.current = { nextId: next }; setModal(null) }
      return success
    }} />}
  </section>
}
