import { useState } from 'react'
import ManualClasses from './ManualClasses'
import ScheduleImportPreview from './ScheduleImportPreview'
import type { CourseId, Course } from './sampleData'
import type { ClassmateState } from './useClassmates'
import type { StudentProfile } from './account'
import { rankRecommendations } from './courseRecommendations'
import type { RankedRecommendation } from './courseRecommendations'
import type { RecommendationState } from './useCourseRecommendations'
import type { FriendRelationship, FriendStudent } from './friendshipApi'
import type { LoadState } from './useFriendships'

export default function CourseBrowser({ enrolledCourses, onAddClasses, selectedId, onSelect, roster, onRetry, onViewProfile, profile, recommendations, onRetryRecommendations, relationshipById = new Map(), friendActionBusy = new Set(), onSendFriend, onOpenFriendRequests, friends, onRetryFriends, onViewFriend }: {
  enrolledCourses: Course[]
  onAddClasses: (rows: { code: string; section: string }[]) => Promise<void>
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
  onSendFriend?: (student: string, course: string) => void
  onOpenFriendRequests?: () => void
  friends?: LoadState<FriendStudent>
  onRetryFriends?: () => void
  onViewFriend?: (student: string) => void
}) {
  const [activeList, setActiveList] = useState<'classmates' | 'recommendations'>('classmates')
  const selected = enrolledCourses.find(course => course.id === selectedId)
  const { classmates } = roster
  const rankedRecommendations: RankedRecommendation[] = recommendations?.status === 'success' && profile
    ? rankRecommendations(profile, recommendations.candidates)
    : []
  return <div className="course-browser">
    <section className="panel courses" aria-labelledby="courses-heading">
      <div className="section-top"><h2 id="courses-heading">Your courses</h2><span className="muted">{enrolledCourses.length} {enrolledCourses.length === 1 ? 'course' : 'courses'}</span></div>
      <p className="muted">Pick a course to see who’s learning alongside you.</p>
      <ManualClasses onSave={onAddClasses} />
      <ScheduleImportPreview onAddClasses={onAddClasses} />
      {!enrolledCourses.length && <p className="empty-state">No saved classes yet. Enter classes manually or confirm a reviewed schedule.</p>}
      <div className="course-controls">{enrolledCourses.map(course => <button key={course.id} aria-pressed={selectedId === course.id} onClick={() => onSelect(course.id)}>
        <span className="course-symbol" aria-hidden="true">{course.code.startsWith('CSE') ? '</>' : '∑'}</span>
        <strong>{course.code}</strong>{!!course.sections?.length && <span className="course-state">Section {course.sections.join(', ')}</span>}<span className="course-state">{selectedId === course.id ? 'Selected ✓' : 'View classmates'}</span>
      </button>)}</div>
    </section>
    {selected && <section className="classmates" aria-label={`${selected.code} student lists`}>
      {recommendations && <div className="course-list-switcher" role="group" aria-label={`${selected.code} people lists`}>
        <button type="button" aria-pressed={activeList === 'classmates'} onClick={() => setActiveList('classmates')}>Classmates</button>
        <button type="button" aria-pressed={activeList === 'recommendations'} onClick={() => setActiveList('recommendations')}>People you may connect with</button>
      </div>}
      {activeList === 'classmates' || !recommendations ? <>
      <div className="roster-heading" aria-live="polite" aria-atomic="true"><div><p className="eyebrow">SHARED COURSES</p><h2 id="classmates-heading">Classmates in {selected.code}</h2></div>{roster.status === 'success' && <span className="count">{classmates.length} {classmates.length === 1 ? 'classmate' : 'classmates'}</span>}</div>
      {roster.status === 'loading' && <p role="status">Loading classmates…</p>}
      {roster.status === 'error' && <div className="panel empty-state"><p role="alert">Unable to load classmates. Please retry.</p><button onClick={onRetry}>Retry classmates</button></div>}
      {roster.status === 'success' && (classmates.length ? <ul className="roster">{classmates.map(student => <li key={student.student_id} className="panel student-card">
        <h3>{student.name}</h3>{onViewProfile && <button onClick={() => onViewProfile(student.student_id)} aria-label={`View profile of ${student.name}`}>View profile</button>}<p className="student-major">{student.major ?? 'Major not added'}</p>
      </li>)}</ul> : <div className="panel empty-state"><h3>No classmates yet</h3><p className="muted">No other students have saved this course yet.</p></div>)}
      <p className="roster-note">Your name and major are visible to eligible students sharing a saved course. You choose whether to share your year, interests, residence status, and picture in Edit profile. Optional details stay private until shared. Courses are self-reported; matching does not verify semesters or official enrollment.</p>
      </> : <>
      <div className="roster-heading"><div><p className="eyebrow">COURSE CONNECTIONS</p><h2 id="recommendations-heading">People you may connect with in {selected.code}</h2></div></div>
      {recommendations.status === 'loading' && <p role="status">Loading course recommendations…</p>}
      {recommendations.status === 'error' && <div className="panel empty-state"><p role="alert">Unable to load course recommendations. Please retry.</p><button onClick={onRetryRecommendations}>Retry recommendations</button></div>}
      {recommendations.status === 'success' && (rankedRecommendations.length ? <ul className="recommendation-list">{rankedRecommendations.map(candidate => <li key={candidate.student_id} className="panel recommendation-card">
        <div className="recommendation-title"><h3>{candidate.name}</h3><span className="count">{candidate.score}/100</span></div>
        <p className="student-major">{candidate.major?.trim() || 'Major not added'}</p>
        {candidate.year && <p className="recommendation-detail">Academic year: {candidate.year}</p>}
        {candidate.residence_status && <p className="recommendation-detail">Residence: {candidate.residence_status}</p>}
        {candidate.sharedInterests !== null && <p className="recommendation-detail">Shared interests: {candidate.sharedInterests.length ? candidate.sharedInterests.join(', ') : 'None in common'}</p>}
        {(() => {
          const relationship = relationshipById.get(candidate.student_id)?.relationship ?? 'none'
          const busy = friendActionBusy.has(candidate.student_id)
          if (relationship === 'outgoing_pending') return <p role="status" className="friend-status">Friend request sent</p>
          if (relationship === 'incoming_pending') return <button type="button" onClick={onOpenFriendRequests}>Respond to friend request</button>
          if (relationship === 'accepted') return <p role="status" className="friend-status">Friends</p>
          return <button type="button" disabled={busy} onClick={() => onSendFriend?.(candidate.student_id, selected.code)}>{busy ? 'Sending…' : relationship === 'declined' ? 'Send friend request again' : 'Add friend'}</button>
        })()}
      </li>)}</ul> : <div className="panel empty-state"><h3>No recommendations yet</h3><p className="muted">No other eligible students have saved this course.</p></div>)}
      </>}
      {friends && <section className="friends-in-course" aria-labelledby="friends-in-course-heading">
        <div className="roster-heading"><div><p className="eyebrow">YOUR CONNECTIONS</p><h2 id="friends-in-course-heading">Friends in this Class</h2></div>{friends.status === 'success' && <span className="count">{friends.data.length}</span>}</div>
        {friends.status === 'loading' && <p role="status">Loading friends in this class…</p>}
        {friends.status === 'error' && <div className="panel empty-state"><p role="alert">Unable to load friends in this class.</p><button type="button" onClick={onRetryFriends}>Retry friends</button></div>}
        {friends.status === 'success' && (friends.data.length ? <ul className="friend-course-list">{friends.data.map(friend => <li className="panel student-card" key={friend.student_id}><h3>{friend.name}</h3><p className="student-major">{friend.major?.trim() || 'Major not added'}</p>{'year' in friend && friend.year && <p className="recommendation-detail">Academic year: {friend.year}</p>}<button type="button" aria-label={`View profile of ${friend.name}`} onClick={() => onViewFriend?.(friend.student_id)}>View profile</button></li>)}</ul> : <div className="panel empty-state"><h3>No friends in this class yet</h3><p className="muted">Accepted friends who saved {selected.code} will appear here.</p></div>)}
      </section>}
    </section>}
  </div>
}
