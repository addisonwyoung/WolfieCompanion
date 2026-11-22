import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { privacyChangedEvent, privacySessionInvalid } from './studentPrivacy'
import type { SharedGroupWarning, StudentPrivacyApi, WarningContext } from './studentPrivacy'

function warningStore(api: StudentPrivacyApi | undefined, actor: string, context: WarningContext, group: string | null) {
  let active = false, revision = 0, running: Promise<void> | null = null, refreshQueued = false, lastFetch = -Infinity
  let state = { warnings: [] as SharedGroupWarning[], loading: !!group && !!api, error: '', pending: new Set<string>(), failed: new Set<string>() }
  const confirmed = new Set<string>(), listeners = new Set<() => void>(), requests = new Set<AbortController>()
  const publish = (next: Partial<typeof state>) => { state = { ...state, ...next }; listeners.forEach(fn => fn()) }
  async function refresh(force = false) {
    if (!active || !api || !group || document.visibilityState === 'hidden') return
    if (running || state.pending.size) { refreshQueued ||= force; return running }
    if (!force && Date.now() - lastFetch < 1000) return
    lastFetch = Date.now()
    const run = revision, controller = new AbortController()
    requests.add(controller)
    running = api.warnings(context, group, actor, controller.signal).then(rows => {
      if (active && run === revision) publish({ warnings: rows.filter(row => !confirmed.has(row.warning_id)), loading: false, error: '' })
    }, error => {
      if (active && run === revision) publish({ loading: false, error: 'Group privacy notices could not be refreshed. Please retry.', ...(error?.code === '42501' || privacySessionInvalid(error) ? { warnings: [] } : {}) })
    }).finally(() => {
      requests.delete(controller); running = null
      if (active && refreshQueued && !state.pending.size) { refreshQueued = false; void refresh(true) }
    })
    return running
  }
  return {
    snapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    start() { active = true; void refresh() },
    stop() { active = false; queueMicrotask(() => { if (!active) { revision++; requests.forEach(request => request.abort()) } }) },
    refresh,
    invalidate() {
      revision++
      lastFetch = -Infinity
      publish({ warnings: [], error: '', failed: new Set<string>(), loading: !!api && !!group })
      void refresh(true)
    },
    async dismiss(id: string) {
      if (!active || !api || !group || state.pending.has(id) || !state.warnings.some(row => row.warning_id === id)) return false
      revision++
      const controller = new AbortController(), failed = new Set(state.failed)
      failed.delete(id); requests.add(controller); publish({ pending: new Set(state.pending).add(id), failed })
      let succeeded = false
      try {
        await api.dismiss(id, actor, controller.signal)
        if (!active) return false
        confirmed.add(id); succeeded = true
        publish({ warnings: state.warnings.filter(row => row.warning_id !== id) })
        return true
      } catch (error) {
        if (active) publish(privacySessionInvalid(error) ? { warnings: [], error: 'Sign in again to view privacy notices.' } : { failed: new Set(state.failed).add(id) })
        return false
      } finally {
        requests.delete(controller)
        if (active) {
          const pending = new Set(state.pending); pending.delete(id); publish({ pending })
          if (succeeded) refreshQueued = true
          if (refreshQueued && !state.pending.size) { refreshQueued = false; void refresh(true) }
        }
      }
    },
  }
}

export function useSharedGroupWarnings(api: StudentPrivacyApi | undefined, actor: string, context: WarningContext, group: string | null) {
  const store = useMemo(() => warningStore(api, actor, context, group), [api, actor, context, group])
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  useEffect(() => {
    store.start()
    const refresh = () => { void store.refresh() }
    const changed = () => store.invalidate()
    const timer = window.setInterval(refresh, context === 'study' ? 15_000 : 10_000)
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh); window.addEventListener(privacyChangedEvent, changed)
    return () => {
      window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh); window.removeEventListener(privacyChangedEvent, changed); store.stop()
    }
  }, [store, context])
  return { ...state, dismiss: store.dismiss, retry: () => store.refresh(true) }
}
