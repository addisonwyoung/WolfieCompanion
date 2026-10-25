import { useState } from 'react'
import ManualClasses from './ManualClasses'
import ScheduleImportPreview from './ScheduleImportPreview'
import type { CourseId, Course } from './sampleData'
import type { ClassmateState } from './useClassmates'
import type { StudentProfile, ClassRow } from './account'
import { rankRecommendations } from './courseRecommendations'
import type { RankedRecommendation } from './courseRecommendations'
import type { RecommendationState } from './useCourseRecommendations'
import type { FriendRelationship } from './friendshipApi'

export default function CourseBrowser({ enrolledCourses, onAddClasses, selectedId, onSelect, roster, onRetry, onViewProfile, profile, recommendations, onRetryRecommendations, relationshipById = new Map(), friendActionBusy = new Set(), onSendFriend, onOpenFriendRequests }: {
  enrolledCourses: Course[]
  onAddClasses: (rows: ClassRow[]) => Promise<void>
  selectedId: CourseId | null
  onSelect: (id: CourseId) => void
  roster: ClassmateState
  onViewProfile?: (id: string) => void
  onRetry: () => void
  profile?: StudentProfile
  recommendations?: RecommendationState
  onRetryRecommendations?: () => void
  relationshipById?: Map<string, FriendRelationship>
  friendActionBusy?: Set<string>
  onSendFriend?: (student: string, course: string, section: string) => void
  onOpenFriendRequests?: () => void
}) {
  const [activeList, setActiveList] = useState<'classmates' | 'recommendations'>('classmates')
  const selected = enrolledCourses.find(course => course.id === selectedId)
  const { classmates } = roster
  const rankedRecommendations: RankedRecommendation[] = recommendations?.status === 'success' && profile
    ? rankRecommendations(profile, recommendations.candidates).filter(candidate => relationshipById.get(candidate.student_id)?.relationship !== 'accepted')
    : []
  return <div className="course-browser">
    <section className="panel courses" aria-labelledby="courses-heading">
      <div className="section-top"><h2 id="courses-heading">Your courses</h2><span className="muted">{enrolledCourses.length} {enrolledCourses.length === 1 ? 'section' : 'sections'}</span></div>
      <p className="muted">Pick a course section to see who’s learning alongside you.</p>
      <ManualClasses onSave={onAddClasses} />
      <ScheduleImportPreview onAddClasses={onAddClasses} />
      {!enrolledCourses.length && <p className="empty-state">No saved classes yet. Enter classes manually or confirm a reviewed schedule.</p>}
      <div className="course-controls">{enrolledCourses.map(course => <button key={course.id} aria-pressed={selectedId === course.id} onClick={() => onSelect(course.id)}>
        <span className="course-symbol" aria-hidden="true">{course.code.startsWith('CSE') ? '</>' : '∑'}</span>
        <strong>{course.code}</strong>{course.section && <span className="course-state">Section {course.section}</span>}{course.verificationStatus && course.verificationStatus !== 'verified' && <span className="course-state">{course.verificationStatus === 'pending' ? 'Course awaiting verification' : course.verificationStatus === 'rejected' ? 'Course not verified' : 'Legacy class needs confirmation'}</span>}<span className="course-state">{selectedId === course.id ? 'Selected ✓' : 'View classmates'}</span>
      </button>)}</div>
    </section>
    {selected && <section className="classmates" aria-label={`${selected.code} student lists`}>
      {recommendations && <div className="course-list-switcher" role="group" aria-label={`${selected.code} section ${selected.section ?? ''} people lists`}>
        <button type="button" aria-pressed={activeList === 'classmates'} onClick={() => setActiveList('classmates')}>Classmates</button>
        <button type="button" aria-pressed={activeList === 'recommendations'} onClick={() => setActiveList('recommendations')}>Recommendations</button>
      </div>}
      {activeList === 'classmates' || !recommendations ? <>
      <div className="roster-heading" aria-live="polite" aria-atomic="true"><div><p className="eyebrow">SHARED COURSE SECTION</p><h2 id="classmates-heading">Classmates in {selected.code}{selected.section ? ` · Section ${selected.section}` : ''}</h2></div>{roster.status === 'success' && <span className="count">{classmates.length} {classmates.length === 1 ? 'classmate' : 'classmates'}</span>}</div>
      {roster.status === 'loading' && <p role="status">Loading classmates…</p>}
      {roster.status === 'error' && <div className="panel empty-state"><p role="alert">Unable to load classmates. Please retry.</p><button onClick={onRetry}>Retry classmates</button></div>}
      {roster.status === 'success' && (classmates.length ? <ul className="roster">{classmates.map(student => <li key={student.student_id} className="panel student-card">
        <h3>{student.name}</h3>{onViewProfile && <button onClick={() => onViewProfile(student.student_id)} aria-label={`View profile of ${student.name}`}>View profile</button>}<p className="student-major">{student.major ?? 'Major not added'}</p>
      </li>)}</ul> : <div className="panel empty-state"><h3>No classmates yet</h3><p className="muted">No other students have saved this section yet.</p></div>)}
      <p className="roster-note">Your name and major are visible to eligible students sharing this current-semester course section. You choose whether to share your year, interests, residence status, and picture in Edit profile. Optional details stay private until shared. Course enrollment is self-reported, not official registration.</p>
      </> : <>
      <div className="roster-heading"><div><p className="eyebrow">COURSE CONNECTIONS</p><h2 id="recommendations-heading">People you may connect with in {selected.code}{selected.section ? ` · Section ${selected.section}` : ''}</h2></div></div>
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
            <button type="button" className="add-friend-button" aria-label={label} title={relationship === 'declined' ? 'Send friend request again' : 'Add friend'} disabled={busy} onClick={() => selected.section && onSendFriend?.(candidate.student_id, selected.code, selected.section)}>
              {busy ? <span aria-hidden="true">…</span> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4" /><path d="M2.5 21a6.5 6.5 0 0 1 13 0M19 8v8m-4-4h8" /></svg>}
              <span>{busy ? 'Sending…' : 'Add friend'}</span>
            </button>
            {onViewProfile && <button type="button" className="recommendation-profile-button" aria-label={`View profile of ${candidate.name}`} onClick={() => onViewProfile(candidate.student_id)}>View profile</button>}
          </div>
        })()}
      </li>)}</ul> : <div className="panel empty-state"><h3>No recommendations yet</h3><p className="muted">No other eligible students have saved this section.</p></div>)}
      </>}
    </section>}
  </div>
}
