import { SharedGroupWarningBanner } from './StudentPrivacyControls'
import type { StudentPrivacyApi } from './studentPrivacy'
import { readableTimestampDate } from './dateTime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { SavedCourse } from './account'
import type { ClassmateApi, Classmate } from './classmates'
import { useClassmates } from './useClassmates'
import { findSharedWindows, formatTime, timeToMinutes } from './studyGroupScheduling'
import type { WeeklyAvailability } from './studyGroupScheduling'
import { studyDays } from './studyGroupApi'
import type { StudyDay, StudyGroup, StudyGroupApi, StudyWindow } from './studyGroupApi'
import StudyInvitationPicker from './StudyInvitationPicker'
import './StudyGroups.css'

const invitationDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const invitationTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
function invitationExpiration(value: string) { const date = new Date(value); return `${invitationDate.format(date)} ${invitationTime.format(date)}` }

const studyRoleOptions = ['Coordinator', 'Researcher', 'Note-taker', 'Presenter', 'Editor', 'Designer', 'Timekeeper']

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

export default function StudyGroups({ userId, courses, api, onGoToCourses, privacyApi }: {
  userId: string; courses: SavedCourse[]; classmatesApi: ClassmateApi
  api: StudyGroupApi; onGoToCourses: () => void; privacyApi?: StudentPrivacyApi
}) {
  const [groups, setGroups] = useState<StudyGroup[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadVersion, setLoadVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  type Attempt={run:()=>Promise<unknown>;done?: (value:unknown)=>void}
  const [attempt,setAttempt]=useState<Attempt|null>(null)
  const operationPending=useRef(false),alive=useRef(true),invitationAttempt=useRef<Attempt|null>(null)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  async function runInvitation(next:Attempt){
    if(operationPending.current)return
    operationPending.current=true;invitationAttempt.current=next;setBusy(true);setAttempt(next);setError('')
    try{const value=await next.run();if(alive.current){invitationAttempt.current=null;setAttempt(null);next.done?.(value);refreshGroups()}}
    catch(reason){if(alive.current){setError(reason instanceof Error?reason.message:'Study invitation unavailable.');refreshGroups()}}
    finally{operationPending.current=false;if(alive.current)setBusy(false)}
  }
  function invitation(action:(request:string)=>Promise<unknown>,done?:(value:unknown)=>void){
    if(attempt||operationPending.current)return
    const request=crypto.randomUUID()
    void runInvitation({run:()=>action(request),done})
  }
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const course = courses.find(value => value.id === courseId) ?? courses[0]
  const [candidateSearch,setCandidateSearch]=useState('')
  const candidateApi=useCallback<ClassmateApi>((courseCode,section,professorFirstName,professorLastName)=>api.candidates({courseCode,section,professorFirstName,professorLastName},undefined,candidateSearch),[api,candidateSearch])
  const roster = useClassmates(candidateApi, course?.section ? userId : null, course?.code ?? null, course?.section ?? null, course?.professorFirstName ?? null, course?.professorLastName ?? null)
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
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({})
  const [customRoleEditing, setCustomRoleEditing] = useState<Record<string, boolean>>({})
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDetails, setTaskDetails] = useState('')
  const selectedGroup = groups.find(group => group.group_id === selectedGroupId) ?? null
  const groupPanel = useRef<HTMLElement>(null)
  const visibleGroupId = selectedGroup?.my_status === 'accepted' ? selectedGroup.group_id : null
  useEffect(() => {
    if (!visibleGroupId) return
    const frame = requestAnimationFrame(() => {
      const panel = groupPanel.current
      if (!panel) return
      const header = document.querySelector<HTMLElement>('.site-header')
      const headerStyle = header && getComputedStyle(header)
      const inset = header && headerStyle && ['fixed', 'sticky'].includes(headerStyle.position)
        ? Math.max(0, header.getBoundingClientRect().height + (parseFloat(headerStyle.top) || 0)) : 0
      panel.style.scrollMarginTop = `${inset + 16}px`
      const bounds = panel.getBoundingClientRect()
      const heading = panel.querySelector('.study-detail-header')?.getBoundingClientRect() ?? bounds
      if (bounds.top >= inset + 16 && heading.bottom <= window.innerHeight) return
      panel.scrollIntoView?.({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [visibleGroupId])
  const [draftContext, setDraftContext] = useState({ groupId: selectedGroupId, userId })
  // Reset only when the selected group/account changes, never on a background
  // refresh that could otherwise overwrite unsaved availability.
  if (draftContext.groupId !== selectedGroupId || draftContext.userId !== userId) {
    setDraftContext({ groupId: selectedGroupId, userId })
    setDraft(fromGroup(selectedGroup, userId))
  }
  const refreshGroups = useCallback(() => {
    setLoadState(current => current === 'ready' ? 'ready' : 'loading')
    setLoadVersion(value => value + 1)
  }, [])

  useEffect(() => {
    let alive = true
    void api.list().then(result => {
      if (alive) { setGroups(result); setLoadState('ready'); if(!invitationAttempt.current)setError('') }
    }, reason => {
      if (alive) { setLoadState('error'); setError(reason instanceof Error ? reason.message : 'Study groups could not be loaded. Please retry.') }
    })
    return () => { alive = false }
  }, [api, loadVersion])

  useEffect(() => {
    const refreshVisibleGroups = () => {
      if (document.visibilityState === 'visible') refreshGroups()
    }
    const timer = window.setInterval(refreshVisibleGroups, 15_000)
    window.addEventListener('student-communication-settings-changed', refreshVisibleGroups)
    return () => { window.clearInterval(timer); window.removeEventListener('student-communication-settings-changed', refreshVisibleGroups) }
  }, [refreshGroups])

  const members = useMemo(() => selectedGroup?.members.filter(member => member.status === 'accepted') ?? [], [selectedGroup])
  const allHaveTimes = members.length > 0 && members.every(member => windowsFor(selectedGroup!, member.user_id).length > 0)
  const shared = useMemo(() => allHaveTimes && selectedGroup && validDuration
    ? findSharedWindows(members.map(member => member.user_id === userId ? draft : windowsFor(selectedGroup, member.user_id)), duration)
    : [], [allHaveTimes, selectedGroup, members, userId, draft, duration, validDuration])

  function changeCourse(value: string) {
    setCourseId(value); setSelectedPeers([]); setGroupName('');setCandidateSearch('')
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
    if (busy||operationPending.current) return
    operationPending.current=true;setBusy(true); setError('')
    try { const result = await action(); if(alive.current){done?.(result); refreshGroups()} }
    catch (reason) { if(alive.current)setError(reason instanceof Error ? reason.message : 'That change could not be saved. Please retry.') }
    finally { operationPending.current=false;if(alive.current)setBusy(false) }
  }
  function leaveSelectedGroup() {
    if (!selectedGroup || busy || attempt) return
    if (selectedGroup.owner_id === userId && members.length === 1 && !window.confirm('You are the only accepted member. Leaving will permanently delete this group. Continue?')) return
    invitation(request => api.leave(selectedGroup.group_id, request), () => setSelectedGroupId(null))
  }
  function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!course || !selectedPeers.length || !groupName.trim()) return
    const section = course.section
    if (!section) { setError('Choose a saved course section before inviting classmates.'); return }
    const input={courseCode:course.code,section,professorFirstName:course.professorFirstName??'',professorLastName:course.professorLastName??'',name:groupName,invitees:selectedPeers.map(peer=>peer.student_id).sort()}
    invitation(request => api.create(input,request), result => {
      if (typeof result === 'string') setSelectedGroupId(result)
      setGroupName(''); setSelectedPeers([])
    })
  }
  function updateMemberRole(memberId: string, role: string | null, afterSave?: () => void) {
    if (!selectedGroup) return
    void perform(() => api.setMemberRole(selectedGroup.group_id, memberId, role), afterSave)
  }
  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedGroup || !taskTitle.trim()) return
    void perform(() => api.addTask(selectedGroup.group_id, taskTitle, taskDetails), () => {
      setTaskTitle('')
      setTaskDetails('')
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

    {attempt&&<div role="status"><p>This change has not been confirmed. Retry checks the same change. Stopping retries will not undo a change already saved.</p><button disabled={busy} onClick={()=>void runInvitation(attempt)}>Retry Study change</button><button disabled={busy} onClick={()=>{invitationAttempt.current=null;setAttempt(null);setError('')}}>Stop retrying</button></div>}
    {error && <div className="study-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Dismiss</button></div>}
    {loadState === 'loading' && <p role="status">Loading your study groups…</p>}
    {loadState === 'error' && <div className="study-empty"><p>Groups could not be refreshed.</p><button type="button" onClick={refreshGroups}>Retry</button></div>}

    {!!pendingInvites.length && <section className="study-invitations panel" aria-labelledby="study-invitations-title">
      <p className="eyebrow">YOU HAVE AN INVITATION</p><h2 id="study-invitations-title">Group invitations</h2>
      {pendingInvites.map(group => <article className="study-invitation" key={group.group_id}><div><h3>{group.name}</h3><p>{group.course_code}{group.course_section ? ` · Section ${group.course_section}` : ''} · invited by {group.inviter?.name ?? 'a classmate'}{group.invitation_state==='pending'&&group.expires_at?` - Expires ${invitationExpiration(group.expires_at)}`:group.invitation_state==='expired'?' - Expired':' - Invitation unavailable'}</p></div><div className="study-actions"><button type="button" disabled={busy||!!attempt||group.invitation_state!=='pending'} onClick={() => invitation(request => api.respond(group.group_id,group.invitation_id,true,request))}>Accept</button><button type="button" disabled={busy||!!attempt} onClick={() => invitation(request => api.respond(group.group_id,group.invitation_id,false,request))}>Decline</button></div></article>)}
    </section>}

    <div className="study-groups-grid">
      <section className="panel study-setup" aria-labelledby="study-setup-heading">
        <div className="study-section-heading"><span className="study-step">01</span><div><p className="eyebrow">START WITH A CLASS</p><h2 id="study-setup-heading">Create a group</h2></div></div>
        {!courses.length ? <div className="study-empty"><h3>Add a course first</h3><p>Study groups start from a course you have saved.</p><button type="button" className="primary" onClick={onGoToCourses}>Go to My dashboard</button></div> : <>
          <label htmlFor="study-course">Shared course</label><select id="study-course" value={course?.id ?? ''} onChange={event => changeCourse(event.target.value)}>{courses.map(saved => <option value={saved.id} key={saved.id}>{saved.code}{saved.section ? ` · Section ${saved.section}` : saved.sections?.length ? ` · Sections ${saved.sections.join(', ')}` : ''}{saved.professorFirstName&&saved.professorLastName?` - ${saved.professorFirstName} ${saved.professorLastName}`:''}</option>)}</select>
          <p className="field-help">Choose a course section to find classmates from that section. Private friends in the same offering can also be invited. Invited students choose whether to join; invitations expire after 7 days.</p>
          <label>Find classmates in the selected offering<input maxLength={100} value={candidateSearch} disabled={busy||!!attempt} onChange={event=>setCandidateSearch(event.target.value)}/></label>
          <div className="study-roster-heading"><h3>Invite classmates</h3><span>{selectedPeers.length}/7 selected</span></div>
          {!course?.section && <div className="study-empty"><p>Save a course with a section before inviting classmates.</p><button type="button" className="primary" onClick={onGoToCourses}>Go to My dashboard</button></div>}
          {course?.section && roster.status === 'loading' && <p role="status">Finding classmates in {course.code} · Section {course.section}…</p>}
          {roster.status === 'error' && <div className="study-empty"><p role="alert">{roster.message}</p><button type="button" onClick={roster.retry}>Retry</button></div>}
          {roster.status === 'success' && !roster.classmates.length && <div className="study-empty"><h3>No classmates in {course?.code} · Section {course.section} yet</h3><p>Other students need to save this section before they appear here.</p></div>}
          {roster.status === 'success' && !!roster.classmates.length && <ul className="study-peer-list">{roster.classmates.map(peer => {
            const checked = selectedPeers.some(item => item.student_id === peer.student_id)
            return <li key={peer.student_id}><label className="study-peer-choice"><input type="checkbox" checked={checked} disabled={!checked && selectedPeers.length >= 7} onChange={() => togglePeer(peer)} /><span><strong>{peer.name}</strong><small>{peer.major ?? 'Major not added'}</small></span><span>{checked ? 'Selected' : 'Invite'}</span></label></li>
          })}</ul>}
          <form className="study-group-form" onSubmit={createGroup}><label htmlFor="study-group-name">Group name<input id="study-group-name" value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={80} placeholder={`${course?.code ?? 'Course'} study group`} required /></label><button className="primary" type="submit" disabled={busy || !!attempt || !course?.section || !selectedPeers.length || !groupName.trim()}>{busy ? 'Creating…' : 'Create group and invite'}</button></form>
        </>}
      </section>

      <section className="panel study-groups-list" aria-labelledby="study-groups-list-title">
        <div className="study-section-heading"><span className="study-step">02</span><div><p className="eyebrow">YOUR STUDY TEAMS</p><h2 id="study-groups-list-title">Your groups</h2></div></div>
        {!activeGroups.length ? <div className="study-empty"><h3>No joined groups yet</h3><p>Create a group or accept an invitation to start comparing times.</p></div> : <ul className="study-saved-groups">{activeGroups.map(group => <li key={group.group_id}><button type="button" className="study-group-card" aria-pressed={selectedGroupId === group.group_id} onClick={() => { setSelectedGroupId(group.group_id); setDraft(fromGroup(group, userId)) }}><span className="eyebrow">{group.course_code}{group.course_section ? ` · Section ${group.course_section}` : ''}</span><strong>{group.name}</strong><span className="study-membership-counts"><span className="study-status-badge">{group.members.filter(member => member.status === 'accepted').length} members</span> <span className="study-status-badge is-pending">{group.pending_count} pending</span></span></button></li>)}</ul>}
      </section>
    </div>

    {selectedGroup?.my_status === 'accepted' && <section ref={groupPanel} className="panel study-detail" aria-labelledby="study-detail-heading">
      <header className="study-detail-header"><div><p className="eyebrow">{selectedGroup.course_code}{selectedGroup.course_section ? ` · Section ${selectedGroup.course_section}` : ''} · GROUP SCHEDULE</p><h2 id="study-detail-heading">{selectedGroup.name}</h2><div className="study-membership-counts"><span className="study-status-badge">{members.length} accepted member{members.length === 1 ? '' : 's'}</span><span className="study-status-badge is-pending">{selectedGroup.pending_count} pending invitation{selectedGroup.pending_count === 1 ? '' : 's'}</span></div></div><button type="button" disabled={busy||!!attempt} onClick={leaveSelectedGroup}>Leave group</button></header>
      <SharedGroupWarningBanner api={privacyApi} userId={userId} context="study" groupId={selectedGroup.group_id} onLeave={leaveSelectedGroup} leaveDisabled={busy||!!attempt} />
      {selectedGroup.can_invite?<details className="study-invitation-management"><summary>Invite additional classmates</summary><StudyInvitationPicker key={selectedGroup.group_id} api={api} group={selectedGroup} disabled={busy||!!attempt} onInvite={ids=>invitation(request=>api.invite(selectedGroup.group_id,ids,request))}/></details>:<p>New invitations are unavailable for this group. Accepted members can continue collaborating.</p>}
      {selectedGroup.outgoing_invitations.length>0&&<details className="study-invitation-management"><summary>Your sent invitations</summary><ul className="study-sent-invitations">{selectedGroup.outgoing_invitations.map(row=><li key={row.invitation_id}><div><strong>{row.name}</strong><p>{row.expires_at?`Expires ${invitationExpiration(row.expires_at)}`:'Expiration unavailable'}</p></div><span className={`study-status-badge is-${row.state}`}>{row.state==='pending'?'Pending':row.state==='expired'?'Expired':'Unavailable'}</span></li>)}</ul></details>}
      {selectedGroup.semester&&selectedGroup.academic_year&&selectedGroup.professor_first_name&&selectedGroup.professor_last_name&&<p>{selectedGroup.professor_first_name} {selectedGroup.professor_last_name} - {selectedGroup.semester} {selectedGroup.academic_year}</p>}
      <p className="study-schedule-guidance">Add recurring free windows you are comfortable sharing. Course codes and sections do not include meeting times, so the app cannot infer schedules from them.</p>
      <div className="study-members">
        {members.map(member => {
          const own = member.user_id === userId
          const times = own ? draft : windowsFor(selectedGroup, member.user_id)
          const mayAssignRole = own || selectedGroup.owner_id === userId
          const knownRole = member.study_role === null || studyRoleOptions.includes(member.study_role)
          const isCustomRoleEditing = customRoleEditing[member.user_id] ?? !knownRole
          const roleSelectValue = isCustomRoleEditing ? '__custom__' : member.study_role ?? ''
          const customRoleValue = roleDrafts[member.user_id] ?? (knownRole ? '' : member.study_role ?? '')
          return <section className="study-member-availability" key={member.user_id}><div className="study-member-heading"><div><h3>{own ? 'Your availability' : member.name}</h3><p className="muted">{own ? 'Only accepted members of this group can see these windows.' : 'Shared with this group'}</p><div className="study-member-role"><label htmlFor={`study-role-${selectedGroup.group_id}-${member.user_id}`}>Project role</label>{mayAssignRole ? <><select id={`study-role-${selectedGroup.group_id}-${member.user_id}`} value={roleSelectValue} disabled={busy} onChange={event => {
              const value = event.target.value
              if (value === '__custom__') {
                setRoleDrafts(current => ({ ...current, [member.user_id]: knownRole ? '' : member.study_role ?? '' }))
                setCustomRoleEditing(current => ({ ...current, [member.user_id]: true }))
              } else {
                setCustomRoleEditing(current => ({ ...current, [member.user_id]: false }))
                updateMemberRole(member.user_id, value || null)
              }
            }}><option value="">Not assigned</option>{studyRoleOptions.map(role => <option key={role} value={role}>{role}</option>)}<option value="__custom__">Other role…</option>{!knownRole && <option value={member.study_role!}>{member.study_role}</option>}</select>{roleSelectValue === '__custom__' && <form className="study-custom-role" onSubmit={event => { event.preventDefault(); updateMemberRole(member.user_id, customRoleValue.trim() || null, () => setCustomRoleEditing(current => ({ ...current, [member.user_id]: false }))) }}><input aria-label={`Custom project role for ${member.name}`} value={customRoleValue} maxLength={60} placeholder="Type a role" onChange={event => setRoleDrafts(current => ({ ...current, [member.user_id]: event.target.value }))} /><button type="submit" disabled={busy || !customRoleValue.trim()}>{busy ? 'Saving…' : 'Save role'}</button></form>}</> : <p className="study-role-readonly">{member.study_role || 'Not assigned'}</p>}</div></div><span className={`study-availability-status${times.length ? ' is-ready' : ''}`}>{times.length ? `${times.length} window${times.length === 1 ? '' : 's'}` : 'Add availability'}</span></div>
            {times.length > 0 && <ul className="study-time-list">{times.map((window, index) => <li key={`${window.day}-${window.start}-${window.end}-${index}`}><span><strong>{window.day}</strong><span>{formatTime(window.start)} – {formatTime(window.end)}</span></span>{own && <button type="button" disabled={busy} onClick={() => setDraft(current => current.filter((_, currentIndex) => currentIndex !== index))}>Remove</button>}</li>)}</ul>}
            {own && <><form className="study-availability-form" onSubmit={addWindow}><div className="study-time-inputs"><label>Day<select name="day" defaultValue="Monday">{studyDays.map(day => <option key={day}>{day}</option>)}</select></label><label>From<input name="start" type="text" inputMode="text" placeholder="10:35 AM" value={startTimeInput} aria-invalid={Boolean(timeInputErrors.start)} aria-describedby={timeInputErrors.start ? 'study-start-time-error' : undefined} onChange={event => { setStartTimeInput(event.target.value); setTimeInputErrors({}) }} required />{timeInputErrors.start && <span className="study-input-error" id="study-start-time-error" role="alert">{timeInputErrors.start}</span>}</label><label>Until<input name="end" type="text" inputMode="text" placeholder="12:00 PM" value={endTimeInput} aria-invalid={Boolean(timeInputErrors.end)} aria-describedby={timeInputErrors.end ? 'study-end-time-error' : undefined} onChange={event => { setEndTimeInput(event.target.value); setTimeInputErrors({}) }} required />{timeInputErrors.end && <span className="study-input-error" id="study-end-time-error" role="alert">{timeInputErrors.end}</span>}</label></div><p className="field-help">Type a time such as 10:35 AM or 14:35. Starts can be 00:00–23:59; ends can be 00:01–24:00.</p><button type="submit">Add time</button></form><button className="primary study-save-times" type="button" disabled={busy} onClick={() => void perform(() => api.saveAvailability(selectedGroup.group_id, toStudyWindows(draft)))}>{busy ? 'Saving…' : 'Save my availability'}</button></>}
          </section>
        })}
      </div>
      <section className="study-task-board" aria-labelledby="study-task-heading">
        <div className="study-task-header"><div><p className="eyebrow">SHARED PROJECT SPACE</p><h3 id="study-task-heading">Tasks and notes</h3><p className="field-help">Accepted members can add tasks and mark them complete. Updates refresh automatically about every 15 seconds.</p></div><span>{selectedGroup.tasks.length}/100 tasks</span></div>
        <form className="study-task-form" onSubmit={addTask}>
          <label htmlFor="study-task-title">Task or note<input id="study-task-title" value={taskTitle} onChange={event => setTaskTitle(event.target.value)} maxLength={160} placeholder="e.g. Draft the introduction" required /></label>
          <label htmlFor="study-task-details">Details (optional)<textarea id="study-task-details" rows={3} value={taskDetails} onChange={event => setTaskDetails(event.target.value)} maxLength={1000} placeholder="Add context, links as plain text, or next steps" /></label>
          <button className="primary" type="submit" disabled={busy || !taskTitle.trim() || selectedGroup.tasks.length >= 100}>{busy ? 'Adding…' : 'Add to shared board'}</button>
        </form>
        {!selectedGroup.tasks.length ? <div className="study-empty"><p>No tasks or notes yet. Add the first item for your group.</p></div> : <ul className="study-task-list">{selectedGroup.tasks.map(task => {
          const mayDelete = task.created_by === userId || selectedGroup.owner_id === userId
          return <li key={task.id} className={task.is_complete ? 'is-complete' : ''}><label className="study-task-check"><input type="checkbox" checked={task.is_complete} disabled={busy} aria-label={`${task.is_complete ? 'Reopen' : 'Complete'} task: ${task.title}`} onChange={event => void perform(() => api.setTaskComplete(task.id, event.target.checked))} /><span><strong>{task.title}</strong>{task.details && <span className="study-task-details">{task.details}</span>}<small>Added by {task.created_by_name} · {readableTimestampDate(task.created_at)}</small></span></label>{mayDelete && <button type="button" className="study-task-delete" disabled={busy} aria-label={`Delete task: ${task.title}`} onClick={() => void perform(() => api.deleteTask(task.id))}>Delete</button>}</li>
        })}</ul>}
      </section>
      <section className="study-overlap" aria-labelledby="study-overlap-heading"><div className="study-overlap-heading"><div><p className="eyebrow">SHARED WINDOWS</p><h3 id="study-overlap-heading">Times that work for everyone</h3></div><label>Meeting length (minutes)<input aria-describedby="meeting-length-help" type="number" min={1} max={1440} step={1} value={durationInput} onChange={event => setDurationInput(event.target.value)} /></label></div>
        <p id="meeting-length-help" className="field-help">Enter 1 to 1,440 minutes (up to 24 hours).</p>
        {!validDuration ? <p className="study-overlap-message" role="alert">Enter a whole number from 1 to 1,440 minutes.</p> : !allHaveTimes ? <p className="study-overlap-message">Every accepted member needs to save at least one free window before we can compare the group.</p> : shared.length ? <ul className="study-overlap-list">{meetingWindows.map(window => <li key={`${window.day}-${window.start}-${window.end}`}><span className="study-overlap-day">{window.day}</span><strong>{formatTime(window.start)} – {formatTime(window.end)}</strong><span>{Math.floor((window.end - window.start) / 60)} hr {(window.end - window.start) % 60 ? `${(window.end - window.start) % 60} min` : ''} open</span></li>)}</ul> : <p className="study-overlap-message">No shared windows are long enough. Try a shorter meeting or add more availability.</p>}
      </section>
    </section>}
  </section>
}
