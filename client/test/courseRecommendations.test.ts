import { describe, expect, it } from 'vitest'
import { courseRecommendationApi, parseRecommendations, rankRecommendations, recommendationError } from '../src/courseRecommendations'
import type { StudentProfile } from '../src/account'
import type { SupabaseClient } from '@supabase/supabase-js'

const profile = (overrides: Partial<StudentProfile> = {}): StudentProfile => ({
  id: 'caller', name: 'Caller', major: 'Computer Science', year: 'Third year', interests: ['Music', 'Hiking'], residence_status: 'dormer', avatar_path: null,
  share_year: true, share_interests: true, share_residence_status: true, ...overrides,
})
const candidate = (overrides: Record<string, unknown> = {}) => ({
  student_id: 'peer', name: 'Peer', major: 'Computer Science', year: 'Third year', interests: ['Music', 'Hiking'], residence_status: 'commuter', ...overrides,
})

describe('course recommendations', () => {
  it('parses the allowlisted projection and removes duplicate student rows', () => {
    const rows = parseRecommendations([candidate(), candidate({ name: 'Duplicate' })])
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Peer')
  })

  it('rejects malformed RPC values', () => {
    expect(() => parseRecommendations({})).toThrow('Unable to load course recommendations. Please retry.')
    expect(() => parseRecommendations([candidate({ interests: ['ok', 2] })])).toThrow()
  })

  it('hides raw RPC errors behind the safe recommendation message', async () => {
    const client = { rpc: () => ({ abortSignal: async () => ({ data: null, error: { message: 'private database detail' } }) }) } as unknown as SupabaseClient
    await expect(courseRecommendationApi(client)('CSE 310', new AbortController().signal)).rejects.toThrow(recommendationError)
    await expect(courseRecommendationApi(client)('CSE 310', new AbortController().signal)).rejects.not.toThrow('private database detail')
  })

  it('awards 30/8/15/15 points against a fixed 100-point scale', () => {
    const result = rankRecommendations(profile(), [candidate()])[0]
    expect(result.score).toBe(61) // 30 + 16 + 15 of 100 available (residence mismatch)
    expect(result.sharedInterests).toEqual(['Hiking', 'Music'])
    expect(rankRecommendations(profile({ share_year: false, share_residence_status: false }), [candidate({ interests: ['music'] })])[0].score).toBe(38)
  })

  it('caps distinct shared interests at 40 and ignores duplicate/case variants', () => {
    const interests = ['A', 'B', 'C', 'D', 'E', 'a', ' B ']
    const result = rankRecommendations(profile({ major: null, year: null, residence_status: null, interests }), [candidate({ major: null, year: null, residence_status: null, interests: ['a', 'b', 'c', 'd', 'e', 'E'] })])[0]
    expect(result.score).toBe(40)
    expect(result.sharedInterests).toHaveLength(5)
  })

  it('awards no points for empty, nonmatching, private, or unavailable factors', () => {
    const empty = rankRecommendations(profile({ major: null, year: null, residence_status: null, interests: [] }), [candidate({ major: null, year: null, residence_status: null, interests: [] })])[0]
    expect(empty.score).toBe(0)
    expect(empty.sharedInterests).toEqual([])
    const noMatch = rankRecommendations(profile({ major: null, year: null, residence_status: null, interests: ['Music'] }), [candidate({ major: null, year: null, residence_status: null, interests: ['Cooking'] })])[0]
    expect(noMatch.score).toBe(0)
    expect(noMatch.sharedInterests).toEqual([])
    const hidden = rankRecommendations(profile({ major: null, year: null, residence_status: null, share_interests: false }), [candidate({ major: null, year: 'Third year', interests: ['Music'], residence_status: 'dormer' })])[0]
    expect(hidden.score).toBe(0)
    expect(hidden.sharedInterests).toBeNull()
  })

  it('treats missing values as zero-point factors and sorts ties deterministically', () => {
    const ranked = rankRecommendations(profile({ major: null, share_year: false, share_interests: false, share_residence_status: false }), [
      candidate({ student_id: 'z', name: 'Zed', major: null, year: null, interests: null, residence_status: null }),
      candidate({ student_id: 'b', name: 'Bea', major: null, year: null, interests: null, residence_status: null }),
      candidate({ student_id: 'a', name: 'Ari', major: null, year: null, interests: null, residence_status: null }),
    ])
    expect(ranked.map(row => row.name)).toEqual(['Ari', 'Bea', 'Zed'])
    expect(ranked.every(row => row.score === 0)).toBe(true)
  })
})
