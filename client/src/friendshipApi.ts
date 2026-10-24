import type { SupabaseClient } from '@supabase/supabase-js'
import { parsePeer } from './classmateProfile'
import type { ClassmateProfile } from './classmateProfile'

export interface FriendRequest { request_id: string; sender_id: string; sender_name: string; sender_major: string | null; created_at: string }
export interface FriendRelationship { student_id: string; relationship: 'none' | 'declined' | 'outgoing_pending' | 'incoming_pending' | 'accepted'; request_id: string | null }
export type FriendStudent = ClassmateProfile
export type DiscoverableStudent = FriendStudent & { relationship: Exclude<FriendRelationship['relationship'], 'accepted'> }
export interface FriendApi {
  inbox(signal: AbortSignal): Promise<FriendRequest[]>
  relationships(course: string, signal: AbortSignal): Promise<FriendRelationship[]>
  friends(courses: string[], signal: AbortSignal): Promise<FriendStudent[]>
  directory(signal: AbortSignal): Promise<DiscoverableStudent[]>
  profile(student: string, signal: AbortSignal): Promise<FriendStudent | null>
  send(course: string, student: string): Promise<string>
  sendToStudent(student: string): Promise<string>
  respond(request: string, action: 'accept' | 'decline'): Promise<void>
  unfriend(student: string): Promise<void>
  picture(student: string, signal: AbortSignal): Promise<Blob>
}

function rows<T>(data: unknown, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(data)) throw new Error('Unable to load friend information. Please retry.')
  return data.map(parse)
}
function parseRequest(value: unknown): FriendRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid request')
  const row = value as Record<string, unknown>
  if (typeof row.request_id !== 'string' || typeof row.sender_id !== 'string' || typeof row.sender_name !== 'string' || !(row.sender_major === null || typeof row.sender_major === 'string') || typeof row.created_at !== 'string') throw new Error('Invalid request')
  return row as unknown as FriendRequest
}
function parseRelationship(value: unknown): FriendRelationship {
  if (!value || typeof value !== 'object') throw new Error('Invalid relationship')
  const row = value as Record<string, unknown>
  if (typeof row.student_id !== 'string' || !['none','declined','outgoing_pending','incoming_pending','accepted'].includes(String(row.relationship)) || !(row.request_id === null || typeof row.request_id === 'string')) throw new Error('Invalid relationship')
  return row as unknown as FriendRelationship
}
function parseFriend(value: unknown): FriendStudent {
  const row = { ...(value as Record<string, unknown>) }
  if (!row || typeof row.student_id !== 'string') throw new Error('Invalid profile')
  for (const field of ['year','interests','residence_status']) if (row[field] === null) delete row[field]
  return parsePeer(row, row.student_id)
}

export function friendApi(client: SupabaseClient): FriendApi {
  return {
    async inbox(signal) {
      const { data, error } = await client.rpc('friend_request_inbox').abortSignal(signal)
      if (error) throw new Error('Unable to load friend requests. Please retry.')
      return rows(data, parseRequest)
    },
    async relationships(course, signal) {
      const { data, error } = await client.rpc('course_friend_relationships', { p_course_code: course }).abortSignal(signal)
      if (error) throw new Error('Unable to load friend statuses. Please retry.')
      return rows(data, parseRelationship)
    },
    async friends(courses, signal) {
      const results = await Promise.all(courses.map(async course => {
        const { data, error } = await client.rpc('friends_in_course', { p_course_code: course }).abortSignal(signal)
        if (error) throw new Error('Unable to load your friends. Please retry.')
        return rows(data, parseFriend)
      }))
      return [...new Map(results.flat().map(friend => [friend.student_id, friend])).values()]
    },
    async directory(signal) {
      const { data, error } = await client.rpc('friend_directory').abortSignal(signal)
      if (error) throw new Error('Unable to load students. Please retry.')
      return rows(data, value => {
        const row = value as Record<string, unknown>
        const profile = parseFriend(row)
        if (!['none', 'declined', 'outgoing_pending', 'incoming_pending'].includes(String(row.relationship))) throw new Error('Invalid student relationship')
        return { ...profile, relationship: row.relationship as DiscoverableStudent['relationship'] }
      })
    },
    async profile(student, signal) {
      const { data, error } = await client.rpc('get_discoverable_profile', { p_student_id: student }).abortSignal(signal)
      if (error) throw new Error('Unable to load profile. Please retry.')
      return data === null ? null : parseFriend(data)
    },
    async send(course, student) {
      const { data, error } = await client.rpc('send_friend_request', { p_course_code: course, p_student_id: student })
      if (error) throw new Error(error.code === '23505' ? 'A request or friendship already exists. Refresh to see its status.' : 'Friend request could not be sent. Please retry.')
      if (typeof data !== 'string') throw new Error('Friend request could not be confirmed. Please retry.')
      return data
    },
    async sendToStudent(student) {
      const { data, error } = await client.rpc('send_friend_request_to_student', { p_student_id: student })
      if (error) throw new Error(error.code === '23505' ? 'A request or friendship already exists. Refresh to see its status.' : 'Friend request could not be sent. Please retry.')
      if (typeof data !== 'string') throw new Error('Friend request could not be confirmed. Please retry.')
      return data
    },
    async respond(request, action) {
      const { error } = await client.rpc('respond_to_friend_request', { p_request_id: request, p_action: action })
      if (error) throw new Error('Friend request could not be updated. Please retry.')
    },
    async unfriend(student) {
      const { error } = await client.rpc('unfriend', { p_student_id: student })
      if (error) throw new Error('Friend could not be removed. Please retry.')
    },
    async picture(student, signal) {
      const { data } = await client.auth.getSession()
      if (!data.session) throw new Error('Sign in again')
      const response = await fetch(`/api/friend-picture?${new URLSearchParams({ student })}`, { signal, cache: 'no-store', headers: { Authorization: `Bearer ${data.session.access_token}` } })
      if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/png')) throw new Error('Picture unavailable')
      return response.blob()
    },
  }
}
