import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import CampusExplorer from '../src/CampusExplorer'
import { feedbackLink, tilesConfigured } from '../src/campusExplorerConfig'
import type { CampusLocation, CampusLocationsApi } from '../src/campusLocations'
const map = vi.hoisted(() => ({ ids: [] as string[] }))
vi.mock('../src/CampusMap', () => ({ default: ({ items, onSelect }: { items: CampusLocation[]; onSelect: (id: string, element: HTMLElement) => void }) => {
  map.ids = items.map(item => item.id)
  return <div aria-label="Campus resource map">{items.map(item => <button key={item.id} onClick={event => onSelect(item.id, event.currentTarget)}>Map: {item.name}</button>)}</div>
} }))
const base = { latitude: 40.914, longitude: -73.12, building: 'Library', floor: '2', directions: 'Beside the stairs', description: null, access_note: null, source_url: null, source_note: 'On-site check', verified_at: '2026-10-23T12:00:00Z', status: 'published', revision: 1, created_at: '', updated_at: '' } as const
const items: CampusLocation[] = [{ ...base, id: 'p', name: 'Library printer', category: 'printer' }, { ...base, id: 'w', name: 'Bottle filler', category: 'drinking_water', floor: '1' }, { ...base, id: 'draft', name: 'Unpublished', category: 'microwave', status: 'draft' }]
function api(): CampusLocationsApi { return { load: vi.fn().mockResolvedValue(items), canManage: vi.fn().mockResolvedValue(false), save: vi.fn(), remove: vi.fn() } }
const config = { key: '', mapId: '', feedback: 'https://example.edu/form' }
test('legend and list stay synchronized, expose coincident records and persistent keyboard details', async () => {
  const source = api()
  render(<CampusExplorer api={source} userId="a" config={config} />)
  const entry = await screen.findByRole('button', { name: /Library printer.*Printers/ })
  expect(screen.queryByText('Unpublished')).not.toBeInTheDocument()
  expect(map.ids).toEqual(['p', 'w'])
  fireEvent.click(entry)
  const detail = screen.getByRole('region', { name: 'Library printer' })
  expect(detail).toHaveFocus()
  expect(detail).toHaveTextContent('Beside the stairs')
  expect(screen.getByRole('link', { name: 'Report an issue' })).toHaveAttribute('href', expect.stringContaining('p%3A+Library+printer'))
  fireEvent.click(screen.getByRole('button', { name: 'Bottle filler · Floor 1' }))
  expect(screen.getByRole('region', { name: 'Bottle filler' })).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('region', { name: 'Bottle filler' })).not.toBeInTheDocument()
  fireEvent.click(entry)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Printers' }))
  expect(screen.queryByRole('region', { name: 'Library printer' })).not.toBeInTheDocument()
  expect(map.ids).toEqual(['w'])
  for (const checkbox of screen.getAllByRole('checkbox')) if ((checkbox as HTMLInputElement).checked) fireEvent.click(checkbox)
  expect(screen.getByText(/No matching locations/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
  expect(map.ids).toEqual(['p', 'w'])
  expect(source.load).toHaveBeenCalledTimes(1)
})
test('setup, successful empty, and storage failures remain distinct and retryable', async () => {
  const source = api()
  vi.mocked(source.load).mockRejectedValueOnce(new Error('Storage is not set up')).mockResolvedValue([])
  render(<CampusExplorer api={source} userId="a" config={{ ...config, feedback: '' }} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Storage is not set up')
  expect(screen.getByText(/Map background setup is pending/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Suggest a location' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry locations' }))
  await screen.findByText(/No published locations yet/)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
test('details close restores list focus and inactive view unmounts the map', async () => {
  const source = api()
  const { rerender } = render(<CampusExplorer api={source} userId="a" config={config} />)
  const entry = await screen.findByRole('button', { name: /Library printer.*Printers/ })
  fireEvent.click(entry); fireEvent.click(screen.getByRole('button', { name: 'Close location details' }))
  expect(entry).toHaveFocus()
  rerender(<CampusExplorer api={source} userId="a" active={false} config={config} />)
  await waitFor(() => expect(screen.queryByLabelText('Campus resource map')).not.toBeInTheDocument())
})
test('provider and feedback placeholders never become credentials or unsafe links', () => {
  expect(tilesConfigured({ key: 'YOUR_KEY', mapId: 'streets-v2', feedback: '' })).toBe(false)
  expect(tilesConfigured({ key: 'configured', mapId: '../arbitrary', feedback: '' })).toBe(false)
  expect(feedbackLink('javascript:alert(1)')).toBeNull()
  expect(feedbackLink('https://user:password@example.edu')).toBeNull()
  const url = feedbackLink('mailto:team@example.edu', { id: 'p', name: 'Printer & water' })!
  expect(url).toContain('body=Location')
  expect(url).not.toContain('access_token')
})
