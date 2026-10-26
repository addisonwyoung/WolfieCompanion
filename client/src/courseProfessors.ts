import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CourseProfessor {
  course_code: string
  course_number: string
  professor_first_name: string
  professor_last_name: string
}

export interface ProfessorCatalogApi {
  list(signal: AbortSignal): Promise<CourseProfessor[]>
}

export type ProfessorCatalogState =
  | { status: 'loading'; professors: CourseProfessor[]; retry: () => void }
  | { status: 'success'; professors: CourseProfessor[]; retry: () => void }
  | { status: 'error'; professors: CourseProfessor[]; retry: () => void }

export function professorCatalogApi(client: SupabaseClient): ProfessorCatalogApi {
  return {
    async list(signal) {
      const { data, error } = await client.from('course_professors')
        .select('course_code,course_number,professor_first_name,professor_last_name')
        .eq('active', true)
        .order('course_code').order('course_number').order('professor_last_name').order('professor_first_name')
        .abortSignal(signal)
      if (error) throw new Error('The approved professor list could not be loaded. Apply the professor-verification migration, then retry.')
      if (!Array.isArray(data)) throw new Error('The approved professor list returned an invalid response.')
      return data as CourseProfessor[]
    },
  }
}

export function useProfessorCatalog(api: ProfessorCatalogApi, userId: string | null): ProfessorCatalogState {
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState<{ userId: string; professors: CourseProfessor[] } | null>(null)
  const [failedUser, setFailedUser] = useState<string | null>(null)
  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    void api.list(controller.signal).then(professors => {
      if (!controller.signal.aborted) { setLoaded({ userId, professors }); setFailedUser(null) }
    }, () => {
      if (!controller.signal.aborted) setFailedUser(userId)
    })
    return () => controller.abort()
  }, [api, userId, revision])
  const retry = useMemo(() => () => setRevision(value => value + 1), [])
  if (!userId || loaded?.userId !== userId) {
    return { status: 'loading', professors: [], retry }
  }
  return failedUser === userId
    ? { status: 'error', professors: [], retry }
    : { status: 'success', professors: loaded.professors, retry }
}
