import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CourseBrowser from '../src/CourseBrowser'
import { useCourseRecommendations } from '../src/useCourseRecommendations'
import type { StudentProfile } from '../src/account'
import type { RecommendationApi } from '../src/courseRecommendations'

const profile: StudentProfile = {
  id: 'caller', name: 'Caller', major: 'Computer Science', year: 'Third year', interests: ['Music'], residence_status: 'dormer', avatar_path: null,
  share_year: true, share_interests: true, share_residence_status: true,
}
const candidate = { student_id: 'peer', name: 'Peer', major: 'Computer Science', year: null, interests: null, residence_status: null, shared_courses: ['CSE 310'] }
const base = {
  enrolledCourses: [{ id: 'cse-310', code: 'CSE 310' }], selectedId: 'cse-310' as const, onSelect: vi.fn(), onAddClasses: vi.fn(), onRetry: vi.fn(), profile,
  roster: { status: 'success' as const, classmates: [{ student_id: 'roster', name: 'Roster Classmate', major: null }] },
}

describe('course recommendation dashboard', () => {
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

  it('loads by course and ignores a late response from the previous selection', async () => {
    const pending: Array<(rows: typeof candidate[]) => void> = []
    const api: RecommendationApi = vi.fn(() => new Promise(resolve => pending.push(resolve)))
    const { result, rerender } = renderHook(({ code }) => useCourseRecommendations(api, 'caller', code), { initialProps: { code: 'CSE 310' } })
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1))
    rerender({ code: 'AMS 210' })
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2))
    pending[0]([candidate])
    pending[1]([])
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.candidates).toEqual([])
  })

  it('offers a successful empty state when a course has no recommendable peers', () => {
    render(<CourseBrowser {...base} recommendations={{ status: 'success', candidates: [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recommendations' }))
    expect(screen.getByText('No recommendations yet')).toBeInTheDocument()
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
