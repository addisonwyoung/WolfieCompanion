import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { CampusLocationError } from '../src/campusLocations'
import type { CampusLocation, CampusLocationsApi } from '../src/campusLocations'
import { useCampusLocations } from '../src/useCampusLocations'

// Lifecycle fixtures stay local; the hook never supplies synthetic live data.
const published = { id: 'published', status: 'published', revision: 1 } as CampusLocation
const draft = { id: 'draft', status: 'draft', revision: 1 } as CampusLocation
function api() {
  return { load: vi.fn().mockResolvedValue([published]), canManage: vi.fn().mockResolvedValue(true), save: vi.fn(), remove: vi.fn() } satisfies CampusLocationsApi
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
test('distinguishes empty/error, retains stale published data and retries on foreground', async () => {
  const f = api()
  const { result } = renderHook(() => useCampusLocations(f, 'a'))
  await waitFor(() => expect(result.current.status).toBe('success'))
  f.load.mockRejectedValueOnce(new Error('offline'))
  await act(() => result.current.refresh())
  expect(result.current).toMatchObject({ status: 'error', stale: true, items: [published] })
  f.load.mockResolvedValue([])
  await act(() => result.current.refresh())
  expect(result.current).toMatchObject({ status: 'success', stale: false, items: [] })
  const calls = f.load.mock.calls.length
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  await waitFor(() => expect(f.load.mock.calls.length).toBe(calls + 1))
})
test('ignores superseded requests and old-account responses, clears on logout', async () => {
  const f = api(), slow = deferred<CampusLocation[]>()
  f.load.mockReturnValueOnce(slow.promise)
  const { result, rerender } = renderHook(({ user }) => useCampusLocations(f, user), { initialProps: { user: 'a' as string | null } })
  await act(() => result.current.refresh())
  expect(result.current.items).toEqual([published])
  await act(async () => { slow.resolve([draft]); await slow.promise })
  expect(result.current.items).toEqual([published])
  const old = deferred<CampusLocation[]>()
  f.load.mockReturnValueOnce(old.promise)
  act(() => { void result.current.refresh() })
  rerender({ user: 'b' })
  await waitFor(() => expect(result.current.status).toBe('success'))
  await act(async () => { old.resolve([draft]); await old.promise })
  expect(result.current.items).toEqual([published])
  rerender({ user: null })
  expect(result.current.items).toEqual([])
  expect(result.current.canManage).toBe(false)
})
test('capability failures fail closed and hide retained drafts', async () => {
  const f = api()
  f.load.mockResolvedValue([published, draft])
  const { result } = renderHook(() => useCampusLocations(f, 'a'))
  await waitFor(() => expect(result.current.items).toHaveLength(2))
  f.canManage.mockRejectedValue(new Error('unavailable')); f.load.mockRejectedValue(new Error('offline'))
  await act(() => result.current.refresh())
  expect(result.current.canManage).toBe(false)
  expect(result.current.items).toEqual([published])
  expect(result.current.capabilityError).toBe('unavailable')
})
test('mutation preserves caller drafts, rejects duplicates and rechecks revoked capability', async () => {
  const f = api(), pending = deferred<CampusLocation>()
  const { result } = renderHook(() => useCampusLocations(f, 'a'))
  await waitFor(() => expect(result.current.canManage).toBe(true))
  const write = vi.fn(() => pending.promise), duplicate = vi.fn()
  let mutation!: Promise<boolean>
  act(() => { mutation = result.current.mutate(write) })
  await act(async () => { expect(await result.current.mutate(duplicate)).toBe(false) })
  await act(async () => { pending.resolve({ ...published, revision: 2 }); await mutation })
  expect(duplicate).not.toHaveBeenCalled()
  expect(result.current.items[0].revision).toBe(2)
  f.canManage.mockResolvedValue(false)
  await act(async () => {
    expect(await result.current.mutate(() => Promise.reject(new CampusLocationError('permission', 'revoked')))).toBe(false)
  })
  expect(result.current).toMatchObject({ canManage: false, busy: false, message: 'revoked' })
})

test('late mutation cannot populate a different account or inactive view', async () => {
  const f = api(), pending = deferred<CampusLocation>()
  const { result, rerender } = renderHook(({ user, active }) => useCampusLocations(f, user, active), { initialProps: { user: 'a', active: true } })
  await waitFor(() => expect(result.current.canManage).toBe(true))
  let mutation!: Promise<boolean>
  act(() => { mutation = result.current.mutate(() => pending.promise) })
  rerender({ user: 'b', active: true })
  await waitFor(() => expect(result.current.canManage).toBe(true))
  await act(async () => { pending.resolve(draft); expect(await mutation).toBe(false) })
  expect(result.current.items).toEqual([published])
  rerender({ user: 'b', active: false })
  const calls = f.load.mock.calls.length
  await act(() => result.current.refresh())
  expect(f.load).toHaveBeenCalledTimes(calls)
  expect(result.current.canManage).toBe(false)
})
