import type { SupabaseClient } from '@supabase/supabase-js'

export type WarningContext = 'messaging' | 'study'
export interface SharedGroupWarning { warning_id: string; blocked_student_id: string; name: string }
export interface BlockedStudent { student_id: string; created_at: string; name_snapshot: string | null }
export const privacyChangedEvent = 'student-communication-settings-changed'
export function privacySessionInvalid(error: unknown) {
  return error instanceof Error && 'code' in error && ['PRIVACY_SESSION', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(error.code))
}

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
function identifier(value: string) {
  if (!uuid.test(value)) throw new Error('Invalid student or group')
}

// Session-derived RPCs: the client never supplies a blocker/caller identity.
export function studentPrivacyApi(client: SupabaseClient) {
  async function token(actor: string, signal?: AbortSignal) {
    identifier(actor)
    const { data, error } = await client.auth.getSession()
    if (error || data.session?.user.id !== actor || signal?.aborted) throw Object.assign(new Error('Sign in again before changing privacy settings.'), { code: 'PRIVACY_SESSION' })
    return data.session.access_token
  }
  function failure(code?: string) {
    return Object.assign(new Error('Privacy information could not be confirmed. Please retry. If this continues, reload the application.'), { code })
  }
  async function mutate(name: 'block_student' | 'unblock_student', student: string, actor: string, signal: AbortSignal) {
    identifier(student)
    const bearer = await token(actor, signal)
    const { error } = await client.rpc(name, { p_student_id: student }).setHeader('Authorization', `Bearer ${bearer}`).abortSignal(signal)
    if (error) throw Object.assign(new Error('Student preference could not be updated. Please retry.'), { code: error.code })
  }
  return {
    block: (student: string, actor: string, signal: AbortSignal) => mutate('block_student', student, actor, signal),
    unblock: (student: string, actor: string, signal: AbortSignal) => mutate('unblock_student', student, actor, signal),
    async blocks(actor: string, signal: AbortSignal): Promise<BlockedStudent[]> {
      const bearer = await token(actor, signal)
      const rows: BlockedStudent[] = []
      for (let offset = 0; ; offset += 200) {
        if (signal.aborted) throw failure()
        const { data, error } = await client.from('student_blocks').select('blocked_id,created_at,blocked_name_snapshot')
          .order('created_at', { ascending: false }).order('blocked_id').range(offset, offset + 199)
          .setHeader('Authorization', `Bearer ${bearer}`).abortSignal(signal)
        if (error || !Array.isArray(data)) throw failure(error?.code)
        for (const row of data) {
          if (typeof row.blocked_id !== 'string' || !uuid.test(row.blocked_id) || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) || !(row.blocked_name_snapshot === null || typeof row.blocked_name_snapshot === 'string')) throw failure()
          rows.push({ student_id: row.blocked_id, created_at: row.created_at, name_snapshot: row.blocked_name_snapshot?.trim() || null })
        }
        if (data.length < 200) return rows
      }
    },
    async warnings(context: WarningContext, group: string, actor: string, signal: AbortSignal): Promise<SharedGroupWarning[]> {
      identifier(group)
      if (!['messaging', 'study'].includes(context)) throw failure()
      const bearer = await token(actor, signal)
      // Default rpc transport is POST: this VOLATILE operation can initialize state.
      const { data, error } = await client.rpc('shared_group_warnings', { p_context: context, p_group_id: group })
        .setHeader('Authorization', `Bearer ${bearer}`).abortSignal(signal)
      if (error || !Array.isArray(data)) throw failure(error?.code)
      return data.map(row => {
        if (!row || !uuid.test(row.warning_id) || !uuid.test(row.blocked_student_id) || typeof row.name !== 'string') throw failure()
        return { warning_id: row.warning_id, blocked_student_id: row.blocked_student_id, name: row.name }
      })
    },
    async dismiss(warning: string, actor: string, signal: AbortSignal) {
      identifier(warning)
      const bearer = await token(actor, signal)
      const { error } = await client.rpc('dismiss_shared_group_warning', { p_warning_id: warning })
        .setHeader('Authorization', `Bearer ${bearer}`).abortSignal(signal)
      if (error) throw failure(error.code)
    },
    async groupPicture(group: string, student: string, signal: AbortSignal): Promise<Blob> {
      identifier(group); identifier(student)
      const { data } = await client.auth.getSession()
      if (!data.session) throw new Error('Sign in again')
      const response = await fetch(`/api/group-picture?${new URLSearchParams({ group, student })}`, {
        signal, cache: 'no-store', headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
      if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/png')) throw new Error('Picture unavailable')
      return response.blob()
    },
  }
}
export type StudentPrivacyApi = ReturnType<typeof studentPrivacyApi>
