import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { SavedCourse } from './account'
import type { ClassmateApi, Classmate } from './classmates'
import { useClassmates } from './useClassmates'
import { findSharedWindows, formatTime, timeToMinutes } from './studyGroupScheduling'
import type { WeeklyAvailability } from './studyGroupScheduling'
import { studyDays } from './studyGroupApi'
import type { StudyDay, StudyGroup, StudyGroupApi, StudyWindow } from './studyGroupApi'
import './StudyGroups.css'

function uniqueWindows(windows: WeeklyAvailability[]): WeeklyAvailability[] {
  const seen = new Set<string>()
  return windows.filter(window => {
    const key = `${window.day}:${window.start}:${window.end}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function fromGroup(group: StudyGroup | null, userId: string): WeeklyAvailability[] {
  return uniqueWindows(group?.availability.filter(window => window.user_id === userId).map(({ day, start_minute, end_minute }) => ({ day, start: start_minute, end: end_minute })) ?? [])
}

function toStudyWindows(windows: WeeklyAvailability[]): StudyWindow[] {
  return windows.map(({ day, start, end }) => ({ day, start_minute: start, end_minute: end }))
}

function windowsFor(group: StudyGroup, userId: string): WeeklyAvailability[] {
  return uniqueWindows(group.availability.filter(window => window.user_id === userId).map(({ day, start_minute, end_minute }) => ({ day, start: start_minute, end: end_minute })))
}

export default function StudyGroups({ userId, courses, classmatesApi, api, onGoToCourses }: {
  userId: string; courses: SavedCourse[]; classmatesApi: ClassmateApi
  api: StudyGroupApi; onGoToCourses: () => void
}) {
  const [groups, setGroups] = useState<StudyGroup[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadVersion, setLoadVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const course = courses.find(value => value.id === courseId) ?? courses[0]
  const roster = useClassmates(classmatesApi, course ? userId : null, course?.code ?? null)
  const [selectedPeers, setSelectedPeers] = useState<Classmate[]>([])
  const [groupName, setGroupName] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [durationInput, setDurationInput] = useState('60')
  const duration = Number(durationInput)
  const validDuration = /^\d+$/.test(durationInput) && duration >= 1 && duration <= 1440
  const [draft, setDraft] = useState<WeeklyAvailability[]>([])
  const [startTimeInput, setStartTimeInput] = useState('10:00 AM')
  const [endTimeInput, setEndTimeInput] = useState('12:00 PM')
  const [timeInputErrors, setTimeInputErrors] = useState<{ start?: string; end?: string }>({})
  const selectedGroup = groups.find(group => group.group_id === selectedGroupId) ?? null

  useEffect(() => {
    let alive = true
    setLoadState('loading')
    void api.list().then(result => {
      if (alive) { setGroups(result); setLoadState('ready'); setError('') }
    }, reason => {
      if (alive) { setLoadState('error'); setError(reason instanceof Error ? reason.message : 'Study groups could not be loaded. Please retry.') }
    })
    return () => { alive = false }
  }, [api, loadVersion])

  useEffect(() => { setDraft(fromGroup(selectedGroup, userId)) }, [selectedGroupId, userId])

  const members = selectedGroup?.members.filter(member => member.status === 'accepted') ?? []
  const allHaveTimes = members.length > 0 && members.every(member => windowsFor(selectedGroup!, member.user_id).length > 0)
  const shared = useMemo(() => allHaveTimes && selectedGroup && validDuration
    ? findSharedWindows(members.map(member => member.user_id === userId ? draft : windowsFor(selectedGroup, member.user_id)), duration)
    : [], [allHaveTimes, selectedGroup, members, userId, draft, duration, validDuration])

  function changeCourse(value: string) {
    setCourseId(value); setSelectedPeers([]); setGroupName('')
  }
  function togglePeer(peer: Classmate) {
    setSelectedPeers(current => current.some(value => value.student_id === peer.student_id)
      ? current.filter(value => value.student_id !== peer.student_id)
      : current.length < 7 ? [...current, peer] : current)
  }
  function addWindow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.length >= 56) { setError('A member can save up to 56 weekly windows.'); return }
    const form = new FormData(event.currentTarget)
    const start = timeToMinutes(startTimeInput)
    const end = timeToMinutes(endTimeInput)
    const day = String(form.get('day') ?? '') as StudyDay
    if (!studyDays.includes(day)) {
      setError('Choose a valid day.')
      return
    }
    const inputErrors: { start?: string; end?: string } = {}
    if (start === null || start >= 1440) inputErrors.start = 'Enter a start time from 00:00 through 23:59, such as 10:35 AM or 0:00.'
    if (end === null || end < 1 || end > 1440) inputErrors.end = 'Enter an end time from 00:01 through 24:00, such as 12:00 PM or 24:00.'
    else if (start !== null && end <= start) inputErrors.end = 'End time must be later than start time. Overnight windows are not supported.'
    if (inputErrors.start || inputErrors.end || start === null || end === null || start >= 1440 || end < 1 || end > 1440 || end <= start) {
      setTimeInputErrors(inputErrors)
      return
    }
    if (draft.some(window => window.day === day && window.start === start && window.end === end)) {
      setError('That exact availability window is already listed.')
      return
    }
    setError(''); setTimeInputErrors({})
    setDraft(current => [...current, { day, start, end }].sort((a, b) => studyDays.indexOf(a.day as StudyDay) - studyDays.indexOf(b.day as StudyDay) || a.start - b.start))
    event.currentTarget.reset()
    setStartTimeInput('10:00 AM'); setEndTimeInput('12:00 PM')
  }
  async function perform(action: () => Promise<unknown>, done?: (result: unknown) => void) {
    if (busy) return
    setBusy(true); setError('')
    try { const result = await action(); done?.(result); setLoadVersion(value => value + 1) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'That change could not be saved. Please retry.') }
    finally { setBusy(false) }
  }
  function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!course || !selectedPeers.length || !groupName.trim()) return
    void perform(() => api.create({ courseCode: course.code, name: groupName, invitees: selectedPeers.map(peer => peer.student_id) }), result => {
      if (typeof result === 'string') setSelectedGroupId(result)
      setGroupName(''); setSelectedPeers([])
    })
  }

  const pendingInvites = groups.filter(group => group.my_status === 'pending')
  const activeGroups = groups.filter(group => group.my_status === 'accepted')
  const meetingWindows = shared.slice(0, 12)

  return <section className="study-groups-view" aria-labelledby="study-groups-title">
    <header className="study-groups-intro">
      <div><p className="eyebrow">MAKE TIME TO STUDY</p><h1 id="study-groups-title">Study buddy groups</h1><p>Find classmates in a course, invite them to a group, and compare the weekly times everyone is free.</p></div>
      <aside className="study-draft-note"><span aria-hidden="true">i</span><p><strong>Shared with your group</strong><br />Invited classmates must accept. Availability is visible only to accepted members of that group.</p></aside>
    </header>

    {error && <div className="study-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Dismiss</button></div>}
    {loadState === 'loading' && <p role="status">Loading your study groups…</p>}
    {loadState === 'error' && <div className="study-empty"><p>Groups could not be refreshed.</p><button type="button" onClick={() => setLoadVersion(value => value + 1)}>Retry</button></div>}

    {!!pendingInvites.length && <section className="study-invitations panel" aria-labelledby="study-invitations-title">
      <p className="eyebrow">YOU HAVE AN INVITATION</p><h2 id="study-invitations-title">Group invitations</h2>
      {pendingInvites.map(group => <article className="study-invitation" key={group.group_id}><div><h3>{group.name}</h3><p>{group.course_code} · invited by {group.members.find(member => member.role === 'owner')?.name ?? 'a classmate'}</p></div><div className="study-actions"><button type="button" disabled={busy} onClick={() => void perform(() => api.respond(group.group_id, true))}>Accept</button><button type="button" disabled={busy} onClick={() => void perform(() => api.respond(group.group_id, false))}>Decline</button></div></article>)}
    </section>}

    <div className="study-groups-grid">
      <section className="panel study-setup" aria-labelledby="study-setup-heading">
        <div className="study-section-heading"><span className="study-step">01</span><div><p className="eyebrow">START WITH A CLASS</p><h2 id="study-setup-heading">Create a group</h2></div></div>
        {!courses.length ? <div className="study-empty"><h3>Add a course first</h3><p>Study groups start from a course you have saved.</p><button type="button" className="primary" onClick={onGoToCourses}>Go to My dashboard</button></div> : <>
          <label htmlFor="study-course">Shared course</label><select id="study-course" value={course?.id ?? ''} onChange={event => changeCourse(event.target.value)}>{courses.map(saved => <option value={saved.id} key={saved.id}>{saved.code}{saved.sections?.length ? ` · Section ${saved.sections.join(', ')}` : ''}</option>)}</select>
          <p className="field-help">Students who saved this course can be invited. They will choose whether to join.</p>
          <div className="study-roster-heading"><h3>Invite classmates</h3><span>{selectedPeers.length}/7 selected</span></div>
          {roster.status === 'loading' && <p role="status">Finding classmates in {course?.code}…</p>}
          {roster.status === 'error' && <div className="study-empty"><p role="alert">{roster.message}</p><button type="button" onClick={roster.retry}>Retry</button></div>}
          {roster.status === 'success' && !roster.classmates.length && <div className="study-empty"><h3>No classmates in {course?.code} yet</h3><p>Other students need to save this course before they appear here.</p></div>}
          {roster.status === 'success' && !!roster.classmates.length && <ul className="study-peer-list">{roster.classmates.map(peer => {
            const checked = selectedPeers.some(item => item.student_id === peer.student_id)
            return <li key={peer.student_id}><label className="study-peer-choice"><input type="checkbox" checked={checked} disabled={!checked && selectedPeers.length >= 7} onChange={() => togglePeer(peer)} /><span><strong>{peer.name}</strong><small>{peer.major ?? 'Major not added'}</small></span><span>{checked ? 'Selected' : 'Invite'}</span></label></li>
          })}</ul>}
          <form className="study-group-form" onSubmit={createGroup}><label htmlFor="study-group-name">Group name<input id="study-group-name" value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={80} placeholder={`${course?.code ?? 'Course'} study group`} required /></label><button className="primary" type="submit" disabled={busy || !selectedPeers.length || !groupName.trim()}>{busy ? 'Creating…' : 'Create group and invite'}</button></form>
        </>}
      </section>

      <section className="panel study-groups-list" aria-labelledby="study-groups-list-title">
        <div className="study-section-heading"><span className="study-step">02</span><div><p className="eyebrow">YOUR STUDY TEAMS</p><h2 id="study-groups-list-title">Your groups</h2></div></div>
        {!activeGroups.length ? <div className="study-empty"><h3>No joined groups yet</h3><p>Create a group or accept an invitation to start comparing times.</p></div> : <ul className="study-saved-groups">{activeGroups.map(group => <li key={group.group_id}><button type="button" className="study-group-card" aria-pressed={selectedGroupId === group.group_id} onClick={() => { setSelectedGroupId(group.group_id); setDraft(fromGroup(group, userId)) }}><span className="eyebrow">{group.course_code}</span><strong>{group.name}</strong><span>{group.members.filter(member => member.status === 'accepted').length} members · {group.members.filter(member => member.status === 'pending').length} pending</span></button></li>)}</ul>}
      </section>
    </div>

    {selectedGroup?.my_status === 'accepted' && <section className="panel study-detail" aria-labelledby="study-detail-heading">
      <header className="study-detail-header"><div><p className="eyebrow">{selectedGroup.course_code} · GROUP SCHEDULE</p><h2 id="study-detail-heading">{selectedGroup.name}</h2><p>{members.length} accepted member{members.length === 1 ? '' : 's'}{selectedGroup.members.some(member => member.status === 'pending') ? ` · ${selectedGroup.members.filter(member => member.status === 'pending').length} invitation pending` : ''}</p></div><button type="button" disabled={busy} onClick={() => { if (selectedGroup.owner_id === userId && members.length === 1 && !window.confirm('You are the only accepted member. Leaving will permanently delete this group. Continue?')) return; void perform(() => api.leave(selectedGroup.group_id), () => setSelectedGroupId(null)) }}>Leave group</button></header>
      <p className="study-schedule-guidance">Add recurring free windows you are comfortable sharing. Course codes and sections do not include meeting times, so the app cannot infer schedules from them.</p>
      <div className="study-members">
        {members.map(member => {
          const own = member.user_id === userId
          const times = own ? draft : windowsFor(selectedGroup, member.user_id)
          return <section className="study-member-availability" key={member.user_id}><div className="study-member-heading"><div><h3>{own ? 'Your availability' : member.name}</h3><p className="muted">{own ? 'Only accepted members of this group can see these windows.' : 'Shared with this group'}</p></div><span className={`study-availability-status${times.length ? ' is-ready' : ''}`}>{times.length ? `${times.length} window${times.length === 1 ? '' : 's'}` : 'Add availability'}</span></div>
            {times.length > 0 && <ul className="study-time-list">{times.map((window, index) => <li key={`${window.day}-${window.start}-${window.end}-${index}`}><span><strong>{window.day}</strong><span>{formatTime(window.start)} – {formatTime(window.end)}</span></span>{own && <button type="button" disabled={busy} onClick={() => setDraft(current => current.filter((_, currentIndex) => currentIndex !== index))}>Remove</button>}</li>)}</ul>}
            {own && <><form className="study-availability-form" onSubmit={addWindow}><div className="study-time-inputs"><label>Day<select name="day" defaultValue="Monday">{studyDays.map(day => <option key={day}>{day}</option>)}</select></label><label>From<input name="start" type="text" inputMode="text" placeholder="10:35 AM" value={startTimeInput} aria-invalid={Boolean(timeInputErrors.start)} aria-describedby={timeInputErrors.start ? 'study-start-time-error' : undefined} onChange={event => { setStartTimeInput(event.target.value); setTimeInputErrors({}) }} required />{timeInputErrors.start && <span className="study-input-error" id="study-start-time-error" role="alert">{timeInputErrors.start}</span>}</label><label>Until<input name="end" type="text" inputMode="text" placeholder="12:00 PM" value={endTimeInput} aria-invalid={Boolean(timeInputErrors.end)} aria-describedby={timeInputErrors.end ? 'study-end-time-error' : undefined} onChange={event => { setEndTimeInput(event.target.value); setTimeInputErrors({}) }} required />{timeInputErrors.end && <span className="study-input-error" id="study-end-time-error" role="alert">{timeInputErrors.end}</span>}</label></div><p className="field-help">Type a time such as 10:35 AM or 14:35. Starts can be 00:00–23:59; ends can be 00:01–24:00.</p><button type="submit">Add time</button></form><button className="primary study-save-times" type="button" disabled={busy} onClick={() => void perform(() => api.saveAvailability(selectedGroup.group_id, toStudyWindows(draft)))}>{busy ? 'Saving…' : 'Save my availability'}</button></>}
          </section>
        })}
      </div>
      <section className="study-overlap" aria-labelledby="study-overlap-heading"><div className="study-overlap-heading"><div><p className="eyebrow">SHARED WINDOWS</p><h3 id="study-overlap-heading">Times that work for everyone</h3></div><label>Meeting length (minutes)<input aria-describedby="meeting-length-help" type="number" min={1} max={1440} step={1} value={durationInput} onChange={event => setDurationInput(event.target.value)} /></label></div>
        <p id="meeting-length-help" className="field-help">Enter 1 to 1,440 minutes (up to 24 hours).</p>
        {!validDuration ? <p className="study-overlap-message" role="alert">Enter a whole number from 1 to 1,440 minutes.</p> : !allHaveTimes ? <p className="study-overlap-message">Every accepted member needs to save at least one free window before we can compare the group.</p> : shared.length ? <ul className="study-overlap-list">{meetingWindows.map(window => <li key={`${window.day}-${window.start}-${window.end}`}><span className="study-overlap-day">{window.day}</span><strong>{formatTime(window.start)} – {formatTime(window.end)}</strong><span>{Math.floor((window.end - window.start) / 60)} hr {(window.end - window.start) % 60 ? `${(window.end - window.start) % 60} min` : ''} open</span></li>)}</ul> : <p className="study-overlap-message">No shared windows are long enough. Try a shorter meeting or add more availability.</p>}
      </section>
    </section>}
  </section>
}
