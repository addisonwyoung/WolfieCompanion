import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import CampusMap from '../src/CampusMap'
import { initialViewport, maptilerRequest } from '../src/campusExplorerConfig'
const tile = vi.hoisted(() => ({ error: null as (() => void) | null, options: {} as {style: string; attributionControl: boolean; transformRequest: (url: string) => {url: string}}, setView: vi.fn(), invalidateSize: vi.fn(), remove: vi.fn(), off: vi.fn(), removeAttribution: vi.fn(), addAttribution: vi.fn(), setWorkerUrl: vi.fn() }))
const map = vi.hoisted(() => ({ setView: tile.setView, invalidateSize: tile.invalidateSize, attributionControl: { removeAttribution: tile.removeAttribution, addAttribution: tile.addAttribution } }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>, Marker: () => null,
  useMap: () => map, useMapEvents: () => map,
}))
vi.mock('maplibre-gl', () => ({ setWorkerUrl: tile.setWorkerUrl }))
vi.mock('@maplibre/maplibre-gl-leaflet', () => ({ maplibreGL: (options: typeof tile.options) => {
  tile.options = options
  return {
    addTo() { return this },
    getMaplibreMap() { return { on: (_event: string, handler: () => void) => { tile.error = handler }, off: tile.off } },
    remove() { tile.remove() },
  }
} }))
test('vector style, error retry and cleanup preserve the custom style and campus reset', async () => {
  const key = 'synthetic-test-only'
  const { unmount } = render(<CampusMap items={[]} target={null} viewport={initialViewport} onViewport={vi.fn()} onSelect={vi.fn()} config={{ key, mapId: 'approved-style', feedback: '' }} />)
  await waitFor(() => expect(tile.options.style).toBe('https://api.maptiler.com/maps/approved-style/style.json'))
  expect(tile.options.transformRequest('https://api.maptiler.com/fonts/test.pbf').url).toContain(`key=${key}`)
  expect(tile.options.attributionControl).toBe(false)
  expect(tile.setWorkerUrl).toHaveBeenCalledWith(expect.any(String))
  expect(tile.addAttribution).toHaveBeenCalledWith(expect.stringContaining('OpenStreetMap'))
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

test('MapTiler authentication stays on its HTTPS host and replaces stale keys', () => {
  expect(maptilerRequest('https://api.maptiler.com/maps/custom/style.json?key=old', 'new key').url).toBe('https://api.maptiler.com/maps/custom/style.json?key=new+key')
  for (const url of ['https://other.example/tiles', 'https://api.maptiler.com.evil.example/tiles', 'http://api.maptiler.com/tiles', '/local.json']) {
    expect(maptilerRequest(url, 'private-key').url).toBe(url)
  }
})
