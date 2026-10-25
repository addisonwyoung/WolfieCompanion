import type { SupabaseClient } from '@supabase/supabase-js'
import type { CourseEvaluation, CourseOffering } from './evaluationData'

export interface CourseReviewInput {
  weeklyHours: number
  difficulty: number
  classRating: number
  wouldRecommend: boolean
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
      .select('id,offering_id,difficulty,weekly_hours,class_rating,would_recommend,review,created_at')
      .eq('offering_id', offeringId)
    if (isMissingReviewRelation(error)) throw new CourseReviewStorageUnavailableError()
    if (error) throw new Error('Unable to load course reviews. Please retry.')
    return (data ?? []).map(row => ({
      id: row.id,
      offeringId: row.offering_id,
      weeklyHours: Number(row.weekly_hours),
      difficulty: row.difficulty,
      review: row.review,
      classRating: row.class_rating === null ? null : Number(row.class_rating),
      wouldRecommend: row.would_recommend,
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
      if (error) throw new Error('Unable to check previous reviews. Please retry.')
      return (data ?? []).map((row: { offering_id: string }) => row.offering_id)
    },
    async myVerifiedOfferingIds(): Promise<string[]> {
      const { data, error } = await client.from('course_enrollments')
        .select('course_offering_id')
        .eq('verification_status', 'verified')
        .not('course_offering_id', 'is', null)
      if (error) throw new Error('Unable to check your verified course enrollments. Please retry.')
      return [...new Set((data ?? []).map(row => row.course_offering_id).filter((id): id is string => Boolean(id)))]
    },
    async myCurrentOfferingIds(): Promise<string[]> {
      const { data: enrollments, error: currentError } = await client.rpc('my_current_enrollments')
      if (currentError) throw new Error('Unable to load your current-semester classes. Please retry.')
      const enrollmentIds = (enrollments ?? []).map((row: { enrollment_id: string }) => row.enrollment_id)
      if (!enrollmentIds.length) return []
      const { data, error } = await client.from('course_enrollments')
        .select('course_offering_id')
        .in('id', enrollmentIds)
        .eq('verification_status', 'verified')
        .not('course_offering_id', 'is', null)
      if (error) throw new Error('Unable to match your current classes to course offerings. Please retry.')
      return [...new Set((data ?? []).map(row => row.course_offering_id).filter((id): id is string => Boolean(id)))]
    },
    async submit(offeringId: string, input: CourseReviewInput): Promise<CourseEvaluation[]> {
      const { error } = await client.from('course_reviews').insert({
        offering_id: offeringId,
        difficulty: input.difficulty,
        weekly_hours: input.weeklyHours,
        review: input.review,
        class_rating: input.classRating,
        would_recommend: input.wouldRecommend,
      })
      if (error?.code === '23505') throw new DuplicateCourseReviewError()
      if (isMissingReviewRelation(error)) throw new CourseReviewStorageUnavailableError()
      if (error) throw new Error(`Your review could not be saved (${error.code}): ${error.message}`)
      return loadOffering(offeringId)
    },
  }
}

export type CourseReviewApi = ReturnType<typeof courseReviewApi>
