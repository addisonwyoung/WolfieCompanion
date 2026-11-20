import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { studentPrivacyApi } from '../src/studentPrivacy'

const student = '10000000-0000-0000-0000-000000000002'
test('block mutations supply only the target, preserve retry failures and do not auto-restore relationships', async () => {
  const rpc = vi.fn().mockResolvedValue({ error: null })
  const api = studentPrivacyApi({ rpc } as unknown as SupabaseClient)
  await api.block(student); await api.unblock(student)
  expect(rpc.mock.calls).toEqual([['block_student', { p_student_id: student }], ['unblock_student', { p_student_id: student }]])
  rpc.mockResolvedValue({ error: { message: 'internal block details' } })
  await expect(api.block(student)).rejects.toThrow('Please retry')
  await expect(api.block('forged')).rejects.toThrow('Invalid student')
  expect(rpc).toHaveBeenCalledTimes(3)
})

test('block listing requests only owner-protected minimal fields and rejects malformed projections', async () => {
  const abortSignal = vi.fn().mockResolvedValue({ data: [{ blocked_id: student, created_at: '2026-11-19T00:00:00Z', email: 'private' }], error: null })
  const select = vi.fn().mockReturnValue({ abortSignal })
  const api = studentPrivacyApi({ from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient)
  const rows = await api.blocks(new AbortController().signal)
  expect(select).toHaveBeenCalledWith('blocked_id,created_at')
  expect(rows).toEqual([{ student_id: student, created_at: '2026-11-19T00:00:00Z' }])
  abortSignal.mockResolvedValue({ data: [{ blocked_id: 'bad', created_at: 'bad' }], error: null })
  await expect(api.blocks(new AbortController().signal)).rejects.toThrow('Invalid blocked student')
})


test('public directory accepts existing friends independently of course relationships', async () => {
  const { friendApi } = await import('../src/friendshipApi')
  const abortSignal = vi.fn().mockResolvedValue({ data: [{ student_id: student, name: 'Public friend', major: 'History', has_shared_avatar: false, relationship: 'accepted' }], error: null })
  const rpc = vi.fn().mockReturnValue({ abortSignal })
  expect((await friendApi({ rpc } as unknown as SupabaseClient).directory(new AbortController().signal))[0].relationship).toBe('accepted')
  expect(rpc).toHaveBeenCalledWith('friend_directory')
})
