import { afterEach, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { courseReviewApi, DuplicateCourseReviewError } from '../src/courseReviews'
import type { CourseOffering } from '../src/evaluationData'

const offering: CourseOffering = { id: 'offering-1', code: 'CSE 416', title: 'Software Engineering', professor: 'Dr. Lee', semester: 'Fall', year: 2026, section: '01', published: true }
const row = (id: string) => ({ id, offering_id: offering.id, difficulty: 4, weekly_hours: 12.5, class_rating: 5, would_recommend: true, moderation_status: 'appropriate', review: 'Anonymous text', created_at: '2026-10-17T00:00:00Z' })

function fixture(session: { access_token: string } | null = { access_token: 'test-token' }) {
  const queryCalls: { table: string; selected?: string; filters: [string, unknown][] }[] = []
  let rows: Record<string, unknown>[] = [row('review-1')]
  let offeringRows: Record<string, unknown>[] = []
  let fetchResponse: Partial<Response> = { ok: true, status: 201, json: async () => ({ moderationStatus: 'appropriate' }) }
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session }, error: null })) },
    from: vi.fn((table: string) => {
      const call = { table, filters: [] as [string, unknown][], selected: undefined as string | undefined }
      queryCalls.push(call)
      const builder = {
        select(columns: string) { call.selected = columns; return builder },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return builder },
        in(column: string, value: unknown) { call.filters.push([column, value]); return builder },
        not(column: string, operator: string, value: unknown) { call.filters.push([`${column}.${operator}`, value]); return builder },
        order() { return builder },
        then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) {
          const data = table === 'course_offerings' ? offeringRows
            : table === 'course_enrollments' ? []
              : rows.filter(item => !call.filters.some(([column, value]) => column === 'offering_id' && item.offering_id !== value))
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return builder
    }),
    rpc: vi.fn(async (name: string) => name === 'my_course_review_offerings'
      ? ({ data: [{ offering_id: offering.id }], error: null })
      : ({ data: [], error: null })),
  } as unknown as SupabaseClient
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => fetchResponse as Response)
  const api = courseReviewApi(client)
  return {
    api, client, queryCalls, fetchSpy,
    setRows(next: Record<string, unknown>[]) { rows = next },
    setOfferingRows(next: Record<string, unknown>[]) { offeringRows = next },
    setFetchResponse(next: Partial<Response>) { fetchResponse = next },
  }
}

afterEach(() => vi.restoreAllMocks())

test('loads only catalog-verified offerings with exact section and term details', async () => {
  const f = fixture()
  f.setOfferingRows([{ id: offering.id, course_code: 'CSE 416', course_number: '416', course_title: offering.title, professor_name: 'Ada Lovelace', section: '01', semester: 'Fall', academic_year: 2026, catalog_verified: true }])
  expect(await f.api.loadOfferings()).toEqual([{ ...offering, professor: 'Ada Lovelace', courseNumber: '416' }])
  expect(f.queryCalls[0].table).toBe('course_offerings')
  expect(f.queryCalls[0].filters).toContainEqual(['catalog_verified', true])
})

test('reads anonymous reviews with moderation and rating fields by stable offering ID', async () => {
  const f = fixture()
  expect(await f.api.loadOffering(offering.id)).toEqual([{ id: 'review-1', offeringId: offering.id, weeklyHours: 12.5, difficulty: 4, classRating: 5, wouldRecommend: true, moderationStatus: 'appropriate', review: 'Anonymous text', createdAt: '2026-10-17T00:00:00Z' }])
  expect(f.queryCalls[0].table).toBe('course_reviews_public')
  expect(f.queryCalls[0].selected).toContain('moderation_status')
  expect(f.queryCalls[0].selected).not.toContain('user_id')
  expect(f.queryCalls[0].selected).not.toContain('email')
})

test('submits through the authenticated moderation endpoint, then reloads persisted reviews', async () => {
  const f = fixture()
  const saved = await f.api.submit(offering.id, { weeklyHours: 7, difficulty: 3, classRating: 4, wouldRecommend: true, review: 'Good course' })
  expect(f.fetchSpy).toHaveBeenCalledWith('/api/course-reviews', expect.objectContaining({
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ offeringId: offering.id, weeklyHours: 7, difficulty: 3, classRating: 4, wouldRecommend: true, review: 'Good course' }),
  }))
  expect(saved).toEqual({ reviews: [expect.objectContaining({ id: 'review-1' })], moderationStatus: 'appropriate' })
  expect(await f.api.myOfferingIds()).toEqual([offering.id])
})

test('loads only the current user review fields through the authenticated owner endpoint', async () => {
  const f = fixture()
  f.fetchSpy.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reviews: [row('mine')] }) } as Response)
  expect(await f.api.myReviews()).toEqual([{ id: 'mine', offeringId: offering.id, weeklyHours: 12.5, difficulty: 4, classRating: 5, wouldRecommend: true, review: 'Anonymous text', moderationStatus: 'appropriate', createdAt: '2026-10-17T00:00:00Z' }])
  expect(f.fetchSpy).toHaveBeenCalledWith('/api/course-reviews/mine', { method: 'GET', headers: { Authorization: 'Bearer test-token' } })
})

test('updates an owner review with a PATCH payload and maps backend errors', async () => {
  const f = fixture()
  const savedRow = { ...row('review-id'), weekly_hours: 6, difficulty: 2, class_rating: 4, would_recommend: false, review: 'Edited', moderation_status: 'flagged' }
  f.fetchSpy.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ review: savedRow, moderationStatus: 'flagged' }) } as Response)
  const updated = await f.api.updateReview('review-id', { weeklyHours: 6, difficulty: 2, classRating: 4, wouldRecommend: false, review: 'Edited' })
  expect(updated).toMatchObject({ moderationStatus: 'flagged', review: { id: 'review-id', weeklyHours: 6, review: 'Edited', moderationStatus: 'flagged' } })
  expect(f.fetchSpy).toHaveBeenCalledWith('/api/course-reviews/review-id', expect.objectContaining({
    method: 'PATCH', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyHours: 6, difficulty: 2, classRating: 4, wouldRecommend: false, review: 'Edited' }),
  }))
  f.fetchSpy.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'Moderation unavailable' }) } as Response)
  await expect(f.api.updateReview('review-id', { weeklyHours: 6, difficulty: 2, classRating: 4, wouldRecommend: false, review: 'Edited' })).rejects.toThrow('Moderation unavailable')
})

test('deletes an owner review and requires a session for owner operations', async () => {
  const f = fixture()
  f.fetchSpy.mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) } as Response)
  await expect(f.api.deleteReview('review-id')).resolves.toBeUndefined()
  expect(f.fetchSpy).toHaveBeenCalledWith('/api/course-reviews/review-id', expect.objectContaining({ method: 'DELETE', headers: { Authorization: 'Bearer test-token' } }))
  const signedOut = fixture(null)
  signedOut.fetchSpy.mockClear()
  await expect(signedOut.api.myReviews()).rejects.toThrow('Sign in again before managing your reviews.')
  expect(signedOut.fetchSpy).not.toHaveBeenCalled()
})

test('does not send a review without a signed-in session', async () => {
  const f = fixture(null)
  await expect(f.api.submit(offering.id, { weeklyHours: 7, difficulty: 3, classRating: 4, wouldRecommend: true, review: 'Good course' }))
    .rejects.toThrow('Sign in again before publishing your review.')
  expect(f.fetchSpy).not.toHaveBeenCalled()
})

test('surfaces a network failure during review submission', async () => {
  const f = fixture()
  f.fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await expect(f.api.submit(offering.id, { weeklyHours: 7, difficulty: 3, classRating: 4, wouldRecommend: true, review: 'Good course' }))
    .rejects.toThrow('Failed to fetch')
})

test('maps API duplicate responses to the duplicate review message', async () => {
  const f = fixture()
  f.setFetchResponse({ ok: false, status: 409, json: async () => ({ error: 'Already reviewed' }) })
  await expect(f.api.submit(offering.id, { weeklyHours: 7, difficulty: 3, classRating: 4, wouldRecommend: true, review: '' }))
    .rejects.toBeInstanceOf(DuplicateCourseReviewError)
})

test('keeps a failed submission retryable and surfaces the API response', async () => {
  const f = fixture()
  f.setFetchResponse({ ok: false, status: 503, json: async () => ({ error: 'Moderation service unavailable' }) })
  await expect(f.api.submit(offering.id, { weeklyHours: 7, difficulty: 3, classRating: 4, wouldRecommend: true, review: 'Draft text' }))
    .rejects.toThrow('Moderation service unavailable')
})
