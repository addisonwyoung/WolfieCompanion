import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CourseBrowser from '../src/CourseBrowser'
import { useCourseRecommendations } from '../src/useCourseRecommendations'
import type { StudentProfile } from '../src/account'
import type { RecommendationApi } from '../src/courseRecommendations'
import type { ProfessorCatalogState } from '../src/courseProfessors'
import type { FriendRelationship } from '../src/friendshipApi'

const profile: StudentProfile = {
  id: 'caller', name: 'Caller', major: 'Computer Science', year: 'Third year', interests: ['Music'], residence_status: 'dormer', is_private:false,avatar_path: null,
  share_year: true, share_interests: true, share_residence_status: true,
}
const candidate = { student_id: 'peer', name: 'Peer', major: 'Computer Science', year: null, interests: null, residence_status: null, shared_courses: ['CSE 310'] }
const professorCatalog: ProfessorCatalogState = { status: 'success', professors: [], retry: vi.fn() }
const base = {
  enrolledCourses: [{ id: 'cse-310', code: 'CSE 310', section: '01', verificationStatus: 'verified' as const }], selectedId: 'cse-310' as const, onSelect: vi.fn(), onAddClasses: vi.fn(), onRetry: vi.fn(), profile, professorCatalog,
  roster: { status: 'success' as const, classmates: [{ student_id: 'roster', name: 'Roster Classmate', major: null }] },
}

describe('course recommendation dashboard', () => {
  it('does not show student recommendations for an unverified course', () => {
    const unverifiedCourse = { ...base.enrolledCourses[0], verificationStatus: 'rejected' }
    render(<CourseBrowser {...base} enrolledCourses={[unverifiedCourse]} recommendations={{ status: 'success', candidates: [candidate] }} />)

    expect(screen.getByRole('heading', { name: 'Course not verified' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recommendations' })).not.toBeInTheDocument()
    expect(screen.queryByText('Peer')).not.toBeInTheDocument()
  })

  it('shows accessible loading and error states without disrupting the roster', () => {
    const { rerender } = render(<CourseBrowser {...base} recommendations={{ status: 'loading', candidates: [] }} />)
    expect(screen.getByText('Roster Classmate')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Recommendations' }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading course recommendations')
    expect(screen.queryByText('Roster Classmate')).not.toBeInTheDocument()
    rerender(<CourseBrowser {...base} recommendations={{ status: 'error', candidates: [] }} onRetryRecommendations={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load course recommendations')
    expect(screen.getByRole('button', { name: 'Retry recommendations' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Classmates' }))
    expect(screen.getByText('Roster Classmate')).toBeInTheDocument()
  })

  it('shows zero points when no comparison fields are available and omits private details', () => {
    render(<CourseBrowser {...base} profile={{ ...profile, major: null }} recommendations={{ status: 'success', candidates: [{ ...candidate, major: null, shared_courses: [] }] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recommendations' }))
    expect(screen.getByText('Peer')).toBeInTheDocument()
    expect(screen.getByText('0%')).toHaveClass('recommendation-score-low')
    expect(screen.queryByText(/^Academic year:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Residence:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Interests:/)).not.toBeInTheDocument()
  })

  it('displays optional details when they are present in the public projection', () => {
    render(<CourseBrowser {...base} recommendations={{ status: 'success', candidates: [{ ...candidate, year: 'Third year', interests: ['Music'], residence_status: 'dormer' }] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recommendations' }))
    expect(screen.getByText('Things in Common:')).toBeInTheDocument()
    expect(screen.getByText('Courses: CSE 310')).toBeInTheDocument()
    expect(screen.getByText('Major: Computer Science')).toBeInTheDocument()
    expect(screen.getByText('Academic year: Third year')).toBeInTheDocument()
    expect(screen.getByText('Residence: dormer')).toBeInTheDocument()
    expect(screen.getByText('Interests: Music')).toBeInTheDocument()
  })

  it('loads by course and section and ignores late responses from previous selections', async () => {
    const pending: Array<(rows: typeof candidate[]) => void> = []
    const api: RecommendationApi = vi.fn(() => new Promise(resolve => pending.push(resolve)))
    const { result, rerender } = renderHook(({ code, section }) => useCourseRecommendations(api, 'caller', code, section, 'Ada', 'Lovelace'), { initialProps: { code: 'CSE 310', section: '01' } })
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1))
    expect(api).toHaveBeenNthCalledWith(1, 'CSE 310', '01', 'Ada', 'Lovelace', expect.any(AbortSignal))
    rerender({ code: 'CSE 310', section: '02' })
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2))
    expect(api).toHaveBeenNthCalledWith(2, 'CSE 310', '02', 'Ada', 'Lovelace', expect.any(AbortSignal))
    rerender({ code: 'AMS 210', section: '03' })
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3))
    expect(api).toHaveBeenNthCalledWith(3, 'AMS 210', '03', 'Ada', 'Lovelace', expect.any(AbortSignal))
    pending[0]([candidate])
    pending[1]([candidate])
    pending[2]([])
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.candidates).toEqual([])
  })

  it('shows different students for the same course and section when the professor changes', async () => {
    const graceCandidate = { ...candidate, student_id: 'grace-peer', name: 'Grace Professor Student' }
    const api: RecommendationApi = vi.fn(async (_code, _section, professorFirstName) => professorFirstName === 'Ada' ? [candidate] : [graceCandidate])

    function Dashboard({ professorFirstName }: { professorFirstName: string }) {
      const course = {
        id: `cse-310-section-01-${professorFirstName.toLowerCase()}`,
        code: 'CSE 310',
        section: '01',
        professorFirstName,
        professorLastName: 'Lovelace',
        verificationStatus: 'verified' as const,
      }
      const recommendations = useCourseRecommendations(api, 'caller', course.code, course.section, course.professorFirstName, course.professorLastName)
      return <CourseBrowser {...base} enrolledCourses={[course]} selectedId={course.id} recommendations={recommendations} />
    }

    const { rerender } = render(<Dashboard professorFirstName="Ada" />)
    fireEvent.click(screen.getByRole('button', { name: 'Recommendations' }))
    expect(await screen.findByText('Peer')).toBeInTheDocument()
    expect(api).toHaveBeenNthCalledWith(1, 'CSE 310', '01', 'Ada', 'Lovelace', expect.any(AbortSignal))

    rerender(<Dashboard professorFirstName="Grace" />)
    expect(await screen.findByText('Grace Professor Student')).toBeInTheDocument()
    expect(screen.queryByText('Peer')).not.toBeInTheDocument()
    expect(api).toHaveBeenNthCalledWith(2, 'CSE 310', '01', 'Grace', 'Lovelace', expect.any(AbortSignal))
  })

  it('offers a successful empty state when a course has no recommendable peers', () => {
    render(<CourseBrowser {...base} recommendations={{ status: 'success', candidates: [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recommendations' }))
    expect(screen.getByText('No recommendations yet')).toBeInTheDocument()
  })

  it('keeps pending friends in recommendations but hides accepted friends', () => {
    const accepted = { ...candidate, student_id: 'accepted', name: 'Accepted Friend' }
    const outgoing = { ...candidate, student_id: 'outgoing', name: 'Outgoing Pending Friend' }
    const incoming = { ...candidate, student_id: 'incoming', name: 'Incoming Pending Friend' }
    const relationshipById = new Map<string, FriendRelationship>([
      ['accepted', { student_id: 'accepted', relationship: 'accepted', request_id: 'accepted-request' }],
      ['outgoing', { student_id: 'outgoing', relationship: 'outgoing_pending', request_id: 'outgoing-request' }],
      ['incoming', { student_id: 'incoming', relationship: 'incoming_pending', request_id: 'incoming-request' }],
    ])
    render(<CourseBrowser {...base} relationshipById={relationshipById} recommendations={{ status: 'success', candidates: [accepted, outgoing, incoming] }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Recommendations' }))
    expect(screen.queryByText('Accepted Friend')).not.toBeInTheDocument()
    expect(screen.getByText('Outgoing Pending Friend')).toBeInTheDocument()
    expect(screen.getByText('Incoming Pending Friend')).toBeInTheDocument()
  })

  it('switches between classmates and recommendations without showing both lists', () => {
    render(<CourseBrowser {...base} recommendations={{ status: 'success', candidates: [candidate] }} />)
    expect(screen.getByText('Roster Classmate')).toBeInTheDocument()
    expect(screen.queryByText('Peer')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Recommendations' }))
    expect(screen.getByText('Peer')).toBeInTheDocument()
    expect(screen.queryByText('Roster Classmate')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Classmates' }))
    expect(screen.getByText('Roster Classmate')).toBeInTheDocument()
    expect(screen.queryByText('Peer')).not.toBeInTheDocument()
  })
})
