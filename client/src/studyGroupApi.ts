import type { SupabaseClient } from '@supabase/supabase-js'

export const studyDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export type StudyDay = typeof studyDays[number]
export interface StudyWindow { day: StudyDay; start_minute: number; end_minute: number }
export interface StudyGroupMember { user_id: string; name: string; status: 'pending' | 'accepted'; role: 'owner' | 'member'; study_role: string | null }
export interface StudyGroupTask {
  id: string; title: string; details: string; is_complete: boolean; created_by: string
  created_by_name: string; created_at: string
}
export interface StudyGroup {
  group_id: string; course_code: string; course_section: string | null; name: string; owner_id: string; created_at: string
  my_status: 'pending' | 'accepted'; members: StudyGroupMember[]
  availability: (StudyWindow & { user_id: string })[]
  tasks: StudyGroupTask[]
}
export interface GroupInviteInput { courseCode: string; section: string; name: string; invitees: string[] }
export interface StudyGroupApi {
  list(): Promise<StudyGroup[]>
  create(input: GroupInviteInput): Promise<string>
  respond(groupId: string, accept: boolean): Promise<void>
  saveAvailability(groupId: string, windows: StudyWindow[]): Promise<void>
  setMemberRole(groupId: string, memberId: string, role: string | null): Promise<void>
  addTask(groupId: string, title: string, details: string): Promise<string>
  setTaskComplete(taskId: string, isComplete: boolean): Promise<void>
  deleteTask(taskId: string): Promise<void>
  leave(groupId: string): Promise<void>
}
export const studyGroupError = 'Study groups could not be loaded. Please retry.'

function parseGroup(value: unknown): StudyGroup {
  if (!value || typeof value !== 'object') throw new Error(studyGroupError)
  const row = value as Record<string, unknown>
  if (typeof row.group_id !== 'string' || typeof row.course_code !== 'string'
    || (row.course_section !== null && typeof row.course_section !== 'string') || typeof row.name !== 'string'
    || typeof row.owner_id !== 'string' || typeof row.created_at !== 'string'
    || (row.my_status !== 'pending' && row.my_status !== 'accepted')
    || !Array.isArray(row.members) || !Array.isArray(row.availability)
    || (row.tasks !== undefined && !Array.isArray(row.tasks))) throw new Error(studyGroupError)
  const members = row.members.map(value => {
    if (!value || typeof value !== 'object') throw new Error(studyGroupError)
    const member = value as Record<string, unknown>
    if (typeof member.user_id !== 'string' || typeof member.name !== 'string'
      || (member.status !== 'pending' && member.status !== 'accepted')
      || (member.role !== 'owner' && member.role !== 'member')
      || (member.study_role !== undefined && member.study_role !== null && typeof member.study_role !== 'string')) throw new Error(studyGroupError)
    return { ...member, study_role: typeof member.study_role === 'string' ? member.study_role : null } as unknown as StudyGroupMember
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
  const tasks = (row.tasks as unknown[] | undefined ?? []).map(value => {
    if (!value || typeof value !== 'object') throw new Error(studyGroupError)
    const task = value as Record<string, unknown>
    if (typeof task.id !== 'string' || typeof task.title !== 'string' || typeof task.details !== 'string'
      || typeof task.is_complete !== 'boolean' || typeof task.created_by !== 'string'
      || typeof task.created_by_name !== 'string' || typeof task.created_at !== 'string') throw new Error(studyGroupError)
    return task as unknown as StudyGroupTask
  })
  return { ...row, members, availability, tasks } as unknown as StudyGroup
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
      p_course_code: input.courseCode, p_section: input.section, p_name: input.name.trim(), p_invitees: input.invitees,
    }),
    async respond(groupId, accept) { await invoke('respond_to_study_group_invite', { p_group_id: groupId, p_accept: accept }) },
    async saveAvailability(groupId, windows) {
      await invoke('save_study_group_availability', { p_group_id: groupId, p_windows: windows })
    },
    async setMemberRole(groupId, memberId, role) {
      await invoke('set_study_group_member_role', { p_group_id: groupId, p_member_id: memberId, p_study_role: role })
    },
    addTask: (groupId, title, details) => invoke<string>('add_study_group_task', {
      p_group_id: groupId, p_title: title.trim(), p_details: details.trim(),
    }),
    async setTaskComplete(taskId, isComplete) {
      await invoke('set_study_group_task_complete', { p_task_id: taskId, p_is_complete: isComplete })
    },
    async deleteTask(taskId) { await invoke('delete_study_group_task', { p_task_id: taskId }) },
    async leave(groupId) { await invoke('leave_study_group', { p_group_id: groupId }) },
  }
}
