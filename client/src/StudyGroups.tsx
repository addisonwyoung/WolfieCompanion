import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { SavedCourse } from './account'
import type { ClassmateApi, Classmate } from './classmates'
import { useClassmates } from './useClassmates'
import { findSharedWindows, formatTime, timeToMinutes, weekdays } from './studyGroupScheduling'
import type { Weekday, WeeklyAvailability } from './studyGroupScheduling'
import './StudyGroups.css'

interface AvailabilityEntry extends WeeklyAvailability { id: string }
interface Participant { id: string; name: string; isCurrentUser: boolean }

function AvailabilityEditor({ participant, entries, idPrefix, onAdd, onRemove }: {
  participant: Participant
  entries: AvailabilityEntry[]
  idPrefix: string
  onAdd: (entry: AvailabilityEntry) => void
  onRemove: (id: string) => void
}) {
  const [day, setDay] = useState<Weekday>('Monday')
  const [start, setStart] = useState('10:00')
  const [end, setEnd] = useState('12:00')
  const [error, setError] = useState('')
  const nextId = useRef(0)
  const dayId = `${idPrefix}-day`
  const startId = `${idPrefix}-start`
  const endId = `${idPrefix}-end`
  const orderedEntries = [...entries].sort((left, right) => weekdays.indexOf(left.day) - weekdays.indexOf(right.day) || left.start - right.start)

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const startMinutes = timeToMinutes(start)
    const endMinutes = timeToMinutes(end)
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      setError('Choose an end time later than the start time.')
      return
    }
    setError('')
    onAdd({ id: `${participant.id}-${nextId.current++}`, day, start: startMinutes, end: endMinutes })
  }

  return <section className="study-member-availability" aria-labelledby={`${idPrefix}-heading`}>
    <div className="study-member-heading">
      <div><h3 id={`${idPrefix}-heading`}>{participant.isCurrentUser ? 'You' : participant.name}</h3><p className="muted">{participant.isCurrentUser ? 'Your availability' : 'Times this classmate has shared with you'}</p></div>
      <span className={`study-availability-status${entries.length ? ' is-ready' : ''}`}>{entries.length ? `${entries.length} ${entries.length === 1 ? 'time' : 'times'} added` : 'Needs availability'}</span>
    </div>
    {orderedEntries.length > 0 && <ul className="study-time-list">{orderedEntries.map(entry => <li key={entry.id}><span><strong>{entry.day}</strong><span>{formatTime(entry.start)}–{formatTime(entry.end)}</span></span><button type="button" className="study-remove-time" aria-label={`Remove ${entry.day} ${formatTime(entry.start)} to ${formatTime(entry.end)} for ${participant.name}`} onClick={() => onRemove(entry.id)}>Remove</button></li>)}</ul>}
    <form className="study-availability-form" onSubmit={add}>
      <div className="study-time-inputs">
        <label htmlFor={dayId}>Day<select id={dayId} value={day} onChange={event => setDay(event.target.value as Weekday)}>{weekdays.map(value => <option key={value}>{value}</option>)}</select></label>
        <label htmlFor={startId}>From<input id={startId} type="time" step={900} value={start} onChange={event => setStart(event.target.value)} required /></label>
        <label htmlFor={endId}>Until<input id={endId} type="time" step={900} value={end} onChange={event => setEnd(event.target.value)} required /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="study-add-time">Add time</button>
    </form>
  </section>
}

export default function StudyGroups({ active, userId, userName, courses, classmatesApi, onGoToCourses }: {
  active: boolean
  userId: string
  userName: string
  courses: SavedCourse[]
  classmatesApi: ClassmateApi
  onGoToCourses: () => void
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const course = courses.find(value => value.id === courseId) ?? courses[0]
  const roster = useClassmates(classmatesApi, active && course ? userId : null, active ? course?.code ?? null : null)
  const [selectedPeers, setSelectedPeers] = useState<Classmate[]>([])
  const [availability, setAvailability] = useState<Record<string, AvailabilityEntry[]>>({})
  const [groupName, setGroupName] = useState('')
  const [duration, setDuration] = useState(60)
  const [planStarted, setPlanStarted] = useState(false)
  const idPrefix = useId()

  const participants: Participant[] = [
    { id: `current:${userId}`, name: userName, isCurrentUser: true },
    ...selectedPeers.map(peer => ({ id: `peer:${peer.student_id}`, name: peer.name, isCurrentUser: false })),
  ]
  const membersReady = participants.every(member => (availability[member.id]?.length ?? 0) > 0)
  const commonWindows = membersReady
    ? findSharedWindows(participants.map(member => availability[member.id] ?? []), duration)
    : []

  function chooseCourse(nextCourseId: string) {
    setCourseId(nextCourseId)
    setSelectedPeers([])
    setAvailability({})
    setPlanStarted(false)
  }

  function togglePeer(peer: Classmate) {
    const key = `peer:${peer.student_id}`
    const isSelected = selectedPeers.some(selected => selected.student_id === peer.student_id)
    setSelectedPeers(previous => isSelected ? previous.filter(selected => selected.student_id !== peer.student_id) : [...previous, peer])
    if (isSelected) {
      if (selectedPeers.length === 1) setPlanStarted(false)
      setAvailability(previous => {
        const next = { ...previous }
        delete next[key]
        return next
      })
    }
  }

  function addAvailability(memberId: string, entry: AvailabilityEntry) {
    setAvailability(previous => ({ ...previous, [memberId]: [...(previous[memberId] ?? []), entry] }))
  }

  function removeAvailability(memberId: string, entryId: string) {
    setAvailability(previous => ({ ...previous, [memberId]: (previous[memberId] ?? []).filter(entry => entry.id !== entryId) }))
  }

  function startPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPeers.length || !groupName.trim()) return
    setPlanStarted(true)
  }

  const dayInputId = idPrefix
  const results = commonWindows.slice(0, 12)

  return <section className="study-groups-view" aria-labelledby="study-groups-title">
    <header className="study-groups-intro">
      <div><p className="eyebrow">MAKE TIME TO STUDY</p><h1 id="study-groups-title">Study groups</h1><p>Find classmates in a shared course, gather everyone's free times, and spot a window that works for the whole group.</p></div>
      <aside className="study-draft-note"><span aria-hidden="true">i</span><p><strong>Planning preview</strong><br />This page keeps a draft in this visit only. It does not create a saved group, send invitations, or write to Supabase.</p></aside>
    </header>

    <div className="study-groups-grid">
      <section className="panel study-setup" aria-labelledby="study-setup-heading">
        <div className="study-section-heading"><span className="study-step">01</span><div><p className="eyebrow">START WITH A CLASS</p><h2 id="study-setup-heading">Build your group</h2></div></div>
        {!courses.length ? <div className="study-empty panel"><h3>Add a course first</h3><p className="muted">Study groups start from a course you have saved. Add your classes to find matching classmates.</p><button type="button" className="primary" onClick={onGoToCourses}>Go to My dashboard</button></div> : <>
          <label htmlFor={`${dayInputId}-course`}>Shared course</label>
          <select id={`${dayInputId}-course`} value={course?.id ?? ''} onChange={event => chooseCourse(event.target.value)}>{courses.map(saved => <option value={saved.id} key={saved.id}>{saved.code}{saved.sections?.length ? ` · Section ${saved.sections.join(', ')}` : ''}</option>)}</select>
          <p className="field-help">Classmates are found from students who saved this course.</p>

          <div className="study-roster-heading"><h3>Choose classmates</h3><span>{selectedPeers.length} selected</span></div>
          {roster.status === 'loading' && <p className="study-roster-status" role="status">Finding classmates in {course?.code}…</p>}
          {roster.status === 'error' && <div className="study-empty"><p role="alert">{roster.message}</p><button type="button" onClick={roster.retry}>Retry</button></div>}
          {roster.status === 'success' && !roster.classmates.length && <div className="study-empty"><h3>No classmates in {course?.code} yet</h3><p className="muted">Only students who saved this course can be added to this planning draft.</p></div>}
          {roster.status === 'success' && roster.classmates.length > 0 && <ul className="study-peer-list">{roster.classmates.map(peer => {
            const checked = selectedPeers.some(selected => selected.student_id === peer.student_id)
            const checkboxId = `${dayInputId}-peer-${peer.student_id}`
            return <li key={peer.student_id}><label htmlFor={checkboxId} className="study-peer-choice"><input id={checkboxId} type="checkbox" checked={checked} onChange={() => togglePeer(peer)} /><span><strong>{peer.name}</strong><small>{peer.major ?? 'Major not added'}</small></span><span className="study-peer-state">{checked ? 'Added' : 'Add'}</span></label></li>
          })}</ul>}
          <p className="study-privacy-note">Name and major are visible to eligible students sharing a course. Courses are self-reported; matches do not verify term or official enrollment.</p>

          <form className="study-group-form" onSubmit={startPlan}>
            <label htmlFor={`${dayInputId}-group-name`}>Group name<input id={`${dayInputId}-group-name`} value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={80} pattern=".*\S.*" title="Enter at least one non-space character." placeholder={`${course?.code ?? 'Course'} study group`} required /></label>
            <button type="submit" className="primary" disabled={!selectedPeers.length || !groupName.trim()}>{planStarted ? 'Update group plan' : 'Start group plan'}</button>
          </form>
        </>}
      </section>

      <section className="panel study-schedule" aria-labelledby="study-schedule-heading">
        <div className="study-section-heading"><span className="study-step">02</span><div><p className="eyebrow">FIND A TIME THAT FITS</p><h2 id="study-schedule-heading">Compare availability</h2></div></div>
        {!planStarted ? <div className="study-schedule-placeholder"><span className="study-calendar-icon" aria-hidden="true">▦</span><h3>Your group plan starts here</h3><p>Choose a course, add at least one classmate, and start a plan to compare weekly free times.</p></div> : <>
          <div className="study-plan-summary"><div><span className="study-summary-label">GROUP PLAN</span><h3>{groupName.trim()}</h3><p>{course?.code} · {participants.length} members</p></div><label htmlFor={`${dayInputId}-duration`}>Meeting length<select id={`${dayInputId}-duration`} value={duration} onChange={event => setDuration(Number(event.target.value))}><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>1 hour</option><option value={90}>1 hour 30 minutes</option><option value={120}>2 hours</option></select></label></div>
          <p className="study-schedule-guidance">Add recurring free windows each member has agreed to share. Course codes and sections do not include class meeting times, so the app cannot infer availability from them.</p>
          <div className="study-members">{participants.map((participant, index) => <AvailabilityEditor key={participant.id} participant={participant} entries={availability[participant.id] ?? []} idPrefix={`${dayInputId}-member-${index}`} onAdd={entry => addAvailability(participant.id, entry)} onRemove={entryId => removeAvailability(participant.id, entryId)} />)}</div>
          <section className="study-overlap" aria-labelledby={`${dayInputId}-overlap-heading`} aria-live="polite">
            <div className="study-overlap-heading"><div><p className="eyebrow">SHARED WINDOWS</p><h3 id={`${dayInputId}-overlap-heading`}>Times that work for everyone</h3></div><span>{duration} min</span></div>
            {!membersReady ? <p className="study-overlap-message">Add at least one confirmed free time for every member to compare the group.</p>
              : commonWindows.length ? <><ul className="study-overlap-list">{results.map(window => <li key={`${window.day}-${window.start}-${window.end}`}><span className="study-overlap-day">{window.day}</span><strong>{formatTime(window.start)} – {formatTime(window.end)}</strong><span className="study-overlap-length">{Math.floor((window.end - window.start) / 60)} hr {(window.end - window.start) % 60 ? `${(window.end - window.start) % 60} min` : ''} open</span></li>)}</ul>{commonWindows.length > results.length && <p className="field-help">Showing the first {results.length} shared windows.</p>}</>
                : <p className="study-overlap-message">No shared windows are long enough. Try a shorter meeting or add more availability.</p>}
          </section>
        </>}
      </section>
    </div>
  </section>
}
