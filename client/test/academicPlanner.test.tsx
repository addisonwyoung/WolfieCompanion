import './academicDialogSupport'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { StrictMode } from 'react'
import AcademicPlanner from '../src/AcademicPlanner'
import type { AcademicApi, AcademicItem } from '../src/academicItems'
import type { SavedCourse } from '../src/account'
const courses: SavedCourse[] = [
  { id: 'cse-310', databaseId: '10000000-0000-0000-0000-000000000021', code: 'CSE 310', sections: ['01'] },
  { id: 'ams-210', databaseId: '10000000-0000-0000-0000-000000000022', code: 'AMS 210' },
]
const first: AcademicItem = { id: 'first', user_course_id: courses[0].databaseId, title: 'Homework', type: 'assignment', due_date: '2026-10-21', due_time: null, location: null, notes: null, completed_at: null }
function fixture(seed: AcademicItem[] = []) {
  let rows = seed.map(item => ({ ...item }))
  const api: AcademicApi = {
    load: vi.fn(async () => rows.map(item => ({ ...item }))),
    save: vi.fn(async (value, id) => { const next = { ...value, id: id ?? 'new' }; rows = [...rows.filter(item => item.id !== next.id), next]; return next }),
    complete: vi.fn(async (id, done) => { const next = { ...rows.find(item => item.id === id)!, completed_at: done ? new Date().toISOString() : null }; rows = rows.map(item => item.id === id ? next : item); return next }),
    remove: vi.fn(async id => { rows = rows.filter(item => item.id !== id) }),
  }
  return api
}
function show(api: AcademicApi) { return render(<AcademicPlanner api={api} courses={courses} onAddCourses={vi.fn()} />) }
async function action(name: 'Edit' | 'Delete', title = 'Homework') {
  fireEvent.click(await screen.findByRole('button', { name: `Actions for ${title}` }))
  fireEvent.click(screen.getByRole('menuitem', { name }))
}
function escape(dialog = screen.getByRole('dialog')) { fireEvent(dialog, new Event('cancel', { cancelable: true })) }
function changeTitle(value: string) { fireEvent.change(screen.getByLabelText('Title'), { target: { value } }) }

test('persistent create, reload, edit, complete, reopen and native deletion preserve payloads', async () => {
  const api = fixture(); const user = userEvent.setup(); let view = show(api)
  await user.click(await screen.findByRole('button', { name: 'Add item' }))
  expect(screen.getByLabelText('Title')).toHaveFocus()
  await user.type(screen.getByLabelText('Title'), 'Homework')
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-21' } })
  await user.click(screen.getByText('Optional details'))
  await user.type(screen.getByLabelText('Location (optional)'), 'Library')
  await user.click(screen.getByRole('button', { name: 'Save item' }))
  await screen.findByRole('heading', { name: 'Homework' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add item' })).toHaveFocus()
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ user_course_id: courses[0].databaseId, due_time: null, location: 'Library' }), undefined)
  view.unmount(); view = show(api)
  await action('Edit'); expect(screen.getByText('Optional details').parentElement).toHaveAttribute('open')
  changeTitle('Revised'); fireEvent.click(screen.getByRole('button', { name: 'Save item' }))
  await screen.findByText('Item saved.')
  expect(screen.getByRole('button', { name: 'Actions for Revised' })).toHaveFocus()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark complete Revised' }))
  await screen.findByText('Item completed.')
  fireEvent.click(screen.getByRole('button', { name: 'Completed', exact: true }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reopen Revised' }))
  await screen.findByText('Item reopened.')
  fireEvent.click(screen.getByRole('button', { name: 'Pending' }))
  await action('Delete', 'Revised')
  const dialog = screen.getByRole('alertdialog', { name: 'Delete this item?' })
  expect(dialog).toHaveTextContent('Revised'); expect(dialog).toHaveAccessibleDescription(/Revised CSE 310 .*cannot be undone/)
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })); expect(api.remove).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Actions for Revised' })).toHaveFocus()
  await action('Delete', 'Revised'); fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
  await screen.findByText('Item deleted.')
  expect(screen.getByRole('button', { name: 'Add item' })).toHaveFocus()
  view.unmount(); show(api); await screen.findByText(/Nothing planned/)
})

test('menu keyboard navigation, safe dismissal, one open menu, and logical Tab', async () => {
  const api = fixture([first, { ...first, id: 'other', title: 'Other' }]); const user = userEvent.setup(); show(api)
  const trigger = await screen.findByRole('button', { name: 'Actions for Homework' })
  trigger.focus(); await user.keyboard('{Enter}')
  expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus()
  await user.keyboard('{ArrowDown}'); expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
  await user.keyboard('{ArrowDown}'); expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus()
  await user.keyboard('{End}'); expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
  await user.keyboard('{Home}'); expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus()
  await user.keyboard('{Escape}'); expect(trigger).toHaveFocus(); expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  await user.keyboard(' '); await user.tab(); expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.click(trigger); fireEvent.click(screen.getByRole('button', { name: 'Actions for Other' }))
  expect(screen.getAllByRole('menu')).toHaveLength(1)
  fireEvent.pointerDown(screen.getByRole('heading', { name: 'Assignments & Exams' }))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument(); expect(api.remove).not.toHaveBeenCalled()
})

test.each(['Cancel', 'Close', 'Escape'])('dirty %s confirms in the same dialog, Keep Editing preserves values, Discard never saves', async route => {
  const api = fixture([first]); show(api); await action('Edit'); changeTitle('Private draft')
  if (route === 'Escape') escape(); else fireEvent.click(screen.getByRole('button', { name: route === 'Close' ? 'Close editor' : 'Cancel', exact: true }))
  let confirmation = screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })
  expect(document.querySelectorAll('dialog[open]')).toHaveLength(1)
  expect(within(confirmation).getByRole('button', { name: 'Keep Editing' })).toHaveFocus()
  escape(confirmation)
  expect(screen.getByLabelText('Title')).toHaveValue('Private draft')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Keep Editing' }))
  expect(screen.getByLabelText('Title')).toHaveValue('Private draft')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  confirmation = screen.getByRole('alertdialog')
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Discard Changes' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(api.save).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Actions for Homework' })).toHaveFocus()
})

test('clean, reverted, optional blank and timestamp-equivalent drafts close without prompts', async () => {
  const api = fixture([{ ...first, due_time: '14:00:00', completed_at: '2026-10-21T10:00:00Z' }]); show(api)
  await screen.findByText(/No items match/); fireEvent.click(screen.getByRole('button', { name: 'Completed', exact: true }))
  await action('Edit'); changeTitle('Changed'); changeTitle('Homework')
  fireEvent.change(screen.getByLabelText('Time (optional)'), { target: { value: '14:00' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Completed', exact: true })); fireEvent.click(screen.getByRole('checkbox', { name: 'Completed', exact: true }))
  fireEvent.click(screen.getByText('Optional details'))
  fireEvent.change(screen.getByLabelText('Notes (optional)'), { target: { value: '  ' } })
  escape(); expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await action('Edit'); fireEvent.click(screen.getByRole('button', { name: 'Save item' }))
  await screen.findByText('Item saved.')
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ completed_at: '2026-10-21T10:00:00Z', due_time: '14:00:00' }), first.id)
})

test('optional disclosure keeps values; invalid fields are associated and focused', async () => {
  const api = fixture(); show(api); await screen.findByText(/Nothing planned/)
  fireEvent.click(screen.getByRole('button', { name: 'Add item' })); fireEvent.click(screen.getByRole('button', { name: 'Save item' }))
  expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('Title')).toHaveAccessibleDescription(/Enter a title/)
  expect(screen.getByLabelText('Title')).toHaveFocus()
  changeTitle('Work'); fireEvent.click(screen.getByRole('button', { name: 'Save item' }))
  expect(screen.getByLabelText('Due date')).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-21' } })
  fireEvent.click(screen.getByText('Optional details'))
  fireEvent.change(screen.getByLabelText('Notes (optional)'), { target: { value: 'Read chapter 2' } })
  fireEvent.click(screen.getByText('Optional details')); fireEvent.click(screen.getByText('Optional details'))
  expect(screen.getByLabelText('Notes (optional)')).toHaveValue('Read chapter 2')
  fireEvent.change(screen.getByLabelText('Notes (optional)'), { target: { value: 'x'.repeat(5001) } })
  fireEvent.click(screen.getByText('Optional details')); fireEvent.click(screen.getByRole('button', { name: 'Save item' }))
  expect(screen.getByText('Optional details').parentElement).toHaveAttribute('open')
  expect(screen.getByLabelText('Notes (optional)')).toHaveFocus(); expect(api.save).not.toHaveBeenCalled()
})

test('failed save retains draft inside the modal; pending save cannot close or repeat and retry succeeds', async () => {
  const api = fixture([first]); show(api); await action('Edit'); changeTitle('Draft')
  let reject!: (error: Error) => void
  vi.mocked(api.save).mockImplementationOnce(() => new Promise((_, no) => { reject = no }))
  const save = screen.getByRole('button', { name: 'Save item' }); fireEvent.click(save); fireEvent.click(save)
  expect(api.save).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  escape(); expect(screen.getByRole('dialog')).toBeInTheDocument()
  await act(async () => reject(new Error('Unable to save. Please retry.')))
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Unable to save')
  expect(screen.getByLabelText('Title')).toHaveValue('Draft')
  fireEvent.click(screen.getByRole('button', { name: 'Save item' })); await screen.findByText('Item saved.')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('delete pending/failure/retry stays in dialog; Escape after failure cancels without another request', async () => {
  const api = fixture([first, { ...first, id: 'sibling', title: 'Keep me' }]); show(api)
  await action('Delete'); let reject!: (error: Error) => void
  vi.mocked(api.remove).mockImplementationOnce(() => new Promise((_, no) => { reject = no }))
  const remove = screen.getByRole('button', { name: 'Delete', exact: true })
  fireEvent.click(remove); fireEvent.click(remove); escape(screen.getByRole('alertdialog'))
  expect(api.remove).toHaveBeenCalledTimes(1); expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await act(async () => reject(new Error('Unable to delete. Please retry.')))
  const dialog = screen.getByRole('alertdialog'); expect(within(dialog).getByRole('alert')).toHaveTextContent('Unable to delete')
  expect(screen.getByRole('heading', { name: 'Homework' })).toBeInTheDocument()
  escape(dialog); expect(api.remove).toHaveBeenCalledTimes(1)
  await action('Delete'); expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true })); await screen.findByText('Item deleted.')
  expect(screen.getByRole('checkbox', { name: 'Mark complete Keep me' })).toHaveFocus()
  expect(screen.queryByRole('heading', { name: 'Homework' })).not.toBeInTheDocument()
})

test('explicit deletion retry after failure uses the same item context', async () => {
  const api = fixture([first]); vi.mocked(api.remove).mockRejectedValueOnce(new Error('Unable to delete. Please retry.'))
  show(api); await action('Delete'); fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
  await screen.findByRole('alert'); expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true })); await screen.findByText('Item deleted.')
  expect(api.remove).toHaveBeenNthCalledWith(1, first.id); expect(api.remove).toHaveBeenNthCalledWith(2, first.id)
})

test('filters, prefill, readable dates and edited-row fallback preserve grouping', async () => {
  const api = fixture([first, { ...first, id: 'exam', title: 'Midterm', type: 'exam', due_time: '14:05:00', user_course_id: courses[1].databaseId }]); show(api)
  await screen.findByRole('heading', { name: 'Midterm' }); expect(screen.getAllByText('Oct 21, 2026')).toHaveLength(2)
  expect(screen.getByText(/2:05 PM/)).toHaveTextContent('America/New_York')
  fireEvent.change(screen.getByLabelText('Filter by course'), { target: { value: courses[1].databaseId } })
  expect(screen.queryByRole('heading', { name: 'Homework' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add item' })); expect(within(screen.getByRole('dialog')).getByLabelText('Course', { exact: true })).toHaveValue(courses[1].databaseId)
  escape(); await action('Edit', 'Midterm')
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Course', { exact: true }), { target: { value: courses[0].databaseId } })
  fireEvent.click(screen.getByRole('button', { name: 'Save item' })); await screen.findByText('Item saved.')
  expect(screen.getByRole('button', { name: 'Add item' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' })); expect(screen.getByRole('heading', { name: 'Midterm' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'quiz' } }); expect(screen.getByText(/No items match/)).toBeInTheDocument()
})

test('missing courses and load failure have distinct recovery paths', async () => {
  const api = fixture(); const add = vi.fn(); const view = render(<AcademicPlanner api={api} courses={[]} onAddCourses={add} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add courses' })); expect(add).toHaveBeenCalled(); view.unmount()
  vi.mocked(api.load).mockRejectedValueOnce(new Error('Academic item storage is not set up yet.')); show(api)
  await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'Retry academic items' })); await screen.findByText(/Nothing planned/)
})

test.each(['assignment', 'exam', 'quiz', 'project'] as const)('%s completion/reopening is direct, failure-safe, and focus moves when the row leaves', async type => {
  const api = fixture([{ ...first, type }]); show(api)
  const checkbox = await screen.findByRole('checkbox', { name: 'Mark complete Homework' })
  checkbox.focus()
  vi.mocked(api.complete).mockRejectedValueOnce(new Error('Unable to complete. Please retry.'))
  fireEvent.click(checkbox); await screen.findByRole('alert'); expect(checkbox).not.toBeChecked(); expect(checkbox).toHaveFocus()
  fireEvent.click(checkbox); await screen.findByText('Item completed.'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Completed', exact: true })); const reopen = screen.getByRole('checkbox', { name: 'Reopen Homework' })
  expect(reopen).toBeChecked(); fireEvent.click(reopen); await screen.findByText('Item reopened.')
})

test('completion focus uses Pending after the last row disappears; Enter does not open Add Item', async () => {
  const api = fixture([first]); const user = userEvent.setup(); show(api)
  await user.click(await screen.findByRole('checkbox', { name: 'Mark complete Homework' }))
  await screen.findByText('Item completed.')
  expect(screen.getByRole('button', { name: 'Pending' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Add item' })).not.toHaveFocus()
  await user.keyboard('{Enter}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pending' })).toHaveAttribute('aria-pressed', 'true')
})

test('completion focus chooses a visible checkbox when its original neighbor is filtered out', async () => {
  const api = fixture([first, { ...first, id: 'quiz', title: 'Quiz', type: 'quiz', due_date: '2026-10-22' }, { ...first, id: 'later', title: 'Later assignment', due_date: '2026-10-23' }])
  let resolve!: (item: AcademicItem) => void
  vi.mocked(api.complete).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  show(api)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Mark complete Homework' }))
  fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'assignment' } })
  await act(async () => resolve({ ...first, completed_at: '2026-10-22T12:00:00Z' }))
  expect(screen.getByRole('checkbox', { name: 'Mark complete Later assignment' })).toHaveFocus()
  expect(screen.getByLabelText('Filter by type')).toHaveValue('assignment')
})

test('completion focus is untouched when the activated checkbox stays connected', async () => {
  const api = fixture([first])
  vi.mocked(api.complete).mockResolvedValueOnce({ ...first })
  show(api)
  const checkbox = await screen.findByRole('checkbox', { name: 'Mark complete Homework' })
  checkbox.focus()
  const focus = vi.spyOn(checkbox, 'focus')
  fireEvent.click(checkbox); await screen.findByText('Item completed.')
  expect(checkbox.isConnected).toBe(true)
  expect(checkbox).toHaveFocus()
  expect(focus).not.toHaveBeenCalled()
})

test.each(['save', 'delete', 'complete'] as const)('late %s cannot change a replacement workspace or restore obsolete focus', async operation => {
  const api = fixture([first]); const view = show(api); await screen.findByRole('heading', { name: 'Homework' })
  let resolve!: (value: AcademicItem | void) => void
  if (operation === 'save') {
    vi.mocked(api.save).mockImplementationOnce(() => new Promise(r => { resolve = r })); await action('Edit'); changeTitle('Private changed'); fireEvent.click(screen.getByRole('button', { name: 'Save item' }))
  } else if (operation === 'delete') {
    vi.mocked(api.remove).mockImplementationOnce(() => new Promise(r => { resolve = r })); await action('Delete'); fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
  } else {
    vi.mocked(api.complete).mockImplementationOnce(() => new Promise(r => { resolve = r })); fireEvent.click(screen.getByRole('checkbox', { name: 'Mark complete Homework' }))
  }
  view.unmount(); show(fixture([{ ...first, title: 'New account' }]))
  await act(async () => resolve(operation === 'delete' ? undefined : { ...first, title: 'Private changed' }))
  await screen.findByRole('heading', { name: 'New account' }); expect(screen.queryByText('Private changed')).not.toBeInTheDocument()
  expect(document.querySelector('dialog[open]')).toBeNull(); expect(document.body.style.overflow).not.toBe('hidden')
})

test('late load cannot populate a replacement account and Strict Mode modal cleanup is safe', async () => {
  let resolve!: (items: AcademicItem[]) => void
  const api = fixture(); vi.mocked(api.load).mockImplementationOnce(() => new Promise(r => { resolve = r }))
  const view = show(api); view.unmount()
  render(<StrictMode><AcademicPlanner api={fixture()} courses={courses} onAddCourses={vi.fn()} /></StrictMode>)
  await act(async () => resolve([first])); await screen.findByText(/Nothing planned/)
  fireEvent.click(screen.getByRole('button', { name: 'Add item' })); expect(document.querySelectorAll('dialog[open]')).toHaveLength(1)
  escape(); expect(document.body.style.overflow).not.toBe('hidden')
})

test('date groups refresh across campus midnight without changing readable date-only presentation', async () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(new Date('2026-10-22T03:59:59Z')); show(fixture([first])); await act(async () => {})
    expect(screen.getByRole('region', { name: 'Today' })).toHaveTextContent('Oct 21, 2026')
    await act(async () => { vi.advanceTimersByTime(15000) }); expect(screen.getByRole('region', { name: 'Overdue' })).toHaveTextContent('Oct 21, 2026')
  } finally { vi.useRealTimers() }
})
