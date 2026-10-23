import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import CampusMap from '../src/CampusMap'
import { initialViewport } from '../src/campusExplorerConfig'
const tile = vi.hoisted(() => ({ error: null as (() => void) | null, options: {} as {apiKey: string; style: string}, setView: vi.fn(), invalidateSize: vi.fn(), remove: vi.fn(), off: vi.fn(), removeAttribution: vi.fn() }))
const map = vi.hoisted(() => ({ setView: tile.setView, invalidateSize: tile.invalidateSize, attributionControl: { removeAttribution: tile.removeAttribution } }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>, Marker: () => null,
  useMap: () => map, useMapEvents: () => map,
}))
vi.mock('@maptiler/leaflet-maptilersdk', () => ({ MaptilerLayer: class {
  constructor(options: typeof tile.options) { tile.options = options }
  addTo() { return this }
  getMaptilerSDKMap() { return { on: (_event: string, handler: () => void) => { tile.error = handler }, off: tile.off } }
  remove() { tile.remove() }
} }))
test('vector style, error retry and cleanup preserve the custom style and campus reset', async () => {
  const key = 'synthetic-test-only'
  const { unmount } = render(<CampusMap items={[]} target={null} viewport={initialViewport} onViewport={vi.fn()} onSelect={vi.fn()} config={{ key, mapId: 'approved-style', feedback: '' }} />)
  await waitFor(() => expect(tile.options.style).toBe('https://api.maptiler.com/maps/approved-style/style.json'))
  expect(tile.options.apiKey).toBe(key)
  act(() => tile.error?.())
  expect(screen.getByRole('alert')).toHaveTextContent('You can still use the location list')
  expect(screen.getByRole('alert')).not.toHaveTextContent(key)
  fireEvent.click(screen.getByRole('button', { name: 'Retry map' }))
  await waitFor(() => expect(tile.remove).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Return to campus' }))
  expect(tile.setView).toHaveBeenCalledWith(initialViewport.center, initialViewport.zoom, { animate: false })
  await act(async () => { unmount() })
  expect(tile.remove).toHaveBeenCalledTimes(2)
  expect(tile.off).toHaveBeenCalledTimes(2)
  expect(tile.removeAttribution).toHaveBeenCalledTimes(2)
})
