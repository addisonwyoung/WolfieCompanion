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
