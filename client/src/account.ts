import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Course } from './sampleData'

export const years = ['First year', 'Second year', 'Third year', 'Fourth year', 'Graduate'] as const
export interface StudentProfile {
  share_year?: boolean; share_interests?: boolean; share_residence_status?: boolean; share_avatar?: boolean
  id: string; name: string; major: string | null; year: string | null
  interests: string[]; residence_status: 'commuter' | 'dormer' | null; avatar_path: string | null
}
export interface ClassRow { code: string; section: string }
// id remains the code-derived UI identifier; databaseId is the saved membership UUID.
export interface SavedCourse extends Course { databaseId: string }
export interface PictureChange { file?: File; remove?: boolean }
export function validateRows(rows: ClassRow[]) {
  return rows.length > 0 && rows.length <= 100 && rows.every(r => /^[a-z]{2,4}\s*\d{3}$/i.test(r.code.trim()) && /^[a-z0-9-]{0,20}$/i.test(r.section.trim()))
}
export function normalizeProfile(profile: StudentProfile): StudentProfile {
  const interests = [...new Map(profile.interests.map(s => s.trim()).filter(Boolean).map(s => [s.toLowerCase(), s])).values()]
  const next = { ...profile, share_year: profile.share_year === true, share_interests: profile.share_interests === true, share_residence_status: profile.share_residence_status === true, share_avatar: profile.share_avatar === true, name: profile.name.trim(), major: profile.major?.trim() || null, interests }
  if (!next.name || next.name.length > 100) throw new Error('Enter a name of 1 to 100 characters.')
  if ((next.major?.length ?? 0) > 120) throw new Error('Major must be at most 120 characters.')
  if (next.year !== null && !years.includes(next.year as typeof years[number])) throw new Error('Choose a listed year or leave it unset.')
  if (next.residence_status !== null && !['commuter', 'dormer'].includes(next.residence_status)) throw new Error('Choose commuter, dormer, or leave it unset.')
  if (interests.length > 20 || interests.some(s => s.length > 50)) throw new Error('Use at most 20 interests, each at most 50 characters.')
  return next
}
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const supabase = url && key ? createClient(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } }) : null
export const configurationError = 'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in client/.env.local, then restart the app.'

export function accountApi(client: SupabaseClient) {
  const bucket = client.storage.from('avatars')
  async function removeObject(path: string) {
    const { error } = await bucket.remove([path]); if (error) throw new Error('Picture cleanup failed. Try cleanup again.')
  }
  return {
    async eligible() {
      const { data, error } = await client.rpc('account_is_eligible')
      if (error) throw new Error('Unable to verify your student account. Please retry.')
      return data === true
    },
    async load(): Promise<{ profile: StudentProfile; courses: SavedCourse[] }> {
      const [p, c] = await Promise.all([
        client.rpc('ensure_profile').single(),
        client.from('user_courses').select('id,course_code,user_course_sections(section)').order('course_code'),
      ])
      if (p.error || c.error || !p.data) throw new Error('Unable to load your profile and classes. Please retry.')
      return { profile: p.data as StudentProfile, courses: (c.data ?? []).map(row => ({ id: row.course_code.toLowerCase().replace(' ', '-'), databaseId: row.id, code: row.course_code, sections: row.user_course_sections.map(s => s.section).sort() })) }
    },
    async saveClasses(rows: ClassRow[]): Promise<SavedCourse[]> {
      if (!validateRows(rows)) throw new Error('Check each course code and section. Save 1 to 100 rows at a time.')
      const { data, error } = await client.rpc('save_enrollments', { rows })
      if (error) throw new Error('Classes could not be saved. Your draft is still here; please retry.')
      return (data as Course[]).map(c => ({ ...c, databaseId: c.id, id: c.code.toLowerCase().replace(' ', '-') }))
    },
    async saveProfile(profile: StudentProfile, picture: PictureChange = {}) {
      const next = normalizeProfile(profile)
      let uploaded: string | null = null
      if (picture.file) {
        if (!['image/png', 'image/jpeg'].includes(picture.file.type) || !picture.file.size || picture.file.size > 5 * 1024 * 1024) throw new Error('Choose a nonempty PNG or JPEG up to 5 MiB.')
        const { data: { session } } = await client.auth.getSession()
        if (!session) throw new Error('Sign in again before saving.')
        const response = await fetch('/api/avatar', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': picture.file.type }, body: picture.file })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Picture upload failed. Please retry.')
        uploaded = result.path; next.avatar_path = uploaded
      } else if (picture.remove) next.avatar_path = null
      const { data, error } = await client.from('profiles').update({ name: next.name, major: next.major, year: next.year, interests: next.interests, residence_status: next.residence_status, avatar_path: next.avatar_path, share_year: next.share_year, share_interests: next.share_interests, share_residence_status: next.share_residence_status, share_avatar: next.share_avatar }).eq('id', next.id).select().single()
      if (error) {
        let cleanupPath: string | null = null
        if (uploaded) { try { await removeObject(uploaded) } catch { cleanupPath = uploaded } }
        const failure = new Error('Profile could not be saved. Your draft is still here; please retry.') as Error & { cleanupPath?: string }
        if (cleanupPath) failure.cleanupPath = cleanupPath
        throw failure
      }
      let cleanupPath: string | null = null
      if (profile.avatar_path && profile.avatar_path !== next.avatar_path) {
        try { await removeObject(profile.avatar_path) } catch { cleanupPath = profile.avatar_path }
      }
      return { profile: data as StudentProfile, cleanupPath }
    },
    async pictureUrl(path: string) {
      const { data, error } = await bucket.createSignedUrl(path, 300)
      if (error) throw new Error('Picture unavailable.')
      return data.signedUrl
    },
    removeObject,
  }
}
export type AccountApi = ReturnType<typeof accountApi>
