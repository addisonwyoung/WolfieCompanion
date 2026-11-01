import { afterEach, expect, test, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

const state = vi.hoisted(() => ({ client: null as SupabaseClient | null }))
vi.mock('../src/account', () => ({ get supabase() { return state.client } }))
import { checkCampusSession } from '../src/campusSessionCheck'

afterEach(() => { state.client = null; vi.unstubAllEnvs(); vi.restoreAllMocks() })

function setup(capability: unknown = true) {
  vi.stubEnv('DEV', true)
  const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'synthetic-session-token', user: { role: 'authenticated' } } }, error: null })
  const rpc = vi.fn().mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: capability, error: null })
  state.client = { auth: { getSession }, rpc } as unknown as SupabaseClient
  return { getSession, rpc }
}

test.each([true, false])('checks eligible editor=%s on the same authenticated client', async expected => {
  const f = setup(expected)
  expect(await checkCampusSession(expected)).toEqual({ passed: true, eligible: true, canManage: expected })
  expect(f.getSession).toHaveBeenCalledOnce()
  expect(f.rpc.mock.calls).toEqual([['account_is_eligible'], ['campus_locations_can_manage']])
})

test('reports a capability mismatch without identities or tokens', async () => {
  setup(false)
  expect(await checkCampusSession(true)).toEqual({ passed: false, eligible: true, canManage: false })
})

test('blocks production, missing configuration and signed-out or privileged sessions', async () => {
  const f = setup()
  vi.stubEnv('DEV', false)
  await expect(checkCampusSession(true)).rejects.toThrow('development-only')
  expect(f.getSession).not.toHaveBeenCalled()
  vi.stubEnv('DEV', true)
  state.client = null
  await expect(checkCampusSession(true)).rejects.toThrow('Configure')
  state.client = { auth: { getSession: f.getSession }, rpc: f.rpc } as unknown as SupabaseClient
  for (const session of [null, { access_token: 'synthetic-privileged-token', user: { role: 'service_role' } }]) {
    f.getSession.mockResolvedValueOnce({ data: { session }, error: null })
    await expect(checkCampusSession(true)).rejects.toThrow('Sign in')
  }
  expect(f.rpc).not.toHaveBeenCalled()
})

test('does not pass an ineligible account, malformed result or RPC failure', async () => {
  for (const result of [
    { data: false, error: null },
    { data: null, error: { message: 'sensitive backend detail' } },
  ]) {
    const f = setup()
    f.rpc.mockReset().mockResolvedValueOnce(result)
    await expect(checkCampusSession(false)).rejects.toThrow('could not complete')
    expect(f.rpc).toHaveBeenCalledTimes(1)
  }
  setup('false')
  await expect(checkCampusSession(false)).rejects.toThrow('could not complete')
  const f = setup()
  f.rpc.mockReset().mockResolvedValueOnce({ data: true, error: null }).mockRejectedValueOnce(new Error('sensitive backend detail'))
  await expect(checkCampusSession(true)).rejects.toThrow(/^Campus session check could not complete\./)
})

test('installed SDK sends the session bearer token, with the publishable key only as apikey', async () => {
  vi.stubEnv('DEV', true)
  const token = 'synthetic-user-jwt'
  const key = 'sb_publishable_synthetic_test_key'
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${token}`)
    expect(headers.get('apikey')).toBe(key)
    return new Response('true', { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const client = createClient('https://campus-session.test', key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  })
  vi.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: token, user: { role: 'authenticated' } } as Session }, error: null })
  state.client = client
  expect(await checkCampusSession(true)).toEqual({ passed: true, eligible: true, canManage: true })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
    'https://campus-session.test/rest/v1/rpc/account_is_eligible',
    'https://campus-session.test/rest/v1/rpc/campus_locations_can_manage',
  ])
})
