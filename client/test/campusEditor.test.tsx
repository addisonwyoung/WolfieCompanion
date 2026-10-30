import './academicDialogSupport'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import CampusExplorer from '../src/CampusExplorer'
import { CampusLocationError } from '../src/campusLocations'
import type { CampusLocation, CampusLocationInput, CampusLocationsApi } from '../src/campusLocations'
import type { CampusPoint } from '../src/CampusMap'

vi.mock('../src/CampusMap', () => ({ default: ({ capture, placement }: { capture?: (point: CampusPoint) => void; placement?: CampusPoint }) => <div className="leaflet-container" tabIndex={0}>
  {capture && <button onClick={() => capture({ latitude: 40.93, longitude: -73.13 })}>Use map center</button>}
  {placement && <span>Preview {placement.latitude}, {placement.longitude}</span>}
</div> }))
const item: CampusLocation = {
  id: '10000000-0000-0000-0000-000000000031', name: 'Library printer', category: 'printer', latitude: 40.91, longitude: -73.12,
  building: 'Library', floor: '2', directions: 'Beside stairs', description: null, access_note: null,
  source_url: null, source_note: 'Verified on site', verified_at: '2026-10-23T12:00:00Z', status: 'published',
  revision: 1, created_at: '2026-10-23T12:00:00Z', updated_at: '2026-10-23T12:00:00Z',
}
function fixture() {
  let rows = [{ ...item }, { ...item, id: 'draft', name: 'Hidden draft', status: 'draft' as const }]
  const api = {
    load: vi.fn(async () => rows.map(row => ({ ...row }))), canManage: vi.fn(async () => true),
    save: vi.fn(async (input: CampusLocationInput, target?: { id: string; revision: number }) => {
      const next = { ...input, id: target?.id ?? 'new', revision: (target?.revision ?? 0) + 1, created_at: item.created_at, updated_at: item.updated_at }
      rows = [...rows.filter(row => row.id !== next.id), next]; return next
    }),
    remove: vi.fn(async (id: string) => { rows = rows.filter(row => row.id !== id) }),
  } satisfies CampusLocationsApi
  return { api, replace: (next: CampusLocation) => { rows = rows.map(row => row.id === next.id ? next : row) } }
}
const config = { key: '', mapId: '', feedback: '' }
function show(api: CampusLocationsApi, userId = 'editor') { return render(<CampusExplorer api={api} userId={userId} config={config} />) }
async function manage() { fireEvent.click(await screen.findByRole('button', { name: 'Manage locations' })) }
async function edit() {
  fireEvent.click(await screen.findByRole('button', { name: /Library printer.*Published/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit location' }))
  await screen.findByRole('dialog', { name: 'Edit location' })
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
function save() { fireEvent.click(screen.getByRole('button', { name: 'Save location' })) }

test('editor controls fail closed while permission is pending, false or failed; students never see drafts', async () => {
  const { api } = fixture()
  let resolve!: (allowed: boolean) => void
  api.canManage.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done }))
  show(api)
  expect(screen.queryByRole('button', { name: 'Manage locations' })).not.toBeInTheDocument()
  await act(async () => resolve(false))
  expect(await screen.findByRole('button', { name: /Library printer/ })).toBeInTheDocument()
  expect(screen.queryByText('Hidden draft')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Manage locations' })).not.toBeInTheDocument()
  api.canManage.mockRejectedValueOnce(new Error('Unavailable'))
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  await screen.findByRole('button', { name: 'Retry permissions' })
  expect(api.save).not.toHaveBeenCalled()
  expect(api.remove).not.toHaveBeenCalled()
})

test('creates a draft only after capture and save, validates directions/description and refreshes persisted rows', async () => {
  const { api } = fixture(); const view = show(api)
  await manage()
  expect(screen.getByText('Hidden draft')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add location' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(api.save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Use map center' }))
  expect(screen.getByLabelText('Name')).toHaveFocus()
  change('Name', 'New water station'); save()
  expect(screen.getByRole('alert')).toHaveTextContent('Directions')
  change('Directions', 'Ground floor'); change('Description (optional)', 'x'.repeat(2001)); save()
  expect(screen.getByRole('alert')).toHaveTextContent('Description')
  change('Description (optional)', '  ')
  expect(screen.getByLabelText('Publication')).toHaveValue('draft')
  save()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ latitude: 40.93, longitude: -73.13, description: null, status: 'draft' }), undefined)
  expect(api.load).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('button', { name: /New water station.*Draft/ })).toBeInTheDocument()
  view.unmount(); show(api); await manage()
  expect(screen.getByRole('button', { name: /New water station.*Draft/ })).toBeInTheDocument()
})

test('publishes only with provenance and verification, can unpublish, and preserves verification on ordinary edits', async () => {
  const { api } = fixture(); show(api); await manage(); await edit()
  change('Publication', 'published'); change('Source note', ''); change('Verified at (your local time)', ''); save()
  expect(screen.getByRole('alert')).toHaveTextContent('Publication requires')
  expect(api.save).not.toHaveBeenCalled()
  change('Source URL (HTTPS)', 'javascript:bad'); save()
  expect(screen.getByRole('alert')).toHaveTextContent('HTTPS')
  change('Source URL (HTTPS)', 'https://example.edu/reference')
  fireEvent.click(screen.getByRole('button', { name: 'Verify now' })); save()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(api.save.mock.calls[0][0]).toMatchObject({ status: 'published', description: null, verified_at: expect.any(String) })
  const verified = api.save.mock.calls[0][0].verified_at
  await edit(); change('Publication', 'draft'); change('Description (optional)', 'Corrected description'); save()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(api.save.mock.calls[1]).toEqual([expect.objectContaining({ status: 'draft', verified_at: verified }), { id: item.id, revision: 2 }])
})

test('repositions the same record, retains fields on failure and blocks duplicate saves', async () => {
  const { api } = fixture(); show(api); await manage(); await edit()
  change('Name', 'Corrected printer')
  fireEvent.click(screen.getByRole('button', { name: 'Reposition on map' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Use map center' }))
  expect(screen.getByLabelText('Name')).toHaveValue('Corrected printer')
  api.save.mockRejectedValueOnce(new CampusLocationError('request', 'Network unavailable')); save()
  await screen.findByText('Network unavailable')
  expect(screen.getByText(/Selected position: 40.930000, -73.130000/)).toBeInTheDocument()
  expect(screen.getByLabelText('Name')).toHaveValue('Corrected printer')
  let resolve!: (next: CampusLocation) => void
  api.save.mockImplementationOnce(() => new Promise<CampusLocation>(done => { resolve = done }))
  save()
  expect(screen.getByRole('button', { name: 'Saving changes…' })).toBeDisabled()
  fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
  expect(api.save).toHaveBeenCalledTimes(2)
  expect(api.save.mock.calls[1][1]).toEqual({ id: item.id, revision: 1 })
  await act(async () => resolve({ ...item, revision: 2 }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('stale revisions retain edits until explicitly discarded for the latest row; deletion is confirmed and revision-conditional', async () => {
  const f = fixture(); show(f.api); await manage(); await edit()
  change('Description (optional)', 'My correction')
  f.replace({ ...item, description: 'Other editor correction', revision: 2 })
  f.api.save.mockRejectedValueOnce(new CampusLocationError('conflict', 'Reload before retrying; keep your draft.')); save()
  await screen.findByText(/Reload before retrying/)
  expect(screen.getByLabelText('Description (optional)')).toHaveValue('My correction')
  fireEvent.click(screen.getByRole('button', { name: 'Reload latest location' }))
  fireEvent.click(screen.getByRole('button', { name: 'Reload and discard edits' }))
  await waitFor(() => expect(screen.getByLabelText('Description (optional)')).toHaveValue('Other editor correction'))
  fireEvent.click(screen.getByRole('button', { name: 'Delete location' }))
  expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(f.api.remove).not.toHaveBeenCalled()
  f.api.remove.mockRejectedValueOnce(new CampusLocationError('conflict', 'Deletion conflicted'))
  fireEvent.click(screen.getByRole('button', { name: 'Delete location' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
  await screen.findByText('Deletion conflicted')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(f.api.remove).toHaveBeenCalledWith(item.id, 2)
  fireEvent.click(screen.getByRole('button', { name: 'Delete location' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.queryByRole('button', { name: /Library printer/ })).not.toBeInTheDocument()
})

test('revocation disables writes but preserves a recoverable draft; cancel and account change clear drafts', async () => {
  const { api } = fixture(); const view = show(api); await manage(); await edit()
  change('Name', 'Unsaved name')
  api.canManage.mockResolvedValue(false)
  api.save.mockRejectedValueOnce(new CampusLocationError('permission', 'Editing was revoked')); save()
  await screen.findByText(/Editing permission is unavailable. Your draft is retained/)
  expect(screen.getByRole('button', { name: 'Save location' })).toBeDisabled()
  expect(screen.getByLabelText('Name')).toHaveValue('Unsaved name')
  api.canManage.mockResolvedValue(true)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retry permissions' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save location' })).toBeEnabled())
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Exit editor mode' })).toHaveFocus()
  await edit(); change('Name', 'Another draft')
  view.rerender(<CampusExplorer api={api} userId="other-account" config={config} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('Another draft')).not.toBeInTheDocument()
  await manage(); await edit(); change('Name', 'Pending old-account draft')
  let resolve!: (next: CampusLocation) => void
  api.save.mockImplementationOnce(() => new Promise<CampusLocation>(done => { resolve = done })); save()
  // The account workspace unmounts Explorer on sign-out, even during a write.
  view.rerender(<p>Signed out</p>)
  await act(async () => resolve({ ...item, name: 'Pending old-account draft', revision: 2 }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('Pending old-account draft')).not.toBeInTheDocument()
  view.unmount()
  expect(document.body.style.overflow).not.toBe('hidden')
})

test('a late reload does not reopen an editor canceled while the read was pending', async () => {
  const { api } = fixture(); show(api); await manage(); await edit()
  let resolve!: (items: CampusLocation[]) => void
  api.load.mockImplementationOnce(() => new Promise<CampusLocation[]>(done => { resolve = done }))
  fireEvent.click(screen.getByRole('button', { name: 'Reload latest location' }))
  fireEvent.click(screen.getByRole('button', { name: 'Reload and discard edits' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(async () => resolve([{ ...item, revision: 2 }]))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(api.save).not.toHaveBeenCalled()
})
