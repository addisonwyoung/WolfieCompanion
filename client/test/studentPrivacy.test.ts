import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { studentPrivacyApi } from '../src/studentPrivacy'

const actor = '10000000-0000-0000-0000-000000000001'
const student = '10000000-0000-0000-0000-000000000002'
const group = '10000000-0000-0000-0000-000000000003'
const warning = '10000000-0000-0000-0000-000000000004'
function fake(data: unknown = []) {
  const response = vi.fn().mockResolvedValue({ data, error: null })
  const builder = { setHeader: vi.fn(), abortSignal: response, order: vi.fn(), range: vi.fn() }
  builder.setHeader.mockReturnValue(builder); builder.order.mockReturnValue(builder); builder.range.mockReturnValue(builder)
  const select = vi.fn().mockReturnValue(builder), from = vi.fn().mockReturnValue({ select })
  const rpc = vi.fn().mockReturnValue(builder)
  const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: actor }, access_token: 'original-session-token' } }, error: null })
  return { api: studentPrivacyApi({ rpc, from, auth: { getSession } } as unknown as SupabaseClient), rpc, from, select, response, builder, getSession }
}
const signal = () => new AbortController().signal

test('block mutations pin the initiating session and send only the target', async () => {
  const f = fake()
  await f.api.block(student, actor, signal()); await f.api.unblock(student, actor, signal())
  expect(f.rpc.mock.calls).toEqual([['block_student', { p_student_id: student }], ['unblock_student', { p_student_id: student }]])
  expect(f.builder.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer original-session-token')
  f.response.mockResolvedValue({ error: { message: 'internal block details' } })
  await expect(f.api.block(student, actor, signal())).rejects.toThrow('Please retry')
  await expect(f.api.block('forged', actor, signal())).rejects.toThrow('Invalid student')
  expect(f.rpc).toHaveBeenCalledTimes(3)
})

test('block listing uses only owner-protected snapshots; blank and null names stay unknown', async () => {
  const f = fake([{ blocked_id: student, created_at: '2026-11-19T00:00:00Z', blocked_name_snapshot: '  Saved name  ', email: 'private' }, { blocked_id: group, created_at: '2026-11-19T00:00:00Z', blocked_name_snapshot: null }, { blocked_id: warning, created_at: '2026-11-19T00:00:00Z', blocked_name_snapshot: '  ' }])
  const rows = await f.api.blocks(actor, signal())
  expect(f.from).toHaveBeenCalledWith('student_blocks')
  expect(f.select).toHaveBeenCalledWith('blocked_id,created_at,blocked_name_snapshot')
  expect(rows.map(row => row.name_snapshot)).toEqual(['Saved name', null, null])
  expect(rows[0]).not.toHaveProperty('email')
  expect(f.rpc).not.toHaveBeenCalled()
  f.response.mockResolvedValue({ data: [{ blocked_id: student, created_at: 'bad', blocked_name_snapshot: null }], error: null })
  await expect(f.api.blocks(actor, signal())).rejects.toThrow('could not be confirmed')
})

test('warning adapters use exact POST-default contracts and only authorized projection columns', async () => {
  const f = fake([{ warning_id: warning, blocked_student_id: student, name: 'Context name', email: 'hidden' }])
  expect(await f.api.warnings('messaging', group, actor, signal())).toEqual([{ warning_id: warning, blocked_student_id: student, name: 'Context name' }])
  await f.api.warnings('study', group, actor, signal()); await f.api.dismiss(warning, actor, signal())
  expect(f.rpc.mock.calls).toEqual([
    ['shared_group_warnings', { p_context: 'messaging', p_group_id: group }],
    ['shared_group_warnings', { p_context: 'study', p_group_id: group }],
    ['dismiss_shared_group_warning', { p_warning_id: warning }],
  ])
  expect(f.from).not.toHaveBeenCalled()
  f.response.mockResolvedValue({ data: [{ warning_id: 'bad' }], error: null })
  await expect(f.api.warnings('study', group, actor, signal())).rejects.toThrow('could not be confirmed')
})

test('logout, a different session and cancelled queued work cannot dispatch privacy RPCs', async () => {
  const f = fake()
  f.getSession.mockResolvedValue({ data: { session: null }, error: null })
  await expect(f.api.block(student, actor, signal())).rejects.toThrow('Sign in again')
  f.getSession.mockResolvedValue({ data: { session: { user: { id: student }, access_token: 'another-token' } }, error: null })
  await expect(f.api.dismiss(warning, actor, signal())).rejects.toThrow('Sign in again')
  f.getSession.mockResolvedValue({ data: { session: { user: { id: actor }, access_token: 'token' } }, error: null })
  const controller = new AbortController(); controller.abort()
  await expect(f.api.block(student, actor, controller.signal)).rejects.toThrow('Sign in again')
  expect(f.rpc).not.toHaveBeenCalled()
})

test('public directory accepts existing friends independently of course relationships', async () => {
  const { friendApi } = await import('../src/friendshipApi')
  const abortSignal = vi.fn().mockResolvedValue({ data: [{ student_id: student, name: 'Public friend', major: 'History', has_shared_avatar: false, relationship: 'accepted' }], error: null })
  const rpc = vi.fn().mockReturnValue({ abortSignal })
  expect((await friendApi({ rpc } as unknown as SupabaseClient).directory(new AbortController().signal))[0].relationship).toBe('accepted')
  expect(rpc).toHaveBeenCalledWith('friend_directory')
})
