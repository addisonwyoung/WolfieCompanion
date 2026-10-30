import type { SupabaseClient } from '@supabase/supabase-js'
import type { StudentProfile } from './account'

export interface CourseRecommendation {
  student_id: string
  name: string
  major: string | null
  year: string | null
  interests: string[] | null
  residence_status: 'commuter' | 'dormer' | null
  shared_courses: string[]
}

export interface RankedRecommendation extends CourseRecommendation {
  score: number
  sharedCourses: string[]
  sharedMajor: string | null
  sharedInterests: string[] | null
  sharedYear: string | null
  sharedResidenceStatus: 'commuter' | 'dormer' | null
}

export type RecommendationApi = (courseCode: string, section: string, signal: AbortSignal) => Promise<CourseRecommendation[]>
export const recommendationError = 'Unable to load course recommendations. Please retry.'

function parseRecommendation(value: unknown): CourseRecommendation {
  if (!value || typeof value !== 'object') throw new Error(recommendationError)
  const row = value as Record<string, unknown>
  if (typeof row.student_id !== 'string' || !row.student_id || typeof row.name !== 'string' || !row.name.trim()
    || !(row.major === null || typeof row.major === 'string')
    || !(row.year === null || typeof row.year === 'string')
    || !(row.interests === null || (Array.isArray(row.interests) && row.interests.every(item => typeof item === 'string' && item.trim().length > 0 && item.length <= 50)))
    || !(row.residence_status === null || row.residence_status === 'commuter' || row.residence_status === 'dormer')
    || !Array.isArray(row.shared_courses) || row.shared_courses.some(item => typeof item !== 'string' || !/^[A-Z]{2,4} [0-9]{3}$/.test(item))) {
    throw new Error(recommendationError)
  }
  return {
    student_id: row.student_id,
    name: row.name,
    major: row.major,
    year: row.year,
    interests: row.interests as string[] | null,
    residence_status: row.residence_status,
    shared_courses: [...new Set(row.shared_courses as string[])],
  }
}

export function parseRecommendations(data: unknown): CourseRecommendation[] {
  if (!Array.isArray(data)) throw new Error(recommendationError)
  const seen = new Set<string>()
  return data.map(parseRecommendation).filter(candidate => {
    if (seen.has(candidate.student_id)) return false
    seen.add(candidate.student_id)
    return true
  })
}

export function courseRecommendationApi(client: SupabaseClient): RecommendationApi {
  return async (courseCode, section, signal) => {
    try {
      const { data, error } = await client.rpc('course_recommendation_profiles', { p_course_code: courseCode, p_section: section }).abortSignal(signal)
      if (error) throw new Error(recommendationError)
      return parseRecommendations(data)
    } catch {
      throw new Error(recommendationError)
    }
  }
}

function normalize(value: string): string { return value.trim().toLowerCase() }
function usable(value: string | null | undefined): value is string { return typeof value === 'string' && value.trim().length > 0 }

export function rankRecommendations(profile: StudentProfile, candidates: CourseRecommendation[]): RankedRecommendation[] {
  const ownYear = profile.share_year ? profile.year : null
  const ownInterests = profile.share_interests ? profile.interests : null
  const ownResidence = profile.share_residence_status ? profile.residence_status : null

  const ranked = candidates.map(candidate => {
    let points = 0
    let sharedMajor: string | null = null
    let sharedInterests: string[] | null = null
    let sharedYear: string | null = null
    let sharedResidenceStatus: 'commuter' | 'dormer' | null = null

    if (usable(profile.major) && usable(candidate.major)) {
      if (normalize(profile.major) === normalize(candidate.major)) { points += 25; sharedMajor = candidate.major }
    }
    if (ownInterests !== null && candidate.interests !== null) {
      const ownByKey = new Map(ownInterests.map(value => [normalize(value), value]))
      const peerByKey = new Map(candidate.interests.map(value => [normalize(value), value]))
      const sharedKeys = [...ownByKey.keys()].filter(key => peerByKey.has(key)).sort()
      sharedInterests = sharedKeys.map(key => ownByKey.get(key)!)
      points += Math.min(sharedKeys.length * 6, 30)
    }
    points += Math.min(candidate.shared_courses.length * 5, 25)
    if (usable(ownYear) && usable(candidate.year)) {
      if (normalize(ownYear) === normalize(candidate.year)) { points += 10; sharedYear = candidate.year }
    }
    if (usable(ownResidence) && usable(candidate.residence_status)) {
      if (normalize(ownResidence) === normalize(candidate.residence_status)) { points += 10; sharedResidenceStatus = candidate.residence_status }
    }

    return { ...candidate, score: points, sharedCourses: candidate.shared_courses, sharedMajor, sharedInterests, sharedYear, sharedResidenceStatus }
  })
  return ranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    return a.name.localeCompare(b.name) || a.student_id.localeCompare(b.student_id)
  })
}
