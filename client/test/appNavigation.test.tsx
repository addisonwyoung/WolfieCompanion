import './academicDialogSupport'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { useState } from 'react'
import AppNavigation, { NavigationHeader } from '../src/AppNavigation'
import { useAppNavigation } from '../src/useAppNavigation'
import AcademicReminderProvider from '../src/AcademicReminderProvider'
import { defaultReminderSettings } from '../src/academicReminders'
import type { AcademicReminder, ReminderApi } from '../src/academicReminders'
import { UnreadContext } from '../src/messagingUnread'

function fixture() {
  let rows: AcademicReminder[] = [{ id: 'a0000000-0000-0000-0000-000000000001', item_id: 'a0000000-0000-0000-0000-000000000002', title: 'Midterm', course_code: 'CSE 310', item_type: 'exam', offset_key: 'day', due_at: '2026-11-16T15:00:00Z', delivered_at: '2026-11-16T15:00:00Z', read_at: null, deadline_date: '2026-11-17', deadline_time: '10:00:00' }]
  const api: ReminderApi = {
    refresh: vi.fn(async () => {}), settings: vi.fn(async () => defaultReminderSettings),
    list: vi.fn(async () => ({ rows: [...rows], unread: rows.filter(row => !row.read_at).length })),
    read: vi.fn(async id => { rows = rows.map(row => row.id === id ? { ...row, read_at: '2026-11-16T16:00:00Z' } : row) }),
    clear: vi.fn(async id => { rows = rows.filter(row => row.id !== id) }), bound: vi.fn(async () => 1), clearAll: vi.fn(async () => { rows = [] }), saveSettings: vi.fn(async value => value),
  }
  const signOut = vi.fn(), viewItem = vi.fn()
  function Harness() {
    const [view, navigate] = useAppNavigation(() => {})
    const [draft, setDraft] = useState('Retained page state')
    return <AcademicReminderProvider api={api}><UnreadContext.Provider value={{ counts: { thread: 3 }, markRead: vi.fn() }}>
      <NavigationHeader><div className="header-navigation"><AppNavigation view={view} onNavigate={navigate} onSignOut={signOut} checkItem={async () => true} onViewItem={viewItem}/></div></NavigationHeader>
      <main id="main"><h1>{view}</h1><input aria-label="Page draft" value={draft} onChange={event => setDraft(event.target.value)}/><button>Outside navigation</button></main>
    </UnreadContext.Provider></AcademicReminderProvider>
  }
  render(<Harness/>)
  return { api, signOut, viewItem }
}

test('all destinations retain existing URL routing and mark direct pages and dropdown sections active', async () => {
  fixture()
  expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  for (const [menu, label, view] of [
    ['', 'Messages', 'messages'], ['', 'Study buddies', 'study-groups'],
    ['Academics', 'Assignments & Exams', 'academic'], ['Academics', 'Course evaluations', 'evaluations'],
    ['Explore', 'Campus Explorer', 'explorer'], ['Explore', 'Study spaces', 'spaces'], ['', 'Dashboard', 'dashboard'],
  ]) {
    if (menu) fireEvent.click(screen.getByRole('button', { name: menu, exact: true }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(view)
    expect(new URLSearchParams(window.location.search).get('view')).toBe(view === 'dashboard' ? null : view)
    expect(screen.getByRole('button', { name: new RegExp(`^${label}`), hidden: true })).toHaveAttribute('aria-current', 'page')
    if (menu) expect(screen.getByRole('button', { name: menu, exact: true })).toHaveAttribute('data-active', 'true')
  }
})

test('disclosures toggle, close each other, dismiss outside and on Escape without resetting page state', async () => {
  const user = userEvent.setup(); fixture()
  const academics = screen.getByRole('button', { name: 'Academics', exact: true })
  await user.click(academics); expect(academics).toHaveAttribute('aria-expanded', 'true')
  await user.click(academics); expect(academics).toHaveAttribute('aria-expanded', 'false')
  await user.click(academics); await user.click(screen.getByRole('button', { name: 'Explore', exact: true }))
  expect(academics).toHaveAttribute('aria-expanded', 'false')
  await user.click(screen.getByRole('button', { name: 'Account', exact: true }))
  expect(screen.getByRole('button', { name: 'Explore', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await user.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: 'Account', exact: true })).toHaveFocus()
  await user.click(academics); await user.click(screen.getByRole('button', { name: 'Outside navigation' }))
  expect(academics).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByLabelText('Page draft')).toHaveValue('Retained page state')
})

test('keyboard users can tab into disclosures, use arrows/Home/End and return focus on Escape or selection', async () => {
  const user = userEvent.setup(); fixture()
  const academics = screen.getByRole('button', { name: 'Academics', exact: true })
  academics.focus(); await user.keyboard('{Enter}{Tab}')
  expect(screen.getByRole('button', { name: 'Assignments & Exams' })).toHaveFocus()
  await user.keyboard('{End}'); expect(screen.getByRole('button', { name: 'Course evaluations' })).toHaveFocus()
  await user.keyboard('{Home}{ArrowDown}{Escape}'); expect(academics).toHaveFocus()
  await user.keyboard('{ArrowUp}')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Course evaluations' })).toHaveFocus())
  await user.keyboard('{Enter}')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('evaluations')
  expect(academics).toHaveFocus()
  await user.keyboard('{Enter}{Tab}{Tab}{Tab}')
  expect(academics).toHaveAttribute('aria-expanded', 'false')
})

test('icon notifications retain badge, read/details/settings/clear interactions and coordinate with other menus', async () => {
  const user = userEvent.setup(), { api } = fixture()
  const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
  expect(bell).toHaveClass('header-icon-button')
  expect(within(bell).getByText('Notifications')).toHaveClass('sr-only')
  expect(screen.getByLabelText('3 unread messages')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Academics', exact: true })); await user.click(bell)
  expect(screen.getByRole('button', { name: 'Academics', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await user.click(screen.getByRole('button', { name: 'Account', exact: true }))
  expect(bell).toHaveAttribute('aria-expanded', 'false')
  await user.click(bell)
  await user.click(screen.getByRole('button', { name: /^MidtermCSE/ }))
  await screen.findByRole('heading', { name: 'Midterm' })
  await waitFor(() => expect(api.read).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close', exact: true })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Close', exact: true }))
  await user.click(screen.getByRole('button', { name: 'Notifications', exact: true }))
  await user.click(screen.getByRole('button', { name: 'Reminder settings' }))
  await screen.findByRole('heading', { name: 'Reminder settings' })
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  await user.click(screen.getByRole('button', { name: 'Notifications', exact: true }))
  await user.click(screen.getByRole('button', { name: 'Clear reminder for Midterm' }))
  await screen.findByText(/No reminders/)
})

test('account menu is the only sign-out entry and invokes the supplied sign-out action', async () => {
  const user = userEvent.setup(), { signOut } = fixture()
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Account', exact: true }))
  await user.click(screen.getByRole('button', { name: 'Sign out', exact: true }))
  expect(signOut).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
})

test('direct URLs and real Back/Forward restore active state and close open dropdowns', async () => {
  window.history.replaceState(null, '', '/?view=spaces')
  const user = userEvent.setup(); fixture()
  expect(screen.getByRole('button', { name: 'Explore', exact: true })).toHaveAttribute('data-active', 'true')
  await user.click(screen.getByRole('button', { name: 'Dashboard' }))
  await user.click(screen.getByRole('button', { name: 'Academics', exact: true }))
  act(() => window.history.back())
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('spaces'))
  expect(screen.getByRole('button', { name: 'Academics', exact: true })).toHaveAttribute('aria-expanded', 'false')
  act(() => window.history.forward())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page'))
})
