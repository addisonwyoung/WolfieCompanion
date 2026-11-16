import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import StudyGroups from '../src/StudyGroups'
import type { StudyGroup, StudyGroupApi } from '../src/studyGroupApi'
import type { ClassmateApi } from '../src/classmates'

function fixture() {
  const groups: StudyGroup[] = ['Alpha', 'Beta'].map((name, index) => ({
    group_id: name, course_code: 'CSE 416', course_section: '01', name, owner_id: 'self', created_at: '2026-11-02T12:00:00Z', my_status: 'accepted',
    members: [
      { user_id: 'self', name: 'You', status: 'accepted', role: 'owner', study_role: null },
      { user_id: 'peer', name: 'Peer', status: 'accepted', role: 'member', study_role: null },
    ],
    availability: [
      { user_id: 'self', day: index ? 'Tuesday' : 'Monday', start_minute: 600, end_minute: 720 },
      { user_id: 'peer', day: 'Wednesday', start_minute: 780, end_minute: 840 },
    ], tasks: [],
  }))
  const api: StudyGroupApi = { list: vi.fn(async () => structuredClone(groups)), create: vi.fn(), respond: vi.fn(), saveAvailability: vi.fn(), setMemberRole: vi.fn(), addTask: vi.fn(), setTaskComplete: vi.fn(), deleteTask: vi.fn(), leave: vi.fn() }
  const classmatesApi: ClassmateApi = vi.fn(async () => [])
  return { api, classmatesApi }
}
function ownAvailability() {
  return within(screen.getByRole('heading', { name: 'Your availability' }).closest('section')!)
}

test('background group refresh retains unsaved availability; group/account changes load their own windows', async () => {
  const { api, classmatesApi } = fixture()
  const timer = vi.spyOn(window, 'setInterval')
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const props = { courses: [], api, classmatesApi, onGoToCourses: vi.fn() }
  const { rerender } = render(<StudyGroups {...props} userId="self" />)
  fireEvent.click(await screen.findByRole('button', { name: /Alpha/ }))
  expect(within(ownAvailability().getByRole('list')).getByText('Monday')).toBeInTheDocument()
  fireEvent.click(ownAvailability().getByRole('button', { name: 'Remove' }))
  expect(ownAvailability().queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  try {
    await act(async () => { const refresh = timer.mock.calls.find(call => call[1] === 15_000)![0]; if (typeof refresh === 'function') refresh() })
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(ownAvailability().queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  } finally { timer.mockRestore(); visibility.mockRestore() }
  fireEvent.click(screen.getByRole('button', { name: /Beta/ }))
  expect(within(ownAvailability().getByRole('list')).getByText('Tuesday')).toBeInTheDocument()
  rerender(<StudyGroups {...props} userId="peer" />)
  expect(within(ownAvailability().getByRole('list')).getByText('Wednesday')).toBeInTheDocument()
  expect(within(ownAvailability().getByRole('list')).queryByText('Tuesday')).not.toBeInTheDocument()
  expect(api.saveAvailability).not.toHaveBeenCalled()
})

test('retry transitions failed group load to loading and restores the list after success', async () => {
  const { api, classmatesApi } = fixture()
  vi.mocked(api.list).mockRejectedValueOnce(Error('Offline'))
  render(<StudyGroups userId="self" courses={[]} api={api} classmatesApi={classmatesApi} onGoToCourses={vi.fn()} />)
  await screen.findByText('Groups could not be refreshed.')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByRole('button', { name: /Alpha/ })
  await waitFor(() => expect(screen.queryByText('Groups could not be refreshed.')).not.toBeInTheDocument())
})

function scrollFrames() {
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => { frames.delete(frame) })
  return { frames, flush() { act(() => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(0) } }) } }
}

test('scrolls rendered details for each newly selected group without scrolling again on edits, re-selection or background refresh', async () => {
  const { api, classmatesApi } = fixture(), { frames, flush } = scrollFrames()
  const timer = vi.spyOn(window, 'setInterval')
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
  render(<StudyGroups userId="self" courses={[]} api={api} classmatesApi={classmatesApi} onGoToCourses={vi.fn()} />)
  const alpha = await screen.findByRole('button', { name: /Alpha/ })
  expect(frames.size).toBe(0)
  fireEvent.click(alpha)
  const panel = screen.getByRole('heading', { name: 'Alpha' }).closest('section')!
  const scroll = vi.fn(); panel.scrollIntoView = scroll
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ top: 1500, bottom: 3500, height: 2000 } as DOMRect)
  vi.spyOn(panel.querySelector('.study-detail-header')!, 'getBoundingClientRect').mockReturnValue({ top: 1500, bottom: 1600, height: 100 } as DOMRect)
  expect(frames.size).toBe(1); expect(scroll).not.toHaveBeenCalled()
  flush(); expect(scroll).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: /Beta/ }))
  expect(screen.getByRole('heading', { name: 'Beta' }).closest('section')).toBe(panel)
  flush(); expect(scroll).toHaveBeenCalledTimes(2)
  expect(scroll).toHaveBeenLastCalledWith({ block: 'start', behavior: 'smooth' })
  fireEvent.click(screen.getByRole('button', { name: /Beta/ }))
  fireEvent.change(screen.getByLabelText('Task or note'), { target: { value: 'Unsaved task' } })
  await act(async () => { const refresh = timer.mock.calls.find(call => call[1] === 15_000)![0]; if (typeof refresh === 'function') refresh() })
  expect(frames.size).toBe(0); expect(scroll).toHaveBeenCalledTimes(2)
  expect(screen.getByLabelText('Task or note')).toHaveValue('Unsaved task')
})

test('skips visible detail headings but scrolls headings obscured by a sticky header with reduced motion', async () => {
  const { api, classmatesApi } = fixture(), { flush } = scrollFrames()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  render(<><header className="site-header" style={{ position: 'sticky', top: 0 }}>Navigation</header><StudyGroups userId="self" courses={[]} api={api} classmatesApi={classmatesApi} onGoToCourses={vi.fn()}/></>)
  vi.spyOn(document.querySelector('.site-header')!, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 88, height: 88 } as DOMRect)
  fireEvent.click(await screen.findByRole('button', { name: /Alpha/ }))
  const panel = screen.getByRole('heading', { name: 'Alpha' }).closest('section')!
  const scroll = vi.fn(); panel.scrollIntoView = scroll
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ top: 120, bottom: 2120, height: 2000 } as DOMRect)
  const heading = vi.spyOn(panel.querySelector('.study-detail-header')!, 'getBoundingClientRect').mockReturnValue({ top: 120, bottom: 220, height: 100 } as DOMRect)
  flush(); expect(scroll).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Beta/ }))
  vi.mocked(panel.getBoundingClientRect).mockReturnValue({ top: 40, bottom: 2040, height: 2000 } as DOMRect)
  heading.mockReturnValue({ top: 40, bottom: 140, height: 100 } as DOMRect)
  flush()
  expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' })
  expect(panel.style.scrollMarginTop).toBe('104px')
})
