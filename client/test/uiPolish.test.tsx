import './academicDialogSupport'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { currentView, useAppNavigation } from '../src/useAppNavigation'
import { readableDeadline, readableTimestamp } from '../src/dateTime'
import { scrollIfNeeded, useExpandedScroll } from '../src/useExpandedScroll'
import AcademicItemDialog from '../src/AcademicItemDialog'
import type { AcademicInput } from '../src/academicItems'

afterEach(() => window.history.replaceState(null, '', '/'))

test('direct URLs, refresh initialization, real Back/Forward and duplicate navigation', async () => {
  window.history.replaceState({ retained: true }, '', '/?view=academic&other=keep#main')
  const restore = vi.fn()
  const { result, unmount } = renderHook(() => useAppNavigation(restore))
  expect(result.current[0]).toBe('academic')
  const push = vi.spyOn(window.history, 'pushState')
  act(() => result.current[1]('academic'))
  expect(push).not.toHaveBeenCalled()
  act(() => result.current[1]('explorer'))
  expect(window.location.search).toBe('?view=explorer&other=keep')
  expect(window.location.hash).toBe('#main')
  expect(window.history.state).toEqual({ retained: true })
  act(() => window.history.back())
  await waitFor(() => expect(result.current[0]).toBe('academic'))
  act(() => window.history.forward())
  await waitFor(() => expect(result.current[0]).toBe('explorer'))
  expect(push).toHaveBeenCalledTimes(1)
  expect(restore).toHaveBeenCalledTimes(2)
  unmount()
  expect(renderHook(() => useAppNavigation(restore)).result.current[0]).toBe('explorer')
})

test('invalid views fall back and mounting leaves authentication callback parameters intact', () => {
  window.history.replaceState(null, '', '/auth/callback?code=keep&view=invalid#error=keep')
  const before = window.location.href
  expect(currentView()).toBe('dashboard')
  renderHook(() => useAppNavigation(vi.fn()))
  expect(window.location.href).toBe(before)
})

test('calendar deadlines never shift dates; instants use campus time across DST', () => {
  expect(readableDeadline('2026-11-16', '19:03:00')).toBe('Monday, November 16, 2026 at 7:03 PM')
  expect(readableDeadline('2026-11-16', null)).toBe('Monday, November 16, 2026')
  expect(readableTimestamp('2026-11-17T00:03:00Z')).toContain('November 16, 2026 at 7:03 PM')
  expect(readableTimestamp('2026-03-08T06:30:00Z')).toContain('1:30 AM')
  expect(readableTimestamp('2026-03-08T07:30:00Z')).toContain('3:30 AM')
  expect(readableDeadline('0099-01-02', null)).toContain('January 2, 99')
})

test.each(['19:03:42', '19:03:42.123456'])('minute input preserves stored %s on unrelated edits and explicitly replaces time', async storedTime => {
  const initial: AcademicInput = { user_course_id: '10000000-0000-0000-0000-000000000021', title: 'Exam', type: 'exam', due_date: '2026-11-16', due_time: storedTime, notes: null, location: null, completed_at: null }
  const save = vi.fn(async () => true)
  render(<AcademicItemDialog initial={initial} editing courses={[{ id: 'course', databaseId: initial.user_course_id, code: 'CSE 310' }]} busy={false} saveError={null} onClose={vi.fn()} onSave={save} />)
  const input = screen.getByLabelText('Time (optional)')
  expect(input).toHaveValue('19:03')
  expect(input).toHaveAttribute('step', '60')
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Updated exam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save item' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ due_time: storedTime })))
  fireEvent.change(input, { target: { value: '20:15' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save item' }))
  await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ due_time: '20:15' })))
})

test('expansion scrolls only on opening, skips visible content and respects reduced motion', () => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  const scroll = vi.fn()
  function Panel({ open }: { open: boolean }) {
    const ref = useExpandedScroll<HTMLDivElement>(open)
    return <div ref={ref} data-testid="panel" />
  }
  const view = render(<Panel open={false} />)
  const panel = screen.getByTestId('panel')
  panel.scrollIntoView = scroll
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ top: 2000, bottom: 2100, height: 100 } as DOMRect)
  expect(frames).toHaveLength(0)
  view.rerender(<Panel open />)
  act(() => frames.shift()!(0))
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'instant' })
  view.rerender(<Panel open />)
  view.rerender(<Panel open={false} />)
  expect(frames).toHaveLength(0)
  vi.mocked(panel.getBoundingClientRect).mockReturnValue({ top: 10, bottom: 100, height: 90 } as DOMRect)
  scrollIfNeeded(panel)
  expect(scroll).toHaveBeenCalledTimes(1)
  vi.mocked(panel.getBoundingClientRect).mockReturnValue({ top: 2000, bottom: 2100, height: 100 } as DOMRect)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
  scrollIfNeeded(panel)
  expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest', behavior: 'smooth' })
  view.unmount()
  render(<Panel open />)
  expect(frames).toHaveLength(0)
})
