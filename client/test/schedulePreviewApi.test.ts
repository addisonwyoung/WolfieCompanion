import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { schedulePreviewHeaders } from '../src/schedulePreviewApi'

function sessionClient(session: { access_token: string } | null, error: Error | null = null) {
  return { auth: { getSession: async () => ({ data: { session }, error }) } } as unknown as SupabaseClient
}
describe('authenticated schedule extraction', () => {
  it('sends the signed-in bearer token', async () => {
    expect(await schedulePreviewHeaders(new AbortController().signal, sessionClient({ access_token: 'student-token' })))
      .toEqual({ 'X-Schedule-Preview': '1', Authorization: 'Bearer student-token' })
  })
  it('rejects expired or unavailable sessions before uploading', async () => {
    for (const client of [sessionClient(null), sessionClient({ access_token: 'stale' }, new Error('expired'))]) {
      await expect(schedulePreviewHeaders(new AbortController().signal, client)).rejects.toThrow('Sign in again')
    }
  })
  it('does not upload a replaced screenshot after session lookup completes', async () => {
    const controller = new AbortController()
    const client = { auth: { getSession: async () => {
      controller.abort()
      return { data: { session: { access_token: 'student-token' } }, error: null }
    } } } as unknown as SupabaseClient
    await expect(schedulePreviewHeaders(controller.signal, client)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
