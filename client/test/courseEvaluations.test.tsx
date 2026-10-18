import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import CourseEvaluations from '../src/CourseEvaluations'
import { courseOfferings, summarizeEvaluations } from '../src/evaluationData'
import { DuplicateCourseReviewError } from '../src/courseReviews'
import type { CourseReviewApi } from '../src/courseReviews'
import type { CourseEvaluation } from '../src/evaluationData'

function review(id: string, offeringId = courseOfferings[0].id): CourseEvaluation {
  return { id, offeringId, weeklyHours: 8, difficulty: 3, review: 'Persisted anonymous review.' }
}
function api(overrides: Partial<CourseReviewApi> = {}) {
  return {
    loadOffering: vi.fn(async () => [review('stored-review')]),
    myOfferingIds: vi.fn(async () => []),
    submit: vi.fn(async () => [review('stored-review')]),
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

test('persists a valid submission and keeps duplicate errors on the selected offering', async () => {
  const reviews = api()
  const view = render(<CourseEvaluations api={reviews} />)
  await screen.findByText('Persisted anonymous review.')
  fireEvent.change(screen.getByLabelText('Weekly hours'), { target: { value: '6.5' } })
  fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText('Written review'), { target: { value: 'Useful workload feedback.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Publish review' }))
  await screen.findByText('Your anonymous review is saved and published for this offering.')
  expect(reviews.submit).toHaveBeenCalledWith(courseOfferings[0].id, { weeklyHours: 6.5, difficulty: 4, review: 'Useful workload feedback.' })
  view.unmount()

  const duplicateApi = api({ submit: vi.fn(async () => { throw new DuplicateCourseReviewError() }) })
  render(<CourseEvaluations api={duplicateApi} />)
  await screen.findByText('Persisted anonymous review.')
  fireEvent.change(screen.getByLabelText('Weekly hours'), { target: { value: '6' } })
  fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: '2' } })
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
  expect(screen.getAllByText(/Sample review/)).toHaveLength(2)
  expect(screen.getByLabelText('Written review')).toBeInTheDocument()
})

test('retains the review draft when persistence fails', async () => {
  const reviews = api({ submit: vi.fn(async () => { throw new Error('Save failed. Please retry.') }) })
  render(<CourseEvaluations api={reviews} />)
  await screen.findByText('Persisted anonymous review.')
  fireEvent.change(screen.getByLabelText('Weekly hours'), { target: { value: '9' } })
  fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: '5' } })
  fireEvent.change(screen.getByLabelText('Written review'), { target: { value: 'Keep this draft.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Publish review' }))
  expect(await screen.findByText('Save failed. Please retry.')).toBeInTheDocument()
  expect(screen.getByLabelText('Weekly hours')).toHaveValue(9)
  expect(screen.getByLabelText('Written review')).toHaveValue('Keep this draft.')
})
