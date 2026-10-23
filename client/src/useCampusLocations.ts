import { useCallback, useEffect, useRef, useState } from 'react'
import { CampusLocationError } from './campusLocations'
import type { CampusLocation, CampusLocationsApi } from './campusLocations'

type State = { userId: string | null; items: CampusLocation[]; status: 'loading' | 'success' | 'error'; stale: boolean; canManage: boolean; message: string; capabilityError: string; busy: boolean }
const empty = (userId: string | null): State => ({ userId, items: [], status: 'loading', stale: false, canManage: false, message: '', capabilityError: '', busy: false })

// Future view passes a resolved eligible user ID, null on logout, and active=false
// while hidden. No map/UI subscription or polling is introduced by this hook.
export function useCampusLocations(api: CampusLocationsApi, userId: string | null, active = true) {
  const [state, setState] = useState<State>(() => empty(userId))
  const lifetime = useRef(0)
  const request = useRef(0)
  const saving = useRef(false)
  const current = useRef<State>(state)
  useEffect(() => { current.current = state }, [state])
  const invalidate = useCallback(() => { lifetime.current++; request.current++ }, [])

  const refresh = useCallback(async () => {
    if (!userId || !active) return
    const scope = lifetime.current
    const run = ++request.current
    // A new capability check always fails closed while pending.
    setState(previous => ({ ...(previous.userId === userId ? previous : empty(userId)), canManage: false, capabilityError: '' }))
    const [locations, capability] = await Promise.allSettled([api.load(), api.canManage()])
    if (scope !== lifetime.current || run !== request.current) return
    const canManage = capability.status === 'fulfilled' && capability.value === true
    setState(previous => {
      const items = locations.status === 'fulfilled' ? locations.value : previous.items
      return { ...previous, userId, items: canManage ? items : items.filter(item => item.status === 'published'),
        canManage, status: locations.status === 'fulfilled' ? 'success' : 'error',
        stale: locations.status === 'rejected' && items.length > 0,
        message: locations.status === 'rejected' ? (locations.reason as Error).message : '',
        capabilityError: capability.status === 'rejected' ? (capability.reason as Error).message : '' }
    })
  }, [api, userId, active])

  useEffect(() => {
    lifetime.current++; saving.current = false
    if (current.current.userId !== userId) setState(empty(userId))
    else setState(previous => ({ ...previous, busy: false, canManage: false }))
    void refresh()
    function foreground() { if (document.visibilityState === 'visible') void refresh() }
    if (userId && active) document.addEventListener('visibilitychange', foreground)
    return () => { invalidate(); document.removeEventListener('visibilitychange', foreground) }
  }, [refresh, userId, active, invalidate])

  async function mutate(operation: () => Promise<CampusLocation | void>, deletedId?: string) {
    if (!userId || !active || saving.current || state.userId !== userId || !state.canManage) return false
    saving.current = true
    const scope = lifetime.current
    // Invalidate older reads so they cannot overwrite this mutation's result.
    request.current++
    setState(previous => ({ ...previous, busy: true, message: '' }))
    try {
      const item = await operation()
      if (scope !== lifetime.current) return false
      request.current++
      setState(previous => ({ ...previous, items: item ? [...previous.items.filter(row => row.id !== item.id), item] : previous.items.filter(row => row.id !== deletedId), message: item ? 'Location saved.' : 'Location removed.', stale: false }))
      return true
    } catch (error) {
      if (scope !== lifetime.current) return false
      setState(previous => ({ ...previous, message: (error as Error).message }))
      if (error instanceof CampusLocationError && (error.kind === 'permission' || error.kind === 'conflict')) {
        // Zero-row RLS and stale revisions can look identical. Refresh capability,
        // never retry the write, and leave the caller's draft untouched.
        setState(previous => ({ ...previous, canManage: false }))
        try {
          const allowed = await api.canManage()
          if (scope === lifetime.current) setState(previous => ({ ...previous, canManage: allowed, items: allowed ? previous.items : previous.items.filter(row => row.status === 'published') }))
        } catch {
          if (scope === lifetime.current) setState(previous => ({ ...previous, canManage: false, items: previous.items.filter(row => row.status === 'published'), capabilityError: 'Unable to confirm editing permission. Refresh to retry.' }))
        }
      }
      return false
    } finally {
      if (scope === lifetime.current) { saving.current = false; setState(previous => ({ ...previous, busy: false })) }
    }
  }
  return { ...(state.userId === userId && userId ? state : empty(userId)), canManage: !!userId && active && state.userId === userId && state.canManage, refresh, mutate }
}
