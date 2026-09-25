// All people and enrollments in this module are fictional demo data.
export const years = ['First year', 'Second year', 'Third year', 'Fourth year', 'Graduate'] as const
export type Year = typeof years[number]
export type CourseId = 'cse-416' | 'cse-310' | 'ams-210' | 'ams-261'
export interface Course { id: CourseId; code: string }
export interface Student {
  id: string
  name: string
  major: string
  year: Year
  interests: string[]
  courseIds: CourseId[]
}
export const courses: Course[] = [
  { id: 'cse-416', code: 'CSE 416' },
  { id: 'cse-310', code: 'CSE 310' },
  { id: 'ams-210', code: 'AMS 210' },
  { id: 'ams-261', code: 'AMS 261' },
]
export const sampleProfile: Student = {
  id: 'alex', name: 'Alex Morgan', major: 'Computer Science', year: 'Third year',
  interests: ['Web development', 'Hiking', 'Board games'],
  courseIds: courses.map(course => course.id),
}
export const students: Student[] = [
  sampleProfile,
  { id: 'maya', name: 'Maya Chen', major: 'Computer Science', year: 'Third year', interests: ['Design', 'Photography'], courseIds: ['cse-416', 'ams-210'] },
  { id: 'jordan', name: 'Jordan Ellis', major: 'Computer Science', year: 'Fourth year', interests: ['Robotics', 'Board games'], courseIds: ['cse-416', 'cse-310'] },
  { id: 'sam', name: 'Sam Rivera', major: 'Applied Mathematics', year: 'Third year', interests: ['Hiking', 'Data visualization'], courseIds: ['cse-416', 'ams-261'] },
  { id: 'priya', name: 'Priya Shah', major: 'Computer Engineering', year: 'Second year', interests: ['Networks', 'Music'], courseIds: ['cse-310', 'ams-261'] },
  { id: 'leo', name: 'Leo Brooks', major: 'Applied Mathematics', year: 'Second year', interests: ['Puzzles', 'Cooking'], courseIds: ['ams-210', 'ams-261'] },
  { id: 'avery', name: 'Avery Park', major: 'Computer Science', year: 'Third year', interests: ['Cybersecurity', 'Running'], courseIds: ['cse-310', 'ams-210'] },
]
export function getClassmates(roster: Student[], courseId: CourseId, currentUserId: string) {
  const seen = new Set<string>()
  return roster.filter(student => {
    if (student.id === currentUserId || !student.courseIds.includes(courseId) || seen.has(student.id)) return false
    seen.add(student.id)
    return true
  })
}
