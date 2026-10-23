import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import CampusMap from '../src/CampusMap'
import { initialViewport } from '../src/campusExplorerConfig'
const tile = vi.hoisted(() => ({ errors: null as (() => void) | null, url: '', setView: vi.fn(), invalidateSize: vi.fn() }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  TileLayer: ({ url, eventHandlers }: { url: string; eventHandlers: { tileerror: () => void } }) => { tile.url = url; tile.errors = eventHandlers.tileerror; return <button onClick={eventHandlers.tileerror}>Simulate tile failure</button> },
  useMap: () => ({ invalidateSize: tile.invalidateSize }),
  useMapEvents: () => ({ setView: tile.setView }),
}))
test('configured tile failure offers retry and campus reset without leaking a key in UI', () => {
  const key = 'synthetic-test-only'
  render(<CampusMap items={[]} target={null} viewport={initialViewport} onViewport={vi.fn()} onSelect={vi.fn()} config={{ key, mapId: 'approved-style', feedback: '' }} />)
  expect(tile.url).toBe(`https://api.maptiler.com/maps/approved-style/{z}/{x}/{y}.png?key=${key}`)
  fireEvent.click(screen.getByRole('button', { name: 'Simulate tile failure' }))
  expect(screen.getByRole('alert')).toHaveTextContent('You can still use the location list')
  expect(screen.getByRole('alert')).not.toHaveTextContent(key)
  fireEvent.click(screen.getByRole('button', { name: 'Retry map' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Return to campus' }))
  expect(tile.setView).toHaveBeenCalledWith(initialViewport.center, initialViewport.zoom, { animate: false })
})
