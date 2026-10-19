import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { classmateApi, classmateError } from '../src/classmates'
import type { Classmate } from '../src/classmates'
import { useClassmates } from '../src/useClassmates'
import CourseBrowser from '../src/CourseBrowser'

const peer: Classmate = { student_id: 'b', name: 'Real Peer', major: null }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('RPC uses course code only and maps only allowlisted fields; failures are safe', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: [{ ...peer, email: 'private', interests: ['secret'] }], error: null })
  const api = classmateApi({ rpc } as unknown as SupabaseClient)
  expect(await api('CSE 310')).toEqual([peer])
  expect(rpc).toHaveBeenCalledWith('find_classmates', { p_course_code: 'CSE 310' })
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'database secret' } })
  await expect(api('CSE 310')).rejects.toThrow(classmateError)
  rpc.mockRejectedValueOnce(new Error('network secret'))
  await expect(api('CSE 310')).rejects.toThrow(classmateError)
  rpc.mockResolvedValueOnce({ data: [{ name: 'invalid' }], error: null })
  await expect(api('CSE 310')).rejects.toThrow(classmateError)
})

test('request lifecycle clears course/account/expired-session results and ignores late responses', async () => {
  const first = deferred<Classmate[]>()
  const second = deferred<Classmate[]>()
  const third = deferred<Classmate[]>()
  const api = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise).mockResolvedValue([])
  const { result, rerender } = renderHook(({ user, code }: { user: string | null; code: string | null }) => useClassmates(api, user, code), { initialProps: { user: 'a', code: 'CSE 310' } as { user: string | null; code: string | null } })
  expect(result.current.status).toBe('loading')
  rerender({ user: 'a', code: 'AMS 210' })
  await act(async () => first.resolve([peer]))
  expect(result.current.classmates).toEqual([])
  await act(async () => second.resolve([{ ...peer, name: 'AMS peer' }]))
  expect(result.current.classmates[0].name).toBe('AMS peer')
  // Returning to a previous selection must issue a fresh lookup, not revive cached rows.
  rerender({ user: 'a', code: 'CSE 310' })
  expect(result.current.status).toBe('loading')
  rerender({ user: 'b', code: 'CSE 310' })
  await act(async () => third.resolve([peer]))
  await waitFor(() => expect(result.current.status).toBe('success'))
  expect(result.current.classmates).toEqual([])
  rerender({ user: null, code: 'CSE 310' })
  expect(result.current.status).toBe('idle')
  expect(result.current.classmates).toEqual([])
  rerender({ user: 'b', code: null })
  expect(result.current.status).toBe('idle')
  expect(api).toHaveBeenCalledTimes(4)
})

test('sign-out invalidates an in-flight request and retry refetches the active course', async () => {
  const pending = deferred<Classmate[]>()
  const api = vi.fn().mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(pending.promise).mockResolvedValue([peer])
  const { result, rerender } = renderHook(({ user }: { user: string | null }) => useClassmates(api, user, 'CSE 310'), { initialProps: { user: 'a' } as { user: string | null } })
  await waitFor(() => expect(result.current.status).toBe('error'))
  act(() => result.current.retry())
  expect(result.current.status).toBe('loading')
  expect(api).toHaveBeenLastCalledWith('CSE 310')
  rerender({ user: null })
  await act(async () => pending.resolve([peer]))
  expect(result.current.status).toBe('idle')
  expect(result.current.classmates).toEqual([])
  rerender({ user: 'a' })
  await waitFor(() => expect(result.current.classmates).toEqual([peer]))
})

test('no lookup without a ready identity and selected code', () => {
  const api = vi.fn()
  const { rerender } = renderHook(({ user, code }: { user: string | null; code: string | null }) => useClassmates(api, user, code), { initialProps: { user: null, code: null } as { user: string | null; code: string | null } })
  rerender({ user: 'a', code: null })
  rerender({ user: null, code: 'CSE 310' })
  expect(api).not.toHaveBeenCalled()
})

test('cards display name and major only, with separate accessible states and visibility explanation', async () => {
  const onSelect = vi.fn(), onRetry = vi.fn()
  const props = { enrolledCourses: [{ id: 'cse-310', code: 'CSE 310' }], selectedId: 'cse-310', onSelect, onAddClasses: vi.fn(), onRetry }
  const { rerender } = render(<CourseBrowser {...props} roster={{ status: 'success', classmates: [peer] }} />)
  expect(screen.getByText('Real Peer')).toBeInTheDocument()
  expect(screen.getByText('Major not added')).toBeInTheDocument()
  expect(screen.getByText('1 classmate')).toBeInTheDocument()
  expect(screen.queryByText('Interests')).not.toBeInTheDocument()
  expect(screen.queryByText(/fictional/i)).not.toBeInTheDocument()
  expect(screen.getByText(/Your name and major are visible/)).toHaveTextContent('Public/private settings and opt-out controls are not available')
  expect(screen.getByText(/Your name and major are visible/)).toHaveTextContent('self-reported')
  rerender(<CourseBrowser {...props} roster={{ status: 'loading', classmates: [] }} />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading classmates')
  expect(screen.queryByText('Real Peer')).not.toBeInTheDocument()
  expect(screen.queryByText('0 classmates')).not.toBeInTheDocument()
  rerender(<CourseBrowser {...props} roster={{ status: 'error', classmates: [] }} />)
  expect(screen.getByRole('alert')).toHaveTextContent(classmateError)
  expect(screen.queryByText('No classmates yet')).not.toBeInTheDocument()
  const user = userEvent.setup()
  screen.getByRole('button', { name: 'Retry classmates' }).focus()
  await user.keyboard('{Enter}')
  expect(onRetry).toHaveBeenCalledOnce()
  const course = screen.getByRole('button', { name: /CSE 310/ })
  course.focus()
  await user.keyboard('{Enter}')
  expect(onSelect).toHaveBeenCalledWith('cse-310')
  expect(course).toHaveAttribute('aria-pressed', 'true')
  rerender(<CourseBrowser {...props} roster={{ status: 'success', classmates: [] }} />)
  expect(screen.getByText('0 classmates')).toBeInTheDocument()
  expect(screen.getByText('No classmates yet')).toBeInTheDocument()
  expect(screen.queryByText('Maya Chen')).not.toBeInTheDocument()
  rerender(<CourseBrowser {...props} enrolledCourses={[]} selectedId={null} roster={{ status: 'idle', classmates: [] }} />)
  expect(screen.queryByRole('heading', { name: /Classmates in/ })).not.toBeInTheDocument()
  expect(screen.getByText(/No saved classes yet/)).toBeInTheDocument()
})
