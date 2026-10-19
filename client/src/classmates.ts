import type { SupabaseClient } from '@supabase/supabase-js'

export interface Classmate { student_id: string; name: string; major: string | null }
export type ClassmateApi = (courseCode: string) => Promise<Classmate[]>
export const classmateError = 'Unable to load classmates. Please retry.'

export function classmateApi(client: SupabaseClient): ClassmateApi {
  return async courseCode => {
    try {
      const { data, error } = await client.rpc('find_classmates', { p_course_code: courseCode })
      if (error || !Array.isArray(data)) throw new Error(classmateError)
      return data.map(row => {
        if (typeof row.student_id !== 'string' || typeof row.name !== 'string' || (row.major !== null && typeof row.major !== 'string')) throw new Error(classmateError)
        return { student_id: row.student_id, name: row.name, major: row.major }
      })
    } catch { throw new Error(classmateError) }
  }
}
