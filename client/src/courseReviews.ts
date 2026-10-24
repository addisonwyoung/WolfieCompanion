import type { SupabaseClient } from '@supabase/supabase-js'
import type { CourseEvaluation } from './evaluationData'

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
      .select('id,offering_id,difficulty,weekly_hours,review,moderation_status,created_at')
      .eq('offering_id', offeringId)
    if (isMissingReviewRelation(error)) throw new CourseReviewStorageUnavailableError()
    if (error) throw new Error('Unable to load course reviews. Please retry.')
    return (data ?? []).map(row => ({
      id: row.id,
      offeringId: row.offering_id,
      weeklyHours: Number(row.weekly_hours),
      difficulty: row.difficulty,
      review: row.review,
      moderationStatus: row.moderation_status,
    }))
  }

  return {
    loadOffering,
    async myOfferingIds(): Promise<string[]> {
      const { data, error } = await client.rpc('my_course_review_offerings')
      if (error) throw new Error('Unable to check your previous reviews. You can still submit; duplicates are blocked by the database.')
      return (data ?? []).map((row: { offering_id: string }) => row.offering_id)
    },
    async submit(offeringId: string, input: CourseReviewInput): Promise<{ reviews: CourseEvaluation[]; moderationStatus: 'appropriate' | 'flagged' }> {
      const { data: { session } } = await client.auth.getSession()
      if (!session) throw new Error('Sign in again before publishing your review.')
      const response = await fetch('/api/course-reviews', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeringId, ...input }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; moderationStatus?: 'appropriate' | 'flagged' }
      if (response.status === 409) throw new DuplicateCourseReviewError()
      if (!response.ok) throw new Error(result.error || 'Your review could not be saved. Your draft is still here; please retry.')
      return { reviews: await loadOffering(offeringId), moderationStatus: result.moderationStatus ?? 'appropriate' }
    },
  }
}

export type CourseReviewApi = ReturnType<typeof courseReviewApi>
