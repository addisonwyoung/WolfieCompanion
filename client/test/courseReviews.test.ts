import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { courseReviewApi, DuplicateCourseReviewError } from '../src/courseReviews'
import type { CourseOffering } from '../src/evaluationData'

const offering: CourseOffering = { id: 'cse-416-fall-2025-lee', code: 'CSE 416', title: 'Software Engineering', professor: 'Dr. Lee', semester: 'Fall', year: 2025, published: true }
const sameTermOtherProfessor: CourseOffering = { ...offering, id: 'cse-416-fall-2025-patel', professor: 'Prof. Patel' }
const row = (o: CourseOffering, id: string) => ({ id, offering_id: o.id, difficulty: 4, weekly_hours: 12.5, review: 'Anonymous text', created_at: '2026-10-17T00:00:00Z' })

function fixture() {
  const queryCalls: { table: string; selected?: string; filters: [string, unknown][] }[] = []
  let rows = [row(offering, 'review-1')]
  let insertError: { code?: string } | null = null
  let inserted: Record<string, unknown> | null = null
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'course_reviews') return { insert: vi.fn(async (payload: Record<string, unknown>) => { inserted = payload; return { error: insertError } }) }
      const call = { table, filters: [] as [string, unknown][], selected: undefined as string | undefined }
      queryCalls.push(call)
      const builder = {
        select(columns: string) { call.selected = columns; return builder },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return builder },
        order() { return builder },
        then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) {
          const data = rows.filter(item => item.offering_id === call.filters[0]?.[1])
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return builder
    }),
    rpc: vi.fn(async () => ({ data: [{ offering_id: offering.id }], error: null })),
  } as unknown as SupabaseClient
  return { api: courseReviewApi(client), client, queryCalls, setRows: (next: typeof rows) => { rows = next }, setInsertError: (error: { code?: string } | null) => { insertError = error }, getInserted: () => inserted }
}

test('reads by stable offering ID and the anonymous projection without reviewer fields', async () => {
  const f = fixture()
  const result = await f.api.loadOffering(sameTermOtherProfessor.id)
  expect(result).toEqual([])
  const query = f.queryCalls[0]
  expect(query.table).toBe('course_reviews_public')
  expect(query.selected).not.toContain('user_id')
  expect(query.selected).not.toContain('email')
  expect(query.filters).toEqual([['offering_id', sameTermOtherProfessor.id]])
  f.setRows([row(sameTermOtherProfessor, 'review-2')])
  expect(await f.api.loadOffering(sameTermOtherProfessor.id)).toEqual([{ id: 'review-2', offeringId: sameTermOtherProfessor.id, weeklyHours: 12.5, difficulty: 4, review: 'Anonymous text' }])
})

test('submits only offering ID and review fields, leaving identity and generated columns to the database', async () => {
  const f = fixture()
  await f.api.submit(offering.id, { weeklyHours: 7, difficulty: 3, review: 'Good course' })
  expect(f.getInserted()).toEqual({ offering_id: offering.id, difficulty: 3, weekly_hours: 7, review: 'Good course' })
  expect(f.getInserted()).not.toHaveProperty('user_id')
  expect(await f.api.myOfferingIds()).toEqual([offering.id])
  f.setInsertError({ code: '23505' })
  await expect(f.api.submit(offering.id, { weeklyHours: 7, difficulty: 3, review: '' })).rejects.toBeInstanceOf(DuplicateCourseReviewError)
})

test('invalid offering IDs are rejected by the database foreign key and drafts can be retried', async () => {
  const f = fixture()
  f.setInsertError({ code: '23503' })
  await expect(f.api.submit('missing-offering', { weeklyHours: 7, difficulty: 3, review: 'Draft remains in form' }))
    .rejects.toThrow('Your review could not be saved')
  expect(f.getInserted()).toEqual({ offering_id: 'missing-offering', difficulty: 3, weekly_hours: 7, review: 'Draft remains in form' })
})

test('explains that review storage migration is pending without discarding the submission', async () => {
  const f = fixture()
  f.setInsertError({ code: 'PGRST205' })
  await expect(f.api.submit(offering.id, { weeklyHours: 7, difficulty: 3, review: 'Saved draft text' }))
    .rejects.toThrow(/migration is applied/)
  expect(f.getInserted()).toEqual({ offering_id: offering.id, difficulty: 3, weekly_hours: 7, review: 'Saved draft text' })
})
