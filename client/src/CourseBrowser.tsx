import { courses, getClassmates } from './sampleData'
import type { CourseId, Student } from './sampleData'
import { Avatar, Interests } from './Profile'

export default function CourseBrowser({ selectedId, onSelect, students, currentUserId }: {
  selectedId: CourseId
  onSelect: (id: CourseId) => void
  students: Student[]
  currentUserId: string
}) {
  const selected = courses.find(course => course.id === selectedId)!
  const classmates = getClassmates(students, selectedId, currentUserId)
  return <div className="course-browser">
    <section className="panel courses" aria-labelledby="courses-heading">
      <div className="section-top"><h2 id="courses-heading">Your courses</h2><span className="muted">4 sample courses</span></div>
      <p className="muted">Pick a course to see who’s learning alongside you.</p>
      <div className="course-controls">{courses.map(course => <button key={course.id} aria-pressed={selectedId === course.id} onClick={() => onSelect(course.id)}>
        <span className="course-symbol" aria-hidden="true">{course.code.startsWith('CSE') ? '</>' : '∑'}</span>
        <strong>{course.code}</strong><span className="course-state">{selectedId === course.id ? 'Selected ✓' : 'View classmates'}</span>
      </button>)}</div>
    </section>
    <section className="classmates" aria-labelledby="classmates-heading">
      <div className="roster-heading" aria-live="polite" aria-atomic="true"><div><p className="eyebrow">FAMILIAR FACES, NEW CONNECTIONS</p><h2 id="classmates-heading">Classmates in {selected.code}</h2></div><span className="count">{classmates.length} {classmates.length === 1 ? 'classmate' : 'classmates'}</span></div>
      {classmates.length ? <ul className="roster">{classmates.map(student => <li key={student.id} className="panel student-card">
        <div className="student-identity"><Avatar name={student.name} /><div><h3>{student.name}</h3><p className="muted">{student.year}</p></div></div>
        <p className="student-major">{student.major}</p><h4>Interests</h4><Interests interests={student.interests} />
      </li>)}</ul> : <div className="panel empty-state"><h3>No classmates yet</h3><p className="muted">There are no other sample students in this course. Try another course.</p></div>}
      <p className="roster-note">All profiles and enrollments shown here are fictional.</p>
    </section>
  </div>
}
