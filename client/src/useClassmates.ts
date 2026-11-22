import { useEffect, useState } from 'react'
import type { Classmate, ClassmateApi } from './classmates'
import { classmateError } from './classmates'

export type ClassmateState = { status: 'idle' | 'loading' | 'success' | 'error'; classmates: Classmate[] }

export function useClassmates(api: ClassmateApi, userId: string | null, courseCode: string | null, section: string | null, professorFirstName: string | null = null, professorLastName: string | null = null) {
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const refresh = () => setAttempt(value => value + 1)
    window.addEventListener('student-communication-settings-changed', refresh)
    return () => window.removeEventListener('student-communication-settings-changed', refresh)
  }, [])
  const [result, setResult] = useState<{ key: string | null; api: ClassmateApi; state: ClassmateState } | null>(null)
  const key = userId && courseCode && section && professorFirstName?.trim() && professorLastName?.trim()
    ? JSON.stringify([userId, courseCode, section, professorFirstName.trim().toLowerCase(), professorLastName.trim().toLowerCase(), attempt])
    : null
  if (result?.key !== key || result?.api !== api) {
    setResult({ key, api, state: { status: key ? 'loading' : 'idle', classmates: [] } })
  }
  useEffect(() => {
    if (!key || !courseCode || !section || !professorFirstName?.trim() || !professorLastName?.trim()) return
    let active = true
    void api(courseCode, section, professorFirstName, professorLastName).then(classmates => {
      if (active) setResult({ key, api, state: { status: 'success', classmates } })
    }, () => {
      if (active) setResult({ key, api, state: { status: 'error', classmates: [] } })
    })
    return () => { active = false }
  }, [api, key, courseCode, section, professorFirstName, professorLastName])
  // Mask old results during render, before effect cleanup/start on a key change.
  const state: ClassmateState = !key ? { status: 'idle', classmates: [] }
    : result?.key === key && result.api === api ? result.state : { status: 'loading', classmates: [] }
  return { ...state, message: classmateError, retry: () => setAttempt(previous => previous + 1) }
}
