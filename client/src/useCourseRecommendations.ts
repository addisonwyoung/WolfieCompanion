import { useEffect, useState } from 'react'
import type { CourseRecommendation, RecommendationApi } from './courseRecommendations'

export type RecommendationState = { status: 'idle' | 'loading' | 'success' | 'error'; candidates: CourseRecommendation[] }

export function useCourseRecommendations(api: RecommendationApi, userId: string | null, courseCode: string | null, section: string | null, professorFirstName: string | null = null, professorLastName: string | null = null) {
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const refresh = () => setAttempt(value => value + 1)
    window.addEventListener('student-communication-settings-changed', refresh)
    return () => window.removeEventListener('student-communication-settings-changed', refresh)
  }, [])
  const key = userId && courseCode && section && professorFirstName && professorLastName ? JSON.stringify([userId, courseCode, section, professorFirstName.toLowerCase(), professorLastName.toLowerCase(), attempt]) : null
  const [result, setResult] = useState<{ key: string; api: RecommendationApi; state: RecommendationState } | null>(null)

  useEffect(() => {
    if (!key || !courseCode || !section || !professorFirstName || !professorLastName) return
    const controller = new AbortController()
    void api(courseCode, section, professorFirstName, professorLastName, controller.signal).then(candidates => {
      if (!controller.signal.aborted) setResult({ key, api, state: { status: 'success', candidates } })
    }, () => {
      if (!controller.signal.aborted) setResult({ key, api, state: { status: 'error', candidates: [] } })
    })
    return () => controller.abort()
  }, [api, key, courseCode, section, professorFirstName, professorLastName])

  if (!key) return { status: 'idle' as const, candidates: [] as CourseRecommendation[], retry: () => setAttempt(value => value + 1) }
  const state = result?.key === key && result.api === api ? result.state : { status: 'loading' as const, candidates: [] }
  return { ...state, retry: () => setAttempt(value => value + 1) }
}
