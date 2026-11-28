import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CourseBrowser from '../src/CourseBrowser'
import type { ProfessorCatalogState } from '../src/courseProfessors'

const course = { id: 'cse-310-section-01-prof-ada-lovelace', enrollmentId: 'enrollment-1', code: 'CSE 310', section: '01', professorFirstName: 'Ada', professorLastName: 'Lovelace', verificationStatus: 'verified' }
const props = {
  enrolledCourses: [course], selectedId: course.id, onSelect: vi.fn(), onAddClasses: vi.fn(),
  onRetry: vi.fn(), professorCatalog: { status: 'success', professors: [], retry: vi.fn() } as ProfessorCatalogState,
  roster: { status: 'success' as const, classmates: [] },
}

describe('dashboard course management', () => {
  it('prefills edits, validates duplicates, and selects the updated course', async () => {
    const onEditCourse = vi.fn().mockResolvedValue({ ...course, id: 'bio-201-section-01-prof-ada-lovelace', code: 'BIO 201' })
    const onSelect = vi.fn()
    render(<CourseBrowser {...props} onSelect={onSelect} onEditCourse={onEditCourse} enrolledCourses={[course, { ...course, id: 'bio-201', enrollmentId: 'enrollment-2', code: 'BIO 201' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit CSE 310' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Course Code')).toHaveValue('CSE 310')
    fireEvent.change(screen.getByLabelText('Course Code'), { target: { value: 'BIO 201' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already on your dashboard')
    expect(onEditCourse).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Course Code'), { target: { value: 'CSE 316' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(onEditCourse).toHaveBeenCalledWith('enrollment-1', { code: 'CSE 316', section: '01', professor_first_name: 'Ada', professor_last_name: 'Lovelace' }))
    expect(onSelect).toHaveBeenCalledWith('bio-201-section-01-prof-ada-lovelace')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('requires delete confirmation, keeps planner items described, and selects a remaining course', async () => {
    const onRemoveCourse = vi.fn().mockResolvedValue(undefined)
    const onSelect = vi.fn()
    render(<CourseBrowser {...props} onSelect={onSelect} onRemoveCourse={onRemoveCourse} enrolledCourses={[course, { ...course, id: 'bio-201', enrollmentId: 'enrollment-2', code: 'BIO 201' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete CSE 310' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('This will remove the course from your current dashboard and stop course access tied to this enrollment.')
    expect(onRemoveCourse).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove course' }))
    await waitFor(() => expect(onRemoveCourse).toHaveBeenCalledWith('enrollment-1'))
    expect(onSelect).toHaveBeenCalledWith('bio-201')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps the edit dialog open with a retry message when the server rejects the update', async () => {
    const onEditCourse = vi.fn().mockRejectedValue(new Error('Course could not be updated. Please retry.'))
    render(<CourseBrowser {...props} onEditCourse={onEditCourse} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit CSE 310' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Course could not be updated. Please retry.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
