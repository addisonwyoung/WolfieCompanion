import { useEffect, useState } from 'react'
import type { Classmate, ClassmateApi } from './classmates'
import { classmateError } from './classmates'

export type ClassmateState = { status: 'idle' | 'loading' | 'success' | 'error'; classmates: Classmate[] }

export function useClassmates(api: ClassmateApi, userId: string | null, courseCode: string | null, section: string | null) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string | null; api: ClassmateApi; state: ClassmateState } | null>(null)
  const key = userId && courseCode && section ? JSON.stringify([userId, courseCode, section, attempt]) : null
  if (result?.key !== key || result?.api !== api) {
    setResult({ key, api, state: { status: key ? 'loading' : 'idle', classmates: [] } })
  }
  useEffect(() => {
    if (!key || !courseCode || !section) return
    let active = true
    void api(courseCode, section).then(classmates => {
      if (active) setResult({ key, api, state: { status: 'success', classmates } })
    }, () => {
      if (active) setResult({ key, api, state: { status: 'error', classmates: [] } })
    })
    return () => { active = false }
  }, [api, key, courseCode, section])
  // Mask old results during render, before effect cleanup/start on a key change.
  const state: ClassmateState = !key ? { status: 'idle', classmates: [] }
    : result?.key === key && result.api === api ? result.state : { status: 'loading', classmates: [] }
  return { ...state, message: classmateError, retry: () => setAttempt(previous => previous + 1) }
}
