import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import CourseEvaluations from '../src/CourseEvaluations'
import { courseOfferings, summarizeEvaluations } from '../src/evaluationData'
import { DuplicateCourseReviewError } from '../src/courseReviews'
import type { CourseReviewApi } from '../src/courseReviews'
import type { CourseEvaluation, CourseOffering } from '../src/evaluationData'

function review(id: string, offeringId = courseOfferings[0].id): CourseEvaluation {
  return { id, offeringId, weeklyHours: 8, difficulty: 3, review: 'Persisted anonymous review.', classRating: 4, wouldRecommend: true }
}
function api(overrides: Partial<CourseReviewApi> = {}) {
  return {
    loadOfferings: vi.fn(async () => courseOfferings),
    loadOffering: vi.fn(async () => [review('stored-review')]),
    myOfferingIds: vi.fn(async () => []),
    myCurrentOfferingIds: vi.fn(async () => [courseOfferings[0].id]),
    myVerifiedOfferingIds: vi.fn(async () => courseOfferings.map(item => item.id)),
    submit: vi.fn(async () => ({ reviews: [review('stored-review')], moderationStatus: 'appropriate' as const })),
    ...overrides,
  } as unknown as CourseReviewApi
}

test('loads persisted anonymous reviews and selects offering-specific review keys', async () => {
  const reviews = api()
  render(<CourseEvaluations api={reviews} />)
  expect(await screen.findByText('Persisted anonymous review.')).toBeInTheDocument()
  expect(reviews.loadOffering).toHaveBeenCalledWith(courseOfferings[0].id)
  expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Student A|reviewer@example\.com|00000000-0000-0000/i)).not.toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Course offering'), { target: { value: courseOfferings[1].id } })
  await waitFor(() => expect(reviews.loadOffering).toHaveBeenCalledWith(courseOfferings[1].id))
})

test('shows the calculated average class rating for the selected offering', async () => {
  const reviews = api({
    loadOffering: vi.fn(async () => [
      { ...review('one'), classRating: 3 },
      { ...review('two'), classRating: 5 },
    ]),
  })
  render(<CourseEvaluations api={reviews} />)

  const averageLabel = await screen.findByText('average class rating')
  expect(averageLabel.parentElement).toHaveTextContent('4.0 / 5')
})

test('shows when the current user has already published a review for the offering', async () => {
  const reviews = api({ myOfferingIds: vi.fn(async () => [courseOfferings[0].id]) })
  render(<CourseEvaluations api={reviews} />)

  expect(await screen.findByText('You’ve already published a review for this offering. Reading reviews remains available.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Publish review' })).not.toBeInTheDocument()
})

test('allows review submission only for the exact enrolled course offering', async () => {
  const enrolled: CourseOffering = { ...courseOfferings[0], id: 'cse-416-fall-2026-lee-section-01', professor: 'Dr. Lee', section: '01', semester: 'Fall', year: 2026 }
  const otherSection: CourseOffering = { ...enrolled, id: 'cse-416-fall-2026-lee-section-02', section: '02' }
  const otherTerm: CourseOffering = { ...enrolled, id: 'cse-416-spring-2026-lee-section-01', semester: 'Spring', year: 2026 }
  const otherYear: CourseOffering = { ...enrolled, id: 'cse-416-fall-2025-lee-section-01', year: 2025 }
  const otherCourse: CourseOffering = { ...courseOfferings[2], id: 'bio-201-fall-2026-kim-section-01', professor: 'Dr. Kim', section: '01', semester: 'Fall', year: 2026 }
  const submit = vi.fn(async () => ({ reviews: [review('saved')], moderationStatus: 'appropriate' as const }))
  const reviews = api({
    loadOfferings: vi.fn(async () => [enrolled, otherSection, otherTerm, otherYear, otherCourse]),
    myCurrentOfferingIds: vi.fn(async () => [enrolled.id]),
    myVerifiedOfferingIds: vi.fn(async () => [enrolled.id]),
    submit,
  })
  render(<CourseEvaluations api={reviews} />)

  expect(await screen.findByRole('button', { name: 'Publish review' })).toBeInTheDocument()
  for (const offeringName of [/Section 02/, /Spring 2026/, /Fall 2025/, /BIO 201/]) {
    fireEvent.click(screen.getByRole('button', { name: offeringName }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Write an anonymous review' })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Publish review' })).not.toBeInTheDocument()
  }
  expect(submit).not.toHaveBeenCalled()
})

test('does not offer review submission for an unverified course offering', async () => {
  const submit = vi.fn(async () => ({ reviews: [review('saved')], moderationStatus: 'appropriate' as const }))
  const reviews = api({ myCurrentOfferingIds: vi.fn(async () => []), myVerifiedOfferingIds: vi.fn(async () => []), submit })
  render(<CourseEvaluations api={reviews} />)

  expect(await screen.findByText('Persisted anonymous review.')).toBeInTheDocument()
  expect(reviews.myVerifiedOfferingIds).toHaveBeenCalledOnce()
  expect(screen.queryByRole('heading', { name: 'Write an anonymous review' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Publish review' })).not.toBeInTheDocument()
  expect(submit).not.toHaveBeenCalled()
})

test('does not display reviewer names, emails, or account identifiers', async () => {
  const anonymousReview = {
    ...review('anonymous'),
    reviewer_name: 'Private Reviewer Name',
    email: 'private-reviewer@example.com',
    user_id: 'private-account-123',
  }
  const reviews = api({ loadOffering: vi.fn(async () => [anonymousReview]) })
  render(<CourseEvaluations api={reviews} />)

  expect(await screen.findByText('Persisted anonymous review.')).toBeInTheDocument()
  expect(screen.queryByText(/Private Reviewer Name|private-reviewer@example\.com|private-account-123/)).not.toBeInTheDocument()
})

test('persists a valid submission and keeps duplicate errors on the selected offering', async () => {
  const reviews = api()
  const view = render(<CourseEvaluations api={reviews} />)
  await screen.findByText('Persisted anonymous review.')
  fireEvent.change(screen.getByLabelText('Weekly hours'), { target: { value: '6.5' } })
  fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText('Class rating'), { target: { value: '4' } })
  fireEvent.click(screen.getByLabelText('Yes'))
  fireEvent.change(screen.getByLabelText('Written review'), { target: { value: 'Useful workload feedback.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Publish review' }))
  await screen.findByText('Your anonymous review is saved and published for this offering.')
  expect(reviews.submit).toHaveBeenCalledWith(courseOfferings[0].id, { weeklyHours: 6.5, difficulty: 4, classRating: 4, wouldRecommend: true, review: 'Useful workload feedback.' })
  view.unmount()

  const duplicateApi = api({ submit: vi.fn(async () => { throw new DuplicateCourseReviewError() }) })
  render(<CourseEvaluations api={duplicateApi} />)
  await screen.findByText('Persisted anonymous review.')
  fireEvent.change(screen.getByLabelText('Weekly hours'), { target: { value: '6' } })
  fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Class rating'), { target: { value: '3' } })
  fireEvent.click(screen.getByLabelText('No'))
  fireEvent.click(screen.getByRole('button', { name: 'Publish review' }))
  await screen.findByText('You have already published a review for this offering.')
  expect(screen.getByText(/already published a review for this offering. Reading reviews remains available/)).toBeInTheDocument()
})

test('calculates average difficulty and weekly hours from individual review ratings', () => {
  expect(summarizeEvaluations([
    review('one'),
    { ...review('two'), weeklyHours: 12, difficulty: 5 },
  ])).toEqual({ hours: 10, difficulty: 4, count: 2 })
  expect(summarizeEvaluations([])).toBeNull()
})

test('distinguishes review loading failures from no reviews', async () => {
  const reviews = api({ loadOffering: vi.fn(async () => { throw new Error('down') }) })
  render(<CourseEvaluations api={reviews} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Saved course reviews could not be loaded')
  expect(screen.getByLabelText('Course offering')).toHaveValue(courseOfferings[0].id)
  expect(screen.queryByText(/Sample review/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Written review')).toBeInTheDocument()
})

test('retains the review draft when persistence fails', async () => {
  const reviews = api({ submit: vi.fn(async () => { throw new Error('Save failed. Please retry.') }) })
  render(<CourseEvaluations api={reviews} />)
  await screen.findByText('Persisted anonymous review.')
  fireEvent.change(screen.getByLabelText('Weekly hours'), { target: { value: '9' } })
  fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: '5' } })
  fireEvent.change(screen.getByLabelText('Class rating'), { target: { value: '5' } })
  fireEvent.click(screen.getByLabelText('Yes'))
  fireEvent.change(screen.getByLabelText('Written review'), { target: { value: 'Keep this draft.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Publish review' }))
  expect(await screen.findByText('Save failed. Please retry.')).toBeInTheDocument()
  expect(screen.getByLabelText('Weekly hours')).toHaveValue(9)
  expect(screen.getByLabelText('Written review')).toHaveValue('Keep this draft.')
})
