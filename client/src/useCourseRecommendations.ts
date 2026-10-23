import { useEffect, useState } from 'react'
import type { CourseRecommendation, RecommendationApi } from './courseRecommendations'

export type RecommendationState = { status: 'idle' | 'loading' | 'success' | 'error'; candidates: CourseRecommendation[] }

export function useCourseRecommendations(api: RecommendationApi, userId: string | null, courseCode: string | null) {
  const [attempt, setAttempt] = useState(0)
  const key = userId && courseCode ? JSON.stringify([userId, courseCode, attempt]) : null
  const [result, setResult] = useState<{ key: string; api: RecommendationApi; state: RecommendationState } | null>(null)

  useEffect(() => {
    if (!key || !courseCode) return
    const controller = new AbortController()
    void api(courseCode, controller.signal).then(candidates => {
      if (!controller.signal.aborted) setResult({ key, api, state: { status: 'success', candidates } })
    }, () => {
      if (!controller.signal.aborted) setResult({ key, api, state: { status: 'error', candidates: [] } })
    })
    return () => controller.abort()
  }, [api, key, courseCode])

  if (!key) return { status: 'idle' as const, candidates: [] as CourseRecommendation[], retry: () => setAttempt(value => value + 1) }
  const state = result?.key === key && result.api === api ? result.state : { status: 'loading' as const, candidates: [] }
  return { ...state, retry: () => setAttempt(value => value + 1) }
}
