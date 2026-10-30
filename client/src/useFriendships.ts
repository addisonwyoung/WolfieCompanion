import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FriendApi, FriendRelationship, FriendRequest, FriendStudent } from './friendshipApi'

export type LoadState<T> = { status: 'idle' | 'loading' | 'success' | 'error'; data: T[] }
const empty = <T,>(): LoadState<T> => ({ status: 'idle', data: [] })
export function useFriendships(api: FriendApi, client: SupabaseClient, userId: string | null, course: string | null, section: string | null, friendCourses: string[] = []) {
  const [attempt, setAttempt] = useState(0)
  const [inbox, setInbox] = useState<LoadState<FriendRequest>>(empty())
  const [relationships, setRelationships] = useState<LoadState<FriendRelationship>>(empty())
  const [friends, setFriends] = useState<LoadState<FriendStudent>>(empty())
  const [inboxOwner, setInboxOwner] = useState('')
  const [peopleOwner, setPeopleOwner] = useState('')
  const [friendsOwner, setFriendsOwner] = useState('')
  const inboxOwnerRef = useRef('')
  const peopleOwnerRef = useRef('')
  const friendsOwnerRef = useRef('')
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [busyOwner, setBusyOwner] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionOwner, setActionOwner] = useState('')
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null)
  const currentUserRef = useRef(userId)
  currentUserRef.current = userId
  const refresh = useCallback(() => setAttempt(value => value + 1), [])
  const inboxKey = userId ?? ''
  const peopleKey = userId && course && section ? `${userId}:${course}:${section}` : ''
  const normalizedFriendCoursesKey = JSON.stringify([...new Set(friendCourses)].sort())
  const friendsKey = userId ? JSON.stringify([userId, normalizedFriendCoursesKey]) : ''
  const visibleInbox = inboxOwner === inboxKey ? inbox : userId ? { status: 'loading' as const, data: [] } : empty<FriendRequest>()
  const visibleRelationships = peopleOwner === peopleKey ? relationships : peopleKey ? { status: 'loading' as const, data: [] } : empty<FriendRelationship>()
  const visibleFriends = friendsOwner === friendsKey ? friends : userId ? { status: 'loading' as const, data: [] } : empty<FriendStudent>()
  useEffect(() => {
    if (!userId) { inboxOwnerRef.current = ''; peopleOwnerRef.current = ''; friendsOwnerRef.current = ''; return }
    const controller = new AbortController()
    const sameInbox = inboxOwnerRef.current === userId
    const nextPeopleOwner = course && section ? `${userId}:${course}:${section}` : ''
    const samePeople = peopleOwnerRef.current === nextPeopleOwner
    inboxOwnerRef.current = userId; peopleOwnerRef.current = nextPeopleOwner
    setInbox(previous => ({ status: 'loading', data: sameInbox ? previous.data : [] }))
    void api.inbox(controller.signal).then(data => { if (!controller.signal.aborted) { setInbox({ status: 'success', data }); setInboxOwner(userId) } }, () => { if (!controller.signal.aborted) { setInbox(previous => ({ status: 'error', data: previous.data })); setInboxOwner(userId) } })
    if (course && section) {
      setRelationships(previous => ({ status: 'loading', data: samePeople ? previous.data : [] }))
      void api.relationships(course, section, controller.signal).then(data => { if (!controller.signal.aborted) { setRelationships({ status: 'success', data }); setPeopleOwner(nextPeopleOwner) } }, () => { if (!controller.signal.aborted) { setRelationships(previous => ({ status: 'error', data: previous.data })); setPeopleOwner(nextPeopleOwner) } })
    } else setRelationships(empty())
    return () => controller.abort()
  }, [api, userId, course, section, attempt])
  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    const sameOwner = friendsOwnerRef.current === friendsKey
    friendsOwnerRef.current = friendsKey
    setFriends(previous => ({ status: 'loading', data: sameOwner ? previous.data : [] }))
    void api.friends(JSON.parse(normalizedFriendCoursesKey) as string[], controller.signal).then(data => {
      if (!controller.signal.aborted) { setFriends({ status: 'success', data }); setFriendsOwner(friendsKey) }
    }, () => {
      if (!controller.signal.aborted) { setFriends(previous => ({ status: 'error', data: previous.data })); setFriendsOwner(friendsKey) }
    })
    return () => controller.abort()
  }, [api, userId, friendsKey, normalizedFriendCoursesKey, attempt])
  useEffect(() => {
    if (!userId) return
    const refreshOnFocus = () => refresh()
    window.addEventListener('focus', refreshOnFocus)
    if (typeof client.channel !== 'function') return () => window.removeEventListener('focus', refreshOnFocus)
    const channel = client.channel(`friend-state-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, payload => {
        const row = (payload.new ?? payload.old) as Record<string, unknown>
        if (row.sender_id === userId || row.recipient_id === userId) refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, payload => {
        const row = (payload.new ?? payload.old) as Record<string, unknown>
        if (row.user_id === userId || row.friend_id === userId) refresh()
      }).subscribe()
    return () => { window.removeEventListener('focus', refreshOnFocus); void client.removeChannel(channel) }
  }, [client, userId, refresh])
  const incomingCount = visibleInbox.data.length
  async function act(id: string, operation: () => Promise<void>, confirmed?: () => void) {
    const actor = userId
    if (!actor || (busyOwner === actor && busyIds.has(id))) return
    setActionError(''); setActionOwner(actor); setBusyOwner(actor); setRetryAction(null); setBusyIds(previous => busyOwner === actor ? new Set(previous).add(id) : new Set([id]))
    try { await operation(); if (currentUserRef.current !== actor) return; confirmed?.(); setRetryAction(null); refresh() }
    catch (error) { if (currentUserRef.current !== actor) return; setActionError(error instanceof Error ? error.message : 'Friend action failed. Please retry.'); setRetryAction(() => () => { void act(id, operation, confirmed) }) }
    finally { if (currentUserRef.current === actor) setBusyIds(previous => { const next = new Set(previous); next.delete(id); return next }) }
  }
  const relationshipById = useMemo(() => new Map(visibleRelationships.data.map(row => [row.student_id, row])), [visibleRelationships.data])
  function send(courseCode: string, sectionCode: string, student: string) {
    const actor = userId
    return act(student, async () => { const requestId = await api.send(courseCode, sectionCode, student); if (actor && currentUserRef.current === actor) setRelationships(previous => ({ ...previous, data: previous.data.map(row => row.student_id === student ? { ...row, relationship: 'outgoing_pending', request_id: requestId } : row) })) })
  }
  function respond(request: string, action: 'accept' | 'decline') {
    const incoming = visibleInbox.data.find(item => item.request_id === request)
    return act(request, () => api.respond(request, action), () => {
      setInbox(previous => ({ ...previous, data: previous.data.filter(item => item.request_id !== request) }))
      if (incoming) setRelationships(previous => ({ ...previous, data: previous.data.map(row => row.student_id === incoming.sender_id ? { ...row, relationship: action === 'accept' ? 'accepted' : 'declined', request_id: request } : row) }))
    })
  }
  function unfriend(student: string) {
    return act(student, () => api.unfriend(student), () => {
      setFriends(previous => ({ ...previous, data: previous.data.filter(friend => friend.student_id !== student) }))
      setRelationships(previous => ({ ...previous, data: previous.data.map(row => row.student_id === student ? { ...row, relationship: 'none', request_id: null } : row) }))
    })
  }
  const visibleBusyIds = busyOwner === userId ? busyIds : new Set<string>()
  const visibleActionError = actionOwner === userId ? actionError : ''
  return { inbox: visibleInbox, relationships: visibleRelationships, friends: visibleFriends, incomingCount, relationshipById, busyIds: visibleBusyIds, actionError: visibleActionError, clearError: () => setActionError(''), retryAction: actionOwner === userId ? retryAction : null, send, respond, unfriend, retry: refresh }
}
