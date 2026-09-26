export interface CourseOffering {
  id: string
  code: string
  title: string
  professor: string
  semester: 'Spring' | 'Summer' | 'Fall'
  year: number
  published: true
}

export interface CourseEvaluation {
  id: string
  offeringId: CourseOffering['id']
  weeklyHours: number
  difficulty: number
  review: string
}

export const courseOfferings: CourseOffering[] = [
  { id: 'cse-416-fall-2025-lee', code: 'CSE 416', title: 'Software Engineering', professor: 'Dr. Lee', semester: 'Fall', year: 2025, published: true },
  { id: 'cse-416-spring-2026-patel', code: 'CSE 416', title: 'Software Engineering', professor: 'Prof. Patel', semester: 'Spring', year: 2026, published: true },
  { id: 'bio-201-spring-2026-nguyen', code: 'BIO 201', title: 'Organisms to Ecosystems', professor: 'Dr. Nguyen', semester: 'Spring', year: 2026, published: true },
  { id: 'mat-210-fall-2025-roberts', code: 'MAT 210', title: 'Applied Linear Algebra', professor: 'Prof. Roberts', semester: 'Fall', year: 2025, published: true },
  { id: 'bio-201-fall-2026-kim', code: 'BIO 201', title: 'Organisms to Ecosystems', professor: 'Dr. Kim', semester: 'Fall', year: 2026, published: true },
]

export const sampleEvaluations: CourseEvaluation[] = [
  { id: 'eval-1', offeringId: 'cse-416-fall-2025-lee', weeklyHours: 12, difficulty: 4, review: 'Project work is substantial, but the team milestones make it manageable.' },
  { id: 'eval-2', offeringId: 'cse-416-fall-2025-lee', weeklyHours: 9, difficulty: 3, review: 'Useful hands-on course. Start assignments early.' },
  { id: 'eval-3', offeringId: 'cse-416-spring-2026-patel', weeklyHours: 15, difficulty: 5, review: 'The semester project takes consistent effort and the feedback is helpful.' },
  { id: 'eval-4', offeringId: 'cse-416-spring-2026-patel', weeklyHours: 11, difficulty: 4, review: 'Expect a busy project schedule, especially near demos.' },
  { id: 'eval-5', offeringId: 'bio-201-spring-2026-nguyen', weeklyHours: 7, difficulty: 3, review: 'Lectures are engaging; keep up with weekly reading.' },
  { id: 'eval-6', offeringId: 'bio-201-spring-2026-nguyen', weeklyHours: 8, difficulty: 3, review: 'Steady workload with clear expectations.' },
  { id: 'eval-7', offeringId: 'mat-210-fall-2025-roberts', weeklyHours: 10, difficulty: 4, review: 'Practice problems help a lot before exams.' },
]

if (import.meta.env.DEV && (
  courseOfferings.length !== 5
  || courseOfferings.filter(offering => offering.code === 'CSE 416').length !== 2
  || new Set(courseOfferings.map(offering => offering.id)).size !== courseOfferings.length
  || sampleEvaluations.some(evaluation => !courseOfferings.some(offering => offering.id === evaluation.offeringId))
)) {
  throw new Error('Course evaluation sample fixtures do not match the expected published offering set.')
}
