import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import ManualClasses from './ManualClasses'
import ScheduleImportPreview from './ScheduleImportPreview'
import type { CourseId, Course } from './sampleData'
import type { ClassmateState } from './useClassmates'
import { duplicateCourseCode, validateRows } from './account'
import type { StudentProfile, ClassRow } from './account'
import { rankRecommendations } from './courseRecommendations'
import type { RankedRecommendation } from './courseRecommendations'
import type { RecommendationState } from './useCourseRecommendations'
import type { FriendRelationship } from './friendshipApi'
import type { ProfessorCatalogState } from './courseProfessors'

export default function CourseBrowser({ enrolledCourses, onAddClasses, onEditCourse, onRemoveCourse, professorCatalog, client = null, selectedId, onSelect, roster, onRetry, onViewProfile, profile, recommendations, onRetryRecommendations, relationshipById = new Map(), friendActionBusy = new Set(), onSendFriend, onOpenFriendRequests }: {
  enrolledCourses: Course[]
  onAddClasses: (rows: ClassRow[]) => Promise<void>
  onEditCourse?: (enrollmentId: string, row: ClassRow) => Promise<Course>
  onRemoveCourse?: (enrollmentId: string) => Promise<void>
  professorCatalog: ProfessorCatalogState
  client?: SupabaseClient | null
  selectedId: CourseId | null
  onSelect: (id: CourseId | null) => void
  roster: ClassmateState
  onViewProfile?: (id: string) => void
  onRetry: () => void
  profile?: StudentProfile
  recommendations?: RecommendationState
  onRetryRecommendations?: () => void
  relationshipById?: Map<string, FriendRelationship>
  friendActionBusy?: Set<string>
  onSendFriend?: (student: string, course: string, section: string, professorFirstName: string, professorLastName: string) => void
  onOpenFriendRequests?: () => void
}) {
  const [activeList, setActiveList] = useState<'classmates' | 'recommendations'>('classmates')
  const [editing, setEditing] = useState<Course | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null)
  const [changeBusy, setChangeBusy] = useState(false)
  const [changeMessage, setChangeMessage] = useState('')
  const [editRow, setEditRow] = useState<ClassRow>({ code: '', section: '', professor_first_name: '', professor_last_name: '' })
  const selected = enrolledCourses.find(course => course.id === selectedId)
  const { classmates } = roster
  const rankedRecommendations: RankedRecommendation[] = recommendations?.status === 'success' && profile
    ? rankRecommendations(profile, recommendations.candidates).filter(candidate => relationshipById.get(candidate.student_id)?.relationship !== 'accepted')
    : []
  async function saveClasses(rows: ClassRow[]) {
    if (professorCatalog.status !== 'success') throw new Error('The approved professor list is unavailable. Retry it before saving classes.')
    const duplicate = duplicateCourseCode(rows, enrolledCourses.map(course => course.code))
    if (duplicate) throw new Error(`${duplicate} is already on your dashboard for this semester and academic year. You can add it again in another semester or academic year.`)
    await onAddClasses(rows)
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || !('enrollmentId' in editing) || !editing.enrollmentId || !onEditCourse || changeBusy) return
    if (!validateRows([editRow])) { setChangeMessage('Enter a valid course code, section, and professor first and last name.'); return }
    const duplicate = duplicateCourseCode([editRow], enrolledCourses.filter(course => course.id !== editing.id).map(course => course.code))
    if (duplicate) { setChangeMessage(`${duplicate} is already on your dashboard for this semester and academic year.`); return }
    setChangeBusy(true); setChangeMessage('Saving course changes…')
    try {
      const updated = await onEditCourse(editing.enrollmentId, editRow)
      onSelect(updated.id)
      setEditing(null); setChangeMessage('')
    } catch (error) { setChangeMessage(error instanceof Error ? error.message : 'Course could not be updated. Please retry.') }
    finally { setChangeBusy(false) }
  }
  async function confirmDelete() {
    if (!deleteTarget || !('enrollmentId' in deleteTarget) || !deleteTarget.enrollmentId || !onRemoveCourse || changeBusy) return
    setChangeBusy(true); setChangeMessage('Removing course…')
    try {
      const wasSelected = selectedId === deleteTarget.id
      await onRemoveCourse(deleteTarget.enrollmentId)
      if (wasSelected) {
        const next = enrolledCourses.find(course => course.id !== deleteTarget.id)
        onSelect(next?.id ?? null)
      }
      setDeleteTarget(null); setChangeMessage('')
    } catch (error) { setChangeMessage(error instanceof Error ? error.message : 'Course could not be removed. Please retry.') }
    finally { setChangeBusy(false) }
  }
  return <div className="course-browser">
    <section className="panel courses" aria-labelledby="courses-heading">
      <div className="section-top"><h2 id="courses-heading">Your courses</h2><span className="muted">{enrolledCourses.length} {enrolledCourses.length === 1 ? 'section' : 'sections'}</span></div>
      <p className="muted">Pick a course section to see who’s learning alongside you.</p>
      <ManualClasses onSave={saveClasses} catalog={professorCatalog} />
      <ScheduleImportPreview onAddClasses={saveClasses} catalog={professorCatalog} client={client} />
      {!enrolledCourses.length && <p className="empty-state">No saved classes yet. Enter classes manually or confirm a reviewed schedule.</p>}
      <div className="course-controls">{enrolledCourses.map(course => <div className={`course-control-row${selectedId === course.id ? ' course-control-row-selected' : ''}`} key={course.id}>
        <button className="course-select-button" aria-pressed={selectedId === course.id} onClick={() => onSelect(course.id)}>
          <span className="course-symbol" aria-hidden="true">{course.code.startsWith('CSE') ? '</>' : '∑'}</span>
          <strong>{course.code}</strong>{course.section && <span className="course-state">Section {course.section}</span>}{course.professorFirstName && course.professorLastName && <span className="course-state">{course.professorFirstName} {course.professorLastName}</span>}{course.verificationStatus && course.verificationStatus !== 'verified' && <span className="course-state">{course.verificationStatus === 'pending' ? 'Course awaiting verification' : course.verificationStatus === 'rejected' ? 'Course not verified' : 'Legacy class needs confirmation'}</span>}<span className="course-state">{selectedId === course.id ? 'Selected ✓' : course.verificationStatus === 'verified' ? 'View classmates' : 'Verification required'}</span>
        </button>
        {course.enrollmentId && (onEditCourse || onRemoveCourse) && <div className="course-management-actions">
          {onEditCourse && <button type="button" aria-label={`Edit ${course.code}`} title="Edit course" disabled={changeBusy} onClick={() => { setEditRow({ code: course.code, section: course.section ?? '', professor_first_name: course.professorFirstName ?? '', professor_last_name: course.professorLastName ?? '' }); setEditing(course); setChangeMessage('') }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Z"/><path d="m14.8 5.7 3.5 3.5"/></svg></button>}
          {onRemoveCourse && <button type="button" aria-label={`Delete ${course.code}`} title="Delete course" disabled={changeBusy} onClick={() => { setDeleteTarget(course); setChangeMessage('') }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2m3 0-.8 14H5.8L5 6m4 4v6m6-6v6"/></svg></button>}
        </div>}
      </div>)}</div>
      {editing && <div className="course-modal-backdrop" onKeyDown={event => { if (event.key === 'Escape' && !changeBusy) { setEditing(null); setChangeMessage('') } }}><section className="course-modal panel" role="dialog" aria-modal="true" aria-labelledby="edit-course-title"><h2 id="edit-course-title">Edit course</h2><form onSubmit={saveEdit}>
        <label>Course Code<input autoFocus value={editRow.code} disabled={changeBusy} onChange={event => setEditRow(row => ({ ...row, code: event.target.value }))} placeholder="CSE 310" /></label>
        <label>Section<input value={editRow.section} maxLength={20} disabled={changeBusy} onChange={event => setEditRow(row => ({ ...row, section: event.target.value }))} placeholder="01" /></label>
        <label>Professor First Name<input value={editRow.professor_first_name} maxLength={80} disabled={changeBusy} onChange={event => setEditRow(row => ({ ...row, professor_first_name: event.target.value }))} /></label>
        <label>Professor Last Name<input value={editRow.professor_last_name} maxLength={80} disabled={changeBusy} onChange={event => setEditRow(row => ({ ...row, professor_last_name: event.target.value }))} /></label>
        {changeMessage && <p role={changeMessage.startsWith('Saving') ? 'status' : 'alert'}>{changeMessage}</p>}
        <div className="course-modal-actions"><button type="button" disabled={changeBusy} onClick={() => { setEditing(null); setChangeMessage('') }}>Cancel</button><button className="primary" type="submit" disabled={changeBusy}>{changeBusy ? 'Saving…' : 'Save changes'}</button></div>
      </form></section></div>}
      {deleteTarget && <div className="course-modal-backdrop" onKeyDown={event => { if (event.key === 'Escape' && !changeBusy) { setDeleteTarget(null); setChangeMessage('') } }}><section className="course-modal panel" role="alertdialog" aria-modal="true" aria-labelledby="delete-course-title" aria-describedby="delete-course-description"><h2 id="delete-course-title">Remove {deleteTarget.code}?</h2><p id="delete-course-description">This will remove the course from your current dashboard and stop course access tied to this enrollment.</p>{changeMessage && <p role={changeMessage.startsWith('Removing') ? 'status' : 'alert'}>{changeMessage}</p>}<div className="course-modal-actions"><button type="button" autoFocus disabled={changeBusy} onClick={() => { setDeleteTarget(null); setChangeMessage('') }}>Keep course</button><button className="danger" type="button" disabled={changeBusy} onClick={() => void confirmDelete()}>{changeBusy ? 'Removing…' : 'Remove course'}</button></div></section></div>}
    </section>
    {selected && <section className="classmates" aria-label={`${selected.code} student lists`}>
      {selected.verificationStatus !== 'verified' ? <div className="panel empty-state">
        <h2>{selected.verificationStatus === 'pending' ? 'Course awaiting verification' : 'Course not verified'}</h2>
        <p className="muted">This course section must be verified before you can view its classmates or recommendations.</p>
      </div> : <>
      {recommendations && <div className="course-list-switcher" role="group" aria-label={`${selected.code} section ${selected.section ?? ''} people lists`}>
        <button type="button" aria-pressed={activeList === 'classmates'} onClick={() => setActiveList('classmates')}>Classmates</button>
        <button type="button" aria-pressed={activeList === 'recommendations'} onClick={() => setActiveList('recommendations')}>Recommendations</button>
      </div>}
      {activeList === 'classmates' || !recommendations ? <>
      <div className="roster-heading" aria-live="polite" aria-atomic="true"><div><p className="eyebrow">SHARED COURSE SECTION</p><h2 id="classmates-heading">Classmates in {selected.code}{selected.section ? ` · Section ${selected.section}` : ''}{selected.professorFirstName && selected.professorLastName ? ` · ${selected.professorFirstName} ${selected.professorLastName}` : ''}</h2></div>{roster.status === 'success' && <span className="count">{classmates.length} {classmates.length === 1 ? 'classmate' : 'classmates'}</span>}</div>
      {roster.status === 'loading' && <p role="status">Loading classmates…</p>}
      {roster.status === 'error' && <div className="panel empty-state"><p role="alert">Unable to load classmates. Please retry.</p><button onClick={onRetry}>Retry classmates</button></div>}
      {roster.status === 'success' && (classmates.length ? <ul className="roster">{classmates.map(student => <li key={student.student_id} className="panel student-card">
        <h3>{student.name}</h3>{onViewProfile && <button onClick={() => onViewProfile(student.student_id)} aria-label={`View profile of ${student.name}`}>View profile</button>}<p className="student-major">{student.major ?? 'Major not added'}</p>
      </li>)}</ul> : <div className="panel empty-state"><h3>No classmates yet</h3><p className="muted">No other students have saved this section yet.</p></div>)}
      <p className="roster-note">Your name and major are visible to eligible students sharing this current-semester course section. You choose whether to share your year, interests, residence status, and picture in Edit profile. Optional details stay private until shared. Course enrollment is self-reported, not official registration.</p>
      </> : <>
      <div className="roster-heading"><div><p className="eyebrow">COURSE CONNECTIONS</p><h2 id="recommendations-heading">People you may connect with in {selected.code}{selected.section ? ` · Section ${selected.section}` : ''}{selected.professorFirstName && selected.professorLastName ? ` · ${selected.professorFirstName} ${selected.professorLastName}` : ''}</h2></div></div>
      {recommendations.status === 'loading' && <p role="status">Loading course recommendations…</p>}
      {recommendations.status === 'error' && <div className="panel empty-state"><p role="alert">Unable to load course recommendations. Please retry.</p><button onClick={onRetryRecommendations}>Retry recommendations</button></div>}
      {recommendations.status === 'success' && (rankedRecommendations.length ? <ul className="recommendation-list">{rankedRecommendations.map(candidate => <li key={candidate.student_id} className="panel recommendation-card">
        <div className="recommendation-title"><h3>{candidate.name}</h3><span className={`recommendation-score ${candidate.score >= 80 ? 'recommendation-score-high' : candidate.score >= 50 ? 'recommendation-score-medium' : 'recommendation-score-low'}`} aria-label={`${candidate.score}% similarity`}>{candidate.score}%</span></div>
        <div className="recommendation-common" aria-label="Things in common">
          <p className="recommendation-common-heading">Things in Common:</p>
          {candidate.sharedMajor && <p className="recommendation-detail">Major: {candidate.sharedMajor}</p>}
          <p className="recommendation-detail">Courses: {candidate.sharedCourses.length ? candidate.sharedCourses.join(', ') : 'None'}</p>
          {candidate.sharedInterests?.length ? <p className="recommendation-detail">Interests: {candidate.sharedInterests.join(', ')}</p> : null}
          {candidate.sharedYear && <p className="recommendation-detail">Academic year: {candidate.sharedYear}</p>}
          {candidate.sharedResidenceStatus && <p className="recommendation-detail">Residence: {candidate.sharedResidenceStatus}</p>}
        </div>
        {(() => {
          const relationship = relationshipById.get(candidate.student_id)?.relationship ?? 'none'
          const busy = friendActionBusy.has(candidate.student_id)
          if (relationship === 'outgoing_pending') return <p role="status" className="friend-status">Friend request sent</p>
          if (relationship === 'incoming_pending') return <button type="button" className="respond-friend-request-button" onClick={onOpenFriendRequests}>Respond to friend request</button>
          if (relationship === 'accepted') return <p role="status" className="friend-status">Friends</p>
          const label = busy ? 'Sending friend request' : relationship === 'declined' ? 'Send friend request again' : 'Add friend'
          return <div className="recommendation-actions">
            <button type="button" className="add-friend-button" aria-label={label} title={relationship === 'declined' ? 'Send friend request again' : 'Add friend'} disabled={busy} onClick={() => selected.section && selected.professorFirstName && selected.professorLastName && onSendFriend?.(candidate.student_id, selected.code, selected.section, selected.professorFirstName, selected.professorLastName)}>
              {busy ? <span aria-hidden="true">…</span> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4" /><path d="M2.5 21a6.5 6.5 0 0 1 13 0M19 8v8m-4-4h8" /></svg>}
              <span>{busy ? 'Sending…' : 'Add friend'}</span>
            </button>
            {onViewProfile && <button type="button" className="recommendation-profile-button" aria-label={`View profile of ${candidate.name}`} onClick={() => onViewProfile(candidate.student_id)}>View profile</button>}
          </div>
        })()}
      </li>)}</ul> : <div className="panel empty-state"><h3>No recommendations yet</h3><p className="muted">No other eligible students have saved this section.</p></div>)}
      </>}
      </>}
    </section>}
  </div>
}
