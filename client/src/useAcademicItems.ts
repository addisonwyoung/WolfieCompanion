import { useCallback, useEffect, useRef, useState } from 'react'
import type { AcademicApi, AcademicItem } from './academicItems'

// Mounted only within a workspace keyed to the current user. Cleanup invalidates every response.
export function useAcademicItems(api: AcademicApi) {
  const [items, setItems] = useState<AcademicItem[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading')
  const [message, setMessage] = useState('')
  const [actionFailed, setActionFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  const saving = useRef(false)
  useEffect(() => {
    const run = ++generation.current
    void api.load().then(data => {
      if (run === generation.current) { setItems(data); setStatus('success') }
    }, error => {
      if (run === generation.current) { setStatus('error'); setMessage((error as Error).message) }
    })
    // This is a request generation, not a DOM node reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++ }
  }, [api, attempt])
  const retry = useCallback(() => { setStatus('loading'); setMessage(''); setAttempt(n => n + 1) }, [])
  async function mutate(operation: () => Promise<AcademicItem | void>, success: string, deletedId?: string) {
    if (saving.current) return false
    saving.current = true; setBusy(true); setMessage(''); setActionFailed(false)
    const run = generation.current
    try {
      const item = await operation()
      if (run !== generation.current) return false
      setItems(previous => item ? [...previous.filter(i => i.id !== item.id), item] : previous.filter(i => i.id !== deletedId))
      setMessage(success)
      return true
    } catch (error) {
      if (run === generation.current) { setMessage((error as Error).message); setActionFailed(true) }
      return false
    } finally {
      if (run === generation.current) { saving.current = false; setBusy(false) }
    }
  }
  return { items, status, message, actionFailed, busy, retry, mutate }
}
