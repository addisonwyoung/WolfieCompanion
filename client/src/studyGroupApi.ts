import type { SupabaseClient } from '@supabase/supabase-js'

export const studyDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export type StudyDay = typeof studyDays[number]
export interface StudyWindow { day: StudyDay; start_minute: number; end_minute: number }
export interface StudyGroupMember { user_id: string; name: string; status: 'pending' | 'accepted'; role: 'owner' | 'member' }
export interface StudyGroup {
  group_id: string; course_code: string; name: string; owner_id: string; created_at: string
  my_status: 'pending' | 'accepted'; members: StudyGroupMember[]
  availability: (StudyWindow & { user_id: string })[]
}
export interface GroupInviteInput { courseCode: string; name: string; invitees: string[] }
export interface StudyGroupApi {
  list(): Promise<StudyGroup[]>
  create(input: GroupInviteInput): Promise<string>
  respond(groupId: string, accept: boolean): Promise<void>
  saveAvailability(groupId: string, windows: StudyWindow[]): Promise<void>
  leave(groupId: string): Promise<void>
}
export const studyGroupError = 'Study groups could not be loaded. Please retry.'

function parseGroup(value: unknown): StudyGroup {
  if (!value || typeof value !== 'object') throw new Error(studyGroupError)
  const row = value as Record<string, unknown>
  if (typeof row.group_id !== 'string' || typeof row.course_code !== 'string' || typeof row.name !== 'string'
    || typeof row.owner_id !== 'string' || typeof row.created_at !== 'string'
    || (row.my_status !== 'pending' && row.my_status !== 'accepted')
    || !Array.isArray(row.members) || !Array.isArray(row.availability)) throw new Error(studyGroupError)
  const members = row.members.map(value => {
    if (!value || typeof value !== 'object') throw new Error(studyGroupError)
    const member = value as Record<string, unknown>
    if (typeof member.user_id !== 'string' || typeof member.name !== 'string'
      || (member.status !== 'pending' && member.status !== 'accepted')
      || (member.role !== 'owner' && member.role !== 'member')) throw new Error(studyGroupError)
    return member as unknown as StudyGroupMember
  })
  const availability = row.availability.map(value => {
    if (!value || typeof value !== 'object') throw new Error(studyGroupError)
    const window = value as Record<string, unknown>
    if (typeof window.user_id !== 'string' || !studyDays.includes(window.day as StudyDay)
      || !Number.isInteger(window.start_minute) || !Number.isInteger(window.end_minute)
      || Number(window.start_minute) < 0 || Number(window.end_minute) > 1440
      || Number(window.start_minute) >= Number(window.end_minute)) throw new Error(studyGroupError)
    return window as unknown as StudyWindow & { user_id: string }
  })
  return { ...row, members, availability } as unknown as StudyGroup
}

export function studyGroupApi(client: SupabaseClient): StudyGroupApi {
  async function invoke<T>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, args)
    if (error) throw new Error(error.message || studyGroupError)
    return data as T
  }
  return {
    async list() {
      const data = await invoke<unknown>('my_study_groups')
      if (!Array.isArray(data)) throw new Error(studyGroupError)
      return data.map(parseGroup)
    },
    create: input => invoke<string>('create_study_group', {
      p_course_code: input.courseCode, p_name: input.name.trim(), p_invitees: input.invitees,
    }),
    async respond(groupId, accept) { await invoke('respond_to_study_group_invite', { p_group_id: groupId, p_accept: accept }) },
    async saveAvailability(groupId, windows) {
      await invoke('save_study_group_availability', { p_group_id: groupId, p_windows: windows })
    },
    async leave(groupId) { await invoke('leave_study_group', { p_group_id: groupId }) },
  }
}
