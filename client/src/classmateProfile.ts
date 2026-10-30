import type { SupabaseClient } from '@supabase/supabase-js'
import { years } from './account'

export interface ClassmateProfile {
  student_id: string; name: string; major: string | null; has_shared_avatar: boolean
  year?: string | null; interests?: string[]; residence_status?: 'commuter' | 'dormer' | null
}
export interface PeerApi {
  detail: (course: string, section: string, peer: string, signal: AbortSignal) => Promise<ClassmateProfile | null>
  picture: (course: string, section: string, peer: string, signal: AbortSignal) => Promise<Blob>
}
export function parsePeer(data: unknown, peer: string): ClassmateProfile {
  if (!data || typeof data !== 'object') throw new Error('Invalid profile')
  const row = data as Record<string, unknown>
  if (row.student_id !== peer || typeof row.name !== 'string' || !row.name.trim() || !(row.major === null || typeof row.major === 'string') || typeof row.has_shared_avatar !== 'boolean') throw new Error('Invalid profile')
  const result: ClassmateProfile = { student_id: peer, name: row.name, major: row.major, has_shared_avatar: row.has_shared_avatar }
  if ('year' in row) {
    if (row.year !== null && !years.includes(row.year as typeof years[number])) throw new Error('Invalid year')
    result.year = row.year as string | null
  }
  if ('interests' in row) {
    if (!Array.isArray(row.interests) || row.interests.length > 20 || row.interests.some(value => typeof value !== 'string' || !value.trim() || value.length > 50)) throw new Error('Invalid interests')
    result.interests = row.interests as string[]
  }
  if ('residence_status' in row) {
    if (row.residence_status !== null && row.residence_status !== 'commuter' && row.residence_status !== 'dormer') throw new Error('Invalid residence')
    result.residence_status = row.residence_status
  }
  return result
}
export function peerApi(client: SupabaseClient): PeerApi {
  return {
    async detail(course, section, peer, signal) {
      const { data, error } = await client.rpc('get_classmate_profile', { p_course_code: course, p_section: section, p_student_id: peer }).abortSignal(signal)
      if (error) {
        if (['42501','22023'].includes(error.code)) return null
        throw new Error('Unable to load profile. Please retry.')
      }
      return data === null ? null : parsePeer(data, peer)
    },
    async picture(course, section, peer, signal) {
      const { data } = await client.auth.getSession()
      if (!data.session) throw new Error('Sign in again')
      const response = await fetch(`/api/classmate-picture?${new URLSearchParams({ course, section, student: peer })}`, { signal, cache: 'no-store', headers: { Authorization: `Bearer ${data.session.access_token}` } })
      if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/png')) throw new Error('Picture unavailable')
      return response.blob()
    },
  }
}
