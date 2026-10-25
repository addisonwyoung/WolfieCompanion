import './academicDialogSupport'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import FriendRequests from '../src/FriendRequests'
import Friends from '../src/Friends'
import CourseBrowser from '../src/CourseBrowser'
import { friendApi } from '../src/friendshipApi'
import type { FriendApi, FriendRequest, FriendRelationship, FriendStudent } from '../src/friendshipApi'
import type { StudentProfile } from '../src/account'
import { useFriendships } from '../src/useFriendships'

const incoming: FriendRequest[] = [{ request_id: 'request-1', sender_id: 'student-1', sender_name: 'Avery Student', sender_major: 'Computer Science', created_at: '2026-10-22T12:00:00Z' }]
const profile: StudentProfile = { id: 'caller', name: 'Caller', major: 'Computer Science', year: 'Third year', interests: [], residence_status: null, avatar_path: null }
const peer = { student_id: 'peer', name: 'Peer Student', major: 'Computer Science', year: null, interests: null, residence_status: null, shared_courses: ['CSE 310'] }
const baseBrowser = { enrolledCourses: [{ id: 'cse-310', code: 'CSE 310' }], selectedId: 'cse-310' as const, onSelect: vi.fn(), onAddClasses: vi.fn(), onRetry: vi.fn(), profile, roster: { status: 'success' as const, classmates: [] } }

describe('friend request inbox', () => {
  it('shows the pending count, sender summary, profile action, and accept/decline controls', () => {
    const onRespond = vi.fn(), onViewProfile = vi.fn()
    render(<FriendRequests incoming={incoming} loading={false} error={false} busyIds={new Set()} onRespond={onRespond} onViewProfile={onViewProfile} onRetry={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Friend requests/ }))
    expect(screen.getByRole('dialog', { name: 'Friend requests' })).toBeInTheDocument()
    expect(screen.getByText('Avery Student')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'Friend requests' })
    const close = screen.getByRole('button', { name: 'Close friend requests' })
    const decline = screen.getByRole('button', { name: 'Decline' })
    decline.focus(); fireEvent.keyDown(dialog, { key: 'Tab' }); expect(close).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true }); expect(decline).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'View profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(onViewProfile).toHaveBeenCalledWith('student-1')
    expect(onRespond).toHaveBeenNthCalledWith(1, 'request-1', 'accept')
    expect(onRespond).toHaveBeenNthCalledWith(2, 'request-1', 'decline')
  })

  it('has distinct loading, failure, and empty states', () => {
    const props = { incoming: [], busyIds: new Set<string>(), onRespond: vi.fn(), onViewProfile: vi.fn(), onRetry: vi.fn() }
    const { rerender } = render(<FriendRequests {...props} loading error={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Friend requests/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading friend requests')
    rerender(<FriendRequests {...props} loading={false} error />)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load friend requests')
    fireEvent.click(screen.getByRole('button', { name: 'Retry friend requests' }))
    expect(props.onRetry).toHaveBeenCalledOnce()
    rerender(<FriendRequests {...props} loading={false} error={false} />)
    expect(screen.getByText('You have no pending friend requests.')).toBeInTheDocument()
  })
})

describe('friends list', () => {
  it('shows accepted friends in a popup and opens their privacy-filtered profile', () => {
    const onViewProfile = vi.fn()
    const friend: FriendStudent = { ...peer, student_id: 'friend', name: 'Accepted Friend', has_shared_avatar: false }
    const otherFriend: FriendStudent = { ...peer, student_id: 'friend-2', name: 'Morgan Student', has_shared_avatar: false }
    const onUnfriend = vi.fn()
    const api = { directory: vi.fn(async () => []), sendToStudent: vi.fn(async () => 'request-id') } as unknown as FriendApi
    render(<Friends friends={{ status: 'success', data: [friend, otherFriend] }} busyIds={new Set()} onRetry={vi.fn()} onViewProfile={onViewProfile} onUnfriend={onUnfriend} api={api} onOpenRequests={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Friends 2' }))
    expect(screen.getByRole('dialog', { name: 'Friends' })).toBeInTheDocument()
    expect(screen.getByText('Accepted Friend')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search friends' }), { target: { value: 'morgan' } })
    expect(screen.getByText('Morgan Student')).toBeInTheDocument()
    expect(screen.queryByText('Accepted Friend')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search friends' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'View profile of Accepted Friend' }))
    expect(onViewProfile).toHaveBeenCalledWith('friend')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Accepted Friend as friend' }))
    expect(onUnfriend).toHaveBeenCalledWith('friend')
  })
})

describe('course relationship controls', () => {
  it('shows request states in the course recommendations list', () => {
    const relationshipById = new Map<string, FriendRelationship>([
      ['peer', { student_id: 'peer', relationship: 'declined', request_id: 'old' }],
      ['another', { student_id: 'another', relationship: 'incoming_pending', request_id: 'incoming' }],
      ['friend', { student_id: 'friend', relationship: 'accepted', request_id: 'accepted-request' }],
    ])
    const onSendFriend = vi.fn(), onOpenFriendRequests = vi.fn(), onViewProfile = vi.fn()
    render(<CourseBrowser {...baseBrowser} recommendations={{ status: 'success', candidates: [peer, { ...peer, student_id: 'another', name: 'Another Student' }, { ...peer, student_id: 'friend', name: 'Already Friend' }] }} relationshipById={relationshipById} friendActionBusy={new Set()} onSendFriend={onSendFriend} onOpenFriendRequests={onOpenFriendRequests} onViewProfile={onViewProfile} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recommendations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send friend request again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Respond to friend request' }))
    expect(onSendFriend).toHaveBeenCalledWith('peer', 'CSE 310')
    expect(onOpenFriendRequests).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'View profile of Peer Student' }))
    expect(onViewProfile).toHaveBeenCalledWith('peer')
    expect(screen.queryByText('Already Friend')).not.toBeInTheDocument()
    expect(screen.queryByText('Friends in this Class')).not.toBeInTheDocument()
  })
})

describe('friend API adapter', () => {
  it('calls only narrow authenticated RPCs and parses profile visibility omissions', async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = []
    const responses: Record<string, unknown> = {
      friend_request_inbox: incoming,
      course_friend_relationships: [{ student_id: 'peer', relationship: 'outgoing_pending', request_id: 'request-1' }],
      friends_in_course: [{ ...peer, has_shared_avatar: false }],
      get_discoverable_profile: { ...peer, has_shared_avatar: false },
    }
    const client = { rpc(name: string, args?: Record<string, unknown>) { calls.push({ name, args }); return { abortSignal: async () => ({ data: responses[name], error: null }) } } } as unknown as SupabaseClient
    const api = friendApi(client)
    const signal = new AbortController().signal
    expect(await api.inbox(signal)).toEqual(incoming)
    expect(await api.relationships('CSE 310', signal)).toHaveLength(1)
    expect((await api.friends(['CSE 310'], signal))[0].has_shared_avatar).toBe(false)
    const privateProfile = await api.profile('peer', signal)
    expect(privateProfile).not.toHaveProperty('interests')
    await api.unfriend('peer')
    expect(calls.map(call => call.name)).toEqual(['friend_request_inbox', 'course_friend_relationships', 'friends_in_course', 'get_discoverable_profile', 'unfriend'])
    expect(calls[1].args).toEqual({ p_course_code: 'CSE 310' })
    expect(calls[4].args).toEqual({ p_student_id: 'peer' })
  })

  it('updates confirmed actions immediately and refreshes after participant realtime events', async () => {
    let currentInbox = [...incoming]
    let currentRelationship: FriendRelationship = { student_id: 'student-1', relationship: 'none', request_id: null }
    let currentFriends: FriendStudent[] = []
    const callbacks: Array<(payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => void> = []
    const channel = { on: vi.fn((_event: string, _filter: unknown, callback: (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => void) => { callbacks.push(callback); return channel }), subscribe: vi.fn(() => channel) }
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => {}) } as unknown as SupabaseClient
    const api: FriendApi = {
      inbox: vi.fn(async () => currentInbox),
      relationships: vi.fn(async () => [currentRelationship]),
      friends: vi.fn(async () => currentFriends),
      directory: vi.fn(async () => []),
      profile: vi.fn(async () => null),
      send: vi.fn(async () => { currentRelationship = { student_id: 'student-1', relationship: 'outgoing_pending', request_id: 'new-request' }; return 'new-request' }),
      sendToStudent: vi.fn(async () => 'new-request'),
      respond: vi.fn(async (_id, action) => { currentInbox = []; currentRelationship = { student_id: 'student-1', relationship: action === 'accept' ? 'accepted' : 'declined', request_id: 'request-1' }; if (action === 'accept') currentFriends = [{ student_id: 'student-1', name: 'Avery Student', major: 'Computer Science', has_shared_avatar: false }] }),
      unfriend: vi.fn(async () => { currentFriends = [] }),
      picture: vi.fn(async () => new Blob()),
    }
    const { result } = renderHook(() => useFriendships(api, client, 'caller', 'CSE 310', ['CSE 310']))
    await waitFor(() => expect(result.current.inbox.data).toHaveLength(1))
    await act(async () => { await result.current.respond('request-1', 'accept') })
    expect(result.current.inbox.data).toHaveLength(0)
    await waitFor(() => expect(result.current.friends.data).toHaveLength(1))
    expect(result.current.relationshipById.get('student-1')?.relationship).toBe('accepted')
    await act(async () => { await result.current.unfriend('student-1') })
    expect(result.current.friends.data).toHaveLength(0)
    currentInbox = [{ ...incoming[0], request_id: 'remote-request' }]
    act(() => callbacks[0]({ new: { sender_id: 'peer', recipient_id: 'caller' }, old: {} }))
    await waitFor(() => expect(result.current.inbox.data[0].request_id).toBe('remote-request'))
    expect(api.inbox).toHaveBeenCalledTimes(4)
  })
})
