import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { privacyChangedEvent, privacySessionInvalid } from './studentPrivacy'
import type { BlockedStudent, StudentPrivacyApi } from './studentPrivacy'

function blockStore(api: StudentPrivacyApi, actor: string | null) {
  let active = false, generation = 0, running: Promise<void> | null = null, again = false, initialized = false
  let state = { blocks: [] as BlockedStudent[], outgoing: new Set<string>(), loading: !!actor, error: '', busy: new Set<string>() }
  const listeners = new Set<() => void>(), requests = new Set<AbortController>()
  const publish = (next: Partial<typeof state>) => { state = { ...state, ...next }; listeners.forEach(fn => fn()) }
  async function refresh(force = false) {
    if (!active || !actor) return
    if (running) { again ||= force; return running }
    const run = generation, controller = new AbortController()
    requests.add(controller); publish({ loading: true })
    running = api.blocks(actor, controller.signal).then(blocks => {
      if (active && run === generation) {
        const outgoing = new Set(blocks.map(row => row.student_id))
        const changed = initialized && (outgoing.size !== state.outgoing.size || [...outgoing].some(id => !state.outgoing.has(id)))
        initialized = true
        publish({ blocks, outgoing, error: '' })
        if (changed) window.dispatchEvent(new Event(privacyChangedEvent))
      }
    }, error => { if (active && run === generation) publish({ error: 'Blocked students could not be refreshed. Please retry.', ...(privacySessionInvalid(error) ? { blocks: [], outgoing: new Set<string>() } : {}) }) }).finally(() => {
      requests.delete(controller); running = null
      if (active && run === generation) publish({ loading: false })
      if (active && again) { again = false; void refresh() }
    })
    return running
  }
  return {
    snapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    start() { active = true; if (!running) void refresh() },
    stop() {
      active = false
      // StrictMode's cleanup/setup pair shares its in-flight operation. A real
      // logout/unmount aborts queued work without treating cancellation as rollback.
      queueMicrotask(() => { if (!active) { generation++; requests.forEach(request => request.abort()) } })
    },
    refresh,
    async mutate(student: string, blocked: boolean) {
      if (!active || !actor || state.busy.size) return false
      const run = ++generation, controller = new AbortController()
      requests.add(controller); publish({ busy: new Set(state.busy).add(student) })
      try {
        await (blocked ? api.block : api.unblock)(student, actor, controller.signal)
        if (!active || run !== generation) return false
        generation++
        const outgoing = new Set(state.outgoing)
        if (blocked) outgoing.add(student); else outgoing.delete(student)
        publish({ outgoing, blocks: blocked ? state.blocks : state.blocks.filter(row => row.student_id !== student) })
        window.dispatchEvent(new Event(privacyChangedEvent))
        void refresh(true)
        return true
      } catch (error) {
        if (active && privacySessionInvalid(error)) publish({ blocks: [], outgoing: new Set<string>(), error: 'Sign in again to manage blocked students.' })
        throw error
      } finally {
        requests.delete(controller)
        if (active) { const busy = new Set(state.busy); busy.delete(student); publish({ busy }) }
      }
    },
  }
}

export function useStudentPrivacy(api: StudentPrivacyApi, actor: string | null) {
  const store = useMemo(() => blockStore(api, actor), [api, actor])
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  useEffect(() => {
    store.start()
    const focus = () => { if (document.visibilityState !== 'hidden') void store.refresh() }
    window.addEventListener('focus', focus)
    return () => { window.removeEventListener('focus', focus); store.stop() }
  }, [store])
  return { ...state, refresh: store.refresh, mutate: store.mutate }
}
export type StudentPrivacyController = ReturnType<typeof useStudentPrivacy>
