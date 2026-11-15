import type { SupabaseClient } from '@supabase/supabase-js'

export interface Classmate { student_id: string; name: string; major: string | null }
export type ClassmateApi = (courseCode: string, section: string, professorFirstName: string, professorLastName: string) => Promise<Classmate[]>
export const classmateError = 'Unable to load classmates. Please retry.'

export function classmateApi(client: SupabaseClient): ClassmateApi {
  return async (courseCode, section, professorFirstName, professorLastName) => {
    try {
      const { data, error } = await client.rpc('find_classmates_by_professor', { p_course_code: courseCode, p_section: section, p_professor_first_name: professorFirstName, p_professor_last_name: professorLastName })
      if (error || !Array.isArray(data)) throw new Error(classmateError)
      return data.map(row => {
        if (typeof row.student_id !== 'string' || typeof row.name !== 'string' || (row.major !== null && typeof row.major !== 'string')) throw new Error(classmateError)
        return { student_id: row.student_id, name: row.name, major: row.major }
      })
    } catch { throw new Error(classmateError) }
  }
}
