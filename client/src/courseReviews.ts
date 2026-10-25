import type { SupabaseClient } from '@supabase/supabase-js'
import type { CourseEvaluation, CourseOffering } from './evaluationData'

export interface CourseReviewInput {
  weeklyHours: number
  difficulty: number
  review: string
}

export class DuplicateCourseReviewError extends Error {
  constructor() {
    super('You have already published a review for this offering.')
    this.name = 'DuplicateCourseReviewError'
  }
}

export class CourseReviewStorageUnavailableError extends Error {
  constructor() {
    super('Course review storage is not set up yet. Your draft is still here; retry after the database migration is applied.')
    this.name = 'CourseReviewStorageUnavailableError'
  }
}

function isMissingReviewRelation(error: { code?: string } | null) {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

export function courseReviewApi(client: SupabaseClient) {
  async function loadOffering(offeringId: string): Promise<CourseEvaluation[]> {
    const { data, error } = await client.from('course_reviews_public')
      .select('id,offering_id,difficulty,weekly_hours,review,created_at')
      .eq('offering_id', offeringId)
    if (isMissingReviewRelation(error)) throw new CourseReviewStorageUnavailableError()
    if (error) throw new Error('Unable to load course reviews. Please retry.')
    return (data ?? []).map(row => ({
      id: row.id,
      offeringId: row.offering_id,
      weeklyHours: Number(row.weekly_hours),
      difficulty: row.difficulty,
      review: row.review,
    }))
  }

  return {
    async loadOfferings(): Promise<CourseOffering[]> {
      const { data, error } = await client.from('course_offerings')
        .select('id,course_code,course_number,course_title,professor_name,professor_first_name,professor_last_name,section,semester,academic_year,catalog_verified')
        .eq('catalog_verified', true)
        .order('course_code').order('semester').order('academic_year').order('section')
      if (isMissingReviewRelation(error)) throw new CourseReviewStorageUnavailableError()
      if (error) throw new Error('Unable to load course offerings. Please retry.')
      return (data ?? []).map(row => ({
        id: row.id,
        code: row.course_code,
        title: row.course_title,
        professor: row.professor_name,
        semester: row.semester,
        year: row.academic_year,
        section: row.section ?? undefined,
        courseNumber: row.course_number ?? undefined,
        published: true,
      })) as CourseOffering[]
    },
    loadOffering,
    async myOfferingIds(): Promise<string[]> {
      const { data, error } = await client.rpc('my_course_review_offerings')
      if (error) throw new Error('Unable to check your previous reviews. You can still submit; duplicates are blocked by the database.')
      return (data ?? []).map((row: { offering_id: string }) => row.offering_id)
    },
    async submit(offeringId: string, input: CourseReviewInput): Promise<CourseEvaluation[]> {
      const { error } = await client.from('course_reviews').insert({
        offering_id: offeringId,
        difficulty: input.difficulty,
        weekly_hours: input.weeklyHours,
        review: input.review,
      })
      if (error?.code === '23505') throw new DuplicateCourseReviewError()
      if (isMissingReviewRelation(error)) throw new CourseReviewStorageUnavailableError()
      if (error) throw new Error('Your review could not be saved. Your draft is still here; please retry.')
      return loadOffering(offeringId)
    },
  }
}

export type CourseReviewApi = ReturnType<typeof courseReviewApi>
