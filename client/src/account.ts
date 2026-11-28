import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Course } from './sampleData'

export const years = ['First year', 'Second year', 'Third year', 'Fourth year', 'Graduate'] as const
export const dmPermissions = ['eligible_students', 'friends_only', 'no_one'] as const
export type DmPermission = typeof dmPermissions[number]
export interface StudentProfile {
  is_private: boolean
  dm_permission?: DmPermission
  allow_group_additions?: boolean
  // Read-only legacy column retained by the database; never send it in an update.
  allow_new_dms?: boolean
  share_year?: boolean; share_interests?: boolean; share_residence_status?: boolean; share_avatar?: boolean
  id: string; name: string; major: string | null; year: string | null
  interests: string[]; residence_status: 'commuter' | 'dormer' | null; avatar_path: string | null
}
export interface ClassRow { code: string; section: string; professor_first_name: string; professor_last_name: string }
// id remains the code-derived UI identifier; databaseId is the saved membership UUID.
export interface SavedCourse extends Course { databaseId: string; enrollmentId?: string }
export interface PictureChange { file?: File; remove?: boolean }
export function validateRows(rows: ClassRow[]) {
  return rows.length > 0 && rows.length <= 100 && rows.every(r => /^[a-z]{2,5}\s*\d{3}[a-z]?$/i.test(r.code.trim()) && /^[a-z0-9-]{1,20}$/i.test(r.section.trim()) && r.professor_first_name.trim().length > 0 && r.professor_first_name.trim().length <= 80 && r.professor_last_name.trim().length > 0 && r.professor_last_name.trim().length <= 80)
}
export function duplicateCourseCode(rows: Pick<ClassRow, 'code'>[], existingCodes: string[] = []): string | null {
  const seen = new Set(existingCodes.map(code => code.replace(/\s+/g, '').toUpperCase()))
  for (const row of rows) {
    const code = row.code.replace(/\s+/g, '').toUpperCase()
    const match = /^([A-Z]{2,5})([0-9]{3}[A-Z]?)$/.exec(code)
    const displayCode = match ? `${match[1]} ${match[2]}` : row.code.trim().toUpperCase()
    if (seen.has(code)) return displayCode
    seen.add(code)
  }
  return null
}
export function normalizeProfile(profile: StudentProfile): StudentProfile {
  if (typeof profile.is_private !== 'boolean') throw new Error('Privacy settings are unavailable. Reload your account before saving.')
  const interests = [...new Map(profile.interests.map(s => s.trim()).filter(Boolean).map(s => [s.toLowerCase(), s])).values()]
  const next = { ...profile, dm_permission: profile.dm_permission ?? 'eligible_students', allow_group_additions: profile.allow_group_additions ?? true, share_year: profile.share_year === true, share_interests: profile.share_interests === true, share_residence_status: profile.share_residence_status === true, share_avatar: profile.share_avatar === true, name: profile.name.trim(), major: profile.major?.trim() || null, interests }
  if (!dmPermissions.includes(next.dm_permission) || typeof next.allow_group_additions !== 'boolean') throw new Error('Choose a valid messaging preference.')
  if (!next.name || next.name.length > 100) throw new Error('Enter a name of 1 to 100 characters.')
  if ((next.major?.length ?? 0) > 120) throw new Error('Major must be at most 120 characters.')
  if (next.year !== null && !years.includes(next.year as typeof years[number])) throw new Error('Choose a listed year or leave it unset.')
  if (next.residence_status !== null && !['commuter', 'dormer'].includes(next.residence_status)) throw new Error('Choose commuter, dormer, or leave it unset.')
  if (interests.length > 5) throw new Error('Choose no more than five interests.')
  if (interests.some(s => s.length > 50)) throw new Error('Each interest must be at most 50 characters.')
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
    async load(): Promise<{ profile: StudentProfile; courses: SavedCourse[]; plannerCourses: SavedCourse[] }> {
      const [p, c, planner] = await Promise.all([
        client.rpc('ensure_profile').single(),
        client.rpc('my_current_enrollments'),
        client.from('user_courses').select('id,course_code,user_course_sections(section)').order('course_code'),
      ])
      if (p.error || c.error || planner.error || !p.data) throw new Error('Unable to load your profile and classes. Please retry.')
      const grouped = new Map<string, SavedCourse>()
      for (const row of (c.data ?? []) as { enrollment_id: string; legacy_course_id: string | null; code: string; section: string | null; professor_first_name: string | null; professor_last_name: string | null; verification_status: string }[]) {
        const section = row.section ?? ''
        const firstName = row.professor_first_name?.trim() ?? ''
        const lastName = row.professor_last_name?.trim() ?? ''
        const professorKey = `${firstName.toLowerCase()}:${lastName.toLowerCase()}`
        const id = `${row.code.toLowerCase().replace(' ', '-')}-section-${section.toLowerCase() || 'unknown'}-prof-${professorKey.replace(/[^a-z0-9]+/g, '-')}`
        const key = `${row.code}:${section}:${professorKey}`
        const current = grouped.get(key)
        if (current) {
          if (row.section && !current.sections?.includes(row.section)) current.sections = [...(current.sections ?? []), row.section].sort()
          if (current.verificationStatus !== 'pending') current.verificationStatus = row.verification_status
        } else {
          grouped.set(key, { id, databaseId: row.legacy_course_id ?? row.enrollment_id, enrollmentId: row.enrollment_id, code: row.code, section: row.section ?? undefined, sections: row.section ? [row.section] : [], ...(firstName ? { professorFirstName: firstName } : {}), ...(lastName ? { professorLastName: lastName } : {}), verificationStatus: row.verification_status })
        }
      }
      if (typeof (p.data as StudentProfile).is_private !== 'boolean') throw new Error('Privacy settings are unavailable. Reload your account before saving.')
      return { profile: p.data as StudentProfile, courses: [...grouped.values()], plannerCourses: (planner.data ?? []).map(row => ({ id: row.course_code.toLowerCase().replace(' ', '-'), databaseId: row.id, code: row.course_code, sections: row.user_course_sections.map(s => s.section).sort() })) }
    },
    async saveClasses(rows: ClassRow[]): Promise<{ courses: SavedCourse[]; plannerCourses: SavedCourse[] }> {
      if (!validateRows(rows)) throw new Error('Enter a valid course code, section, and professor first and last name for every class. Save 1 to 100 rows at a time.')
      const { data, error } = await client.rpc('save_enrollments', { rows })
      if (error) throw new Error('Classes could not be saved. Your draft is still here; please retry.')
      const grouped = new Map<string, SavedCourse>()
      for (const row of (data ?? []) as { enrollment_id: string; legacy_course_id: string | null; code: string; section: string | null; professor_first_name: string | null; professor_last_name: string | null; verification_status: string }[]) {
        const section = row.section ?? ''
        const firstName = row.professor_first_name?.trim() ?? ''
        const lastName = row.professor_last_name?.trim() ?? ''
        const professorKey = `${firstName.toLowerCase()}:${lastName.toLowerCase()}`
        const key = `${row.code}:${section}:${professorKey}`
        const id = `${row.code.toLowerCase().replace(' ', '-')}-section-${section.toLowerCase() || 'unknown'}-prof-${professorKey.replace(/[^a-z0-9]+/g, '-')}`
        const course = grouped.get(key)
        if (course) {
          if (row.section && !course.sections?.includes(row.section)) course.sections = [...(course.sections ?? []), row.section].sort()
          if (course.verificationStatus !== 'pending') course.verificationStatus = row.verification_status
        } else grouped.set(key, { id, databaseId: row.legacy_course_id ?? row.enrollment_id, enrollmentId: row.enrollment_id, code: row.code, section: row.section ?? undefined, sections: row.section ? [row.section] : [], ...(firstName ? { professorFirstName: firstName } : {}), ...(lastName ? { professorLastName: lastName } : {}), verificationStatus: row.verification_status })
      }
      const { data: planner, error: plannerError } = await client.from('user_courses').select('id,course_code,user_course_sections(section)').order('course_code')
      if (plannerError) throw new Error('Classes were saved, but planner course links could not be refreshed. Reload your workspace to retry.')
      const plannerCourses: SavedCourse[] = (planner ?? []).map(row => ({ id: row.course_code.toLowerCase().replace(' ', '-'), databaseId: row.id, code: row.course_code, sections: row.user_course_sections.map(s => s.section).sort() }))
      return { courses: [...grouped.values()], plannerCourses }
    },
    async editCourse(enrollmentId: string, row: ClassRow): Promise<{ course: SavedCourse; plannerCourses: SavedCourse[] }> {
      if (!enrollmentId || !validateRows([row])) throw new Error('Enter a valid course code, section, and professor first and last name.')
      const { data, error } = await client.rpc('edit_current_course_enrollment', {
        p_enrollment_id: enrollmentId,
        p_course_code: row.code,
        p_section: row.section,
        p_professor_first_name: row.professor_first_name,
        p_professor_last_name: row.professor_last_name,
      })
      if (error || !data || typeof data.enrollment_id !== 'string') throw new Error('Course could not be updated. Your changes are still here; please retry.')
      const loaded = await this.load()
      const course = loaded.courses.find(candidate => candidate.enrollmentId === data.enrollment_id)
      if (!course) throw new Error('Course was updated, but the dashboard could not refresh. Reload your workspace to see it.')
      return { course, plannerCourses: loaded.plannerCourses }
    },
    async removeCourse(enrollmentId: string): Promise<{ courses: SavedCourse[]; plannerCourses: SavedCourse[] }> {
      if (!enrollmentId) throw new Error('Choose a current course to remove.')
      const { error } = await client.rpc('remove_current_course_enrollment', { p_enrollment_id: enrollmentId })
      if (error) throw new Error('Course could not be removed. Please retry.')
      const loaded = await this.load()
      return { courses: loaded.courses, plannerCourses: loaded.plannerCourses }
    },
    async saveProfile(profile: StudentProfile, picture: PictureChange = {}, isCurrent: () => boolean = () => true) {
      const next = normalizeProfile(profile)
      function assertCurrent() { if (!isCurrent()) throw new Error('Your session changed. Reload before saving your profile.') }
      async function currentSession() {
        assertCurrent()
        const { data: { session }, error } = await client.auth.getSession()
        assertCurrent()
        if (error || !session || session.user.id !== next.id) throw new Error('Sign in again before saving your profile.')
        return session
      }
      async function cleanupWhenCurrent(path: string): Promise<string | null> {
        // Never start cleanup in a replacement session. An already completed
        // upload may remain unreferenced; cancellation is not server rollback.
        try { await currentSession() } catch { return null }
        if (!isCurrent()) return null
        try { await removeObject(path); return null } catch { return isCurrent() ? path : null }
      }
      const session = await currentSession()
      assertCurrent()
      let uploaded: string | null = null
      if (picture.file) {
        if (!['image/png', 'image/jpeg'].includes(picture.file.type) || !picture.file.size || picture.file.size > 5 * 1024 * 1024) throw new Error('Choose a nonempty PNG or JPEG up to 5 MiB.')
        const response = await fetch('/api/avatar', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': picture.file.type }, body: picture.file })
        const result = await response.json()
        assertCurrent()
        if (!response.ok) throw new Error(result.error || 'Picture upload failed. Please retry.')
        uploaded = result.path; next.avatar_path = uploaded
      } else if (picture.remove) next.avatar_path = null
      const commitSession = await currentSession()
      assertCurrent()
      const { data, error } = await client.from('profiles').update({ name: next.name, major: next.major, year: next.year, interests: next.interests, residence_status: next.residence_status, avatar_path: next.avatar_path, share_year: next.share_year, share_interests: next.share_interests, share_residence_status: next.share_residence_status, share_avatar: next.share_avatar, dm_permission: next.dm_permission, allow_group_additions: next.allow_group_additions, is_private: next.is_private }).eq('id', next.id).select().setHeader('Authorization', `Bearer ${commitSession.access_token}`).single()
      if (error) {
        let cleanupPath: string | null = null
        if (uploaded) cleanupPath = await cleanupWhenCurrent(uploaded)
        const failure = new Error(error.code === 'PDM01' ? 'Refresh the application to update messaging preferences. Your draft has not been saved.' : 'Profile could not be saved. Your draft is still here; please retry.') as Error & { cleanupPath?: string }
        if (cleanupPath) failure.cleanupPath = cleanupPath
        throw failure
      }
      if (!data || typeof (data as StudentProfile).is_private !== 'boolean') throw new Error('Profile save could not be verified. Reload your account to confirm your privacy settings.')
      let cleanupPath: string | null = null
      if (profile.avatar_path && profile.avatar_path !== next.avatar_path) {
        cleanupPath = await cleanupWhenCurrent(profile.avatar_path)
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
