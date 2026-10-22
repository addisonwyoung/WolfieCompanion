import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import { accountApi } from './account'
import type { StudentProfile, ClassRow, PictureChange, SavedCourse } from './account'

type State = { status: 'loading' | 'signed-out' | 'ineligible' | 'error' | 'ready'; userId: string | null; profile: StudentProfile | null; courses: SavedCourse[]; message: string }
const empty: State = { status: 'loading', userId: null, profile: null, courses: [], message: '' }
export function useAccount(client: SupabaseClient) {
  const api = useMemo(() => accountApi(client), [client])
  const [state, setState] = useState<State>(empty)
  const [cleanupPaths, setCleanupPaths] = useState<string[]>([])
  const generation = useRef(0)
  const mounted = useRef(false)
  const identity = useRef<string | null>(null)
  const denied = useRef(false)
  const callbackError = useRef(new URLSearchParams(window.location.search).has('error') || new URLSearchParams(window.location.hash.slice(1)).has('error'))
  const hydrate = useCallback(async (session: Session | null) => {
    const run = ++generation.current
    const active = () => mounted.current && run === generation.current
    const nextId = session?.user.id ?? null
    if (identity.current !== nextId) { identity.current = nextId; setCleanupPaths([]) }
    if (!session) { if (active()) setState({ ...empty, status: denied.current ? 'ineligible' : 'signed-out', message: denied.current ? 'Use a verified @stonybrook.edu Google account to continue.' : callbackError.current ? 'Google sign-in was canceled or could not finish. Please try again.' : '' }); return }
    denied.current = false
    setState({ ...empty, userId: nextId })
    try {
      if (!await api.eligible()) {
        if (active()) {
          denied.current = true
          // Sign out first; its auth event clears all private state as well.
          await client.auth.signOut({ scope: 'local' })
          if (mounted.current && identity.current === null) setState({ ...empty, status: 'ineligible', message: 'Use a verified @stonybrook.edu Google account to continue.' })
        }
        return
      }
      const data = await api.load()
      if (active()) setState({ status: 'ready', userId: nextId, ...data, message: '' })
    } catch (error) {
      if (active()) setState({ ...empty, status: 'error', userId: nextId, message: error instanceof Error ? error.message : 'Unable to load your workspace. Please retry.' })
    }
  }, [api, client])
  useEffect(() => {
    mounted.current = true
    let authEvent = false
    let disposed = false
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.user.id === identity.current) return
      authEvent = true
      // Invalidate immediately, but keep async Supabase work outside the auth callback lock.
      generation.current++
      if (identity.current !== (session?.user.id ?? null) || !session) setState({ ...empty, status: session ? 'loading' : 'signed-out' })
      const timer = setTimeout(() => { timers.delete(timer); void hydrate(session) }, 0)
      timers.add(timer)
    })
    void client.auth.getSession().then(({ data, error }) => {
      if (window.location.pathname === '/auth/callback') window.history.replaceState({}, '', '/')
      if (disposed || !mounted.current || authEvent) return
      const params = new URLSearchParams(window.location.search)
      const hash = new URLSearchParams(window.location.hash.slice(1))
      if (error || callbackError.current || params.has('error') || hash.has('error')) {
        setState({ ...empty, status: 'signed-out', message: 'Google sign-in was canceled or could not finish. Please try again.' })
      } else void hydrate(data.session)
    }).catch(() => { if (!disposed && mounted.current && !authEvent) setState({ ...empty, status: 'signed-out', message: 'Unable to restore sign-in. Please try again.' }) })
    return () => {
      disposed = true
      mounted.current = false
      // This counter invalidates requests, rather than identifying a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++
      subscription.unsubscribe(); timers.forEach(clearTimeout)
    }
  }, [client, hydrate])
  async function saveProfile(profile: StudentProfile, picture?: PictureChange) {
    const run = generation.current
    try {
      const result = await api.saveProfile(profile, picture)
      if (!mounted.current || run !== generation.current) return
      setState(previous => ({ ...previous, profile: result.profile }))
      if (result.cleanupPath) setCleanupPaths(previous => [...new Set([...previous, result.cleanupPath!])])
    } catch (error) {
      if (run !== generation.current || !mounted.current) return
      if (error instanceof Error && 'cleanupPath' in error && typeof error.cleanupPath === 'string') setCleanupPaths(previous => [...new Set([...previous, error.cleanupPath as string])])
      throw error
    }
  }
  async function saveClasses(rows: ClassRow[]) {
    const run = generation.current
    const courses = await api.saveClasses(rows)
    if (mounted.current && run === generation.current) setState(previous => ({ ...previous, courses }))
  }
  async function signIn() {
    denied.current = false; callbackError.current = false
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { hd: 'stonybrook.edu', prompt: 'select_account' } } })
    if (error) throw new Error('Google sign-in could not start. Please try again.')
  }
  async function signOut() {
    denied.current = false; callbackError.current = false
    generation.current++; identity.current = null; setCleanupPaths([]); setState({ ...empty, status: 'signed-out' })
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) throw new Error('Sign-out failed. Please retry before leaving this browser.')
  }
  async function retryCleanup() {
    const run = generation.current
    const remaining: string[] = []
    for (const path of cleanupPaths) { try { await api.removeObject(path) } catch { remaining.push(path) } }
    if (mounted.current && run === generation.current) setCleanupPaths(remaining)
  }
  return { ...state, api, saveProfile, saveClasses, signIn, signOut, retryCleanup, cleanupPaths, retry: async () => { const { data } = await client.auth.getSession(); await hydrate(data.session) } }
}
