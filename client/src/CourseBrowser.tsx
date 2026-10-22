import ManualClasses from './ManualClasses'
import ScheduleImportPreview from './ScheduleImportPreview'
import type { CourseId, Course } from './sampleData'
import type { ClassmateState } from './useClassmates'

export default function CourseBrowser({ enrolledCourses, onAddClasses, selectedId, onSelect, roster, onRetry, onViewProfile }: {
  enrolledCourses: Course[]
  onAddClasses: (rows: { code: string; section: string }[]) => Promise<void>
  selectedId: CourseId | null
  onSelect: (id: CourseId) => void
  roster: ClassmateState
  onViewProfile?: (id: string) => void
  onRetry: () => void
}) {
  const selected = enrolledCourses.find(course => course.id === selectedId)
  const { classmates } = roster
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
    {selected && <section className="classmates" aria-labelledby="classmates-heading">
      <div className="roster-heading" aria-live="polite" aria-atomic="true"><div><p className="eyebrow">SHARED COURSES</p><h2 id="classmates-heading">Classmates in {selected.code}</h2></div>{roster.status === 'success' && <span className="count">{classmates.length} {classmates.length === 1 ? 'classmate' : 'classmates'}</span>}</div>
      {roster.status === 'loading' && <p role="status">Loading classmates…</p>}
      {roster.status === 'error' && <div className="panel empty-state"><p role="alert">Unable to load classmates. Please retry.</p><button onClick={onRetry}>Retry classmates</button></div>}
      {roster.status === 'success' && (classmates.length ? <ul className="roster">{classmates.map(student => <li key={student.student_id} className="panel student-card">
        <h3>{student.name}</h3>{onViewProfile && <button onClick={() => onViewProfile(student.student_id)} aria-label={`View profile of ${student.name}`}>View profile</button>}<p className="student-major">{student.major ?? 'Major not added'}</p>
      </li>)}</ul> : <div className="panel empty-state"><h3>No classmates yet</h3><p className="muted">No other students have saved this course yet.</p></div>)}
      <p className="roster-note">Your name and major are visible to eligible students sharing a saved course. You choose whether to share your year, interests, residence status, and picture in Edit profile. Optional details stay private until shared. Courses are self-reported; matching does not verify semesters or official enrollment.</p>
    </section>}
  </div>
}
