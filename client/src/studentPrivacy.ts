import type { SupabaseClient } from '@supabase/supabase-js'

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
function identifier(value: string) {
  if (!uuid.test(value)) throw new Error('Invalid student or group')
}

// Session-derived RPCs: the client never supplies a blocker/caller identity.
export function studentPrivacyApi(client: SupabaseClient) {
  async function mutate(name: 'block_student' | 'unblock_student', student: string) {
    identifier(student)
    const { error } = await client.rpc(name, { p_student_id: student })
    if (error) throw new Error('Student preference could not be updated. Please retry.')
  }
  return {
    block: (student: string) => mutate('block_student', student),
    unblock: (student: string) => mutate('unblock_student', student),
    async blocks(signal: AbortSignal): Promise<{ student_id: string; created_at: string }[]> {
      const { data, error } = await client.from('student_blocks').select('blocked_id,created_at').abortSignal(signal)
      if (error || !Array.isArray(data)) throw new Error('Blocked students could not be loaded.')
      return data.map(row => {
        if (typeof row.blocked_id !== 'string' || !uuid.test(row.blocked_id) || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) throw new Error('Invalid blocked student')
        return { student_id: row.blocked_id, created_at: row.created_at }
      })
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
