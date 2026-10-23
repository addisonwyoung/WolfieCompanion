import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { divIcon, tooltip } from 'leaflet'
import type { LeafletEvent, Marker as LeafletMarker } from 'leaflet'
import type { CampusLocation } from './campusLocations'
import { campusCategories } from './campusLocations'
import { categoryLabels, categoryPaths, initialViewport, tilesConfigured } from './campusExplorerConfig'
import type { CampusViewport, ExplorerConfig } from './campusExplorerConfig'
import 'leaflet/dist/leaflet.css'

// Five static icon instances; no React root or rich popup per marker.
const icons = Object.fromEntries(campusCategories.map(category => [category, divIcon({
  className: `campus-pin campus-${category}`, html: `<span aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${categoryPaths[category]}" /></svg></span>`, iconSize: [32, 38], iconAnchor: [16, 38],
})]))
type Select = (id: string, trigger: HTMLElement | null) => void
const ResourceMarker = memo(function ResourceMarker({ item, onSelect, preview, leave }: { item: CampusLocation; onSelect: Select; preview: (item: CampusLocation, focused?: boolean) => void; leave: () => void }) {
  const marker = useRef<LeafletMarker>(null)
  const leaveIfInactive = useCallback(() => {
    const element = marker.current?.getElement()
    if (element !== document.activeElement && !element?.matches(':hover')) leave()
  }, [leave])
  useEffect(() => {
    const element = marker.current?.getElement()
    const focus = () => preview(item, true)
    element?.addEventListener('focus', focus)
    element?.addEventListener('blur', leaveIfInactive)
    return () => { element?.removeEventListener('focus', focus); element?.removeEventListener('blur', leaveIfInactive) }
  }, [item, preview, leaveIfInactive])
  const handlers = useMemo(() => ({
    click: (event: LeafletEvent) => onSelect(item.id, (event.target as LeafletMarker).getElement() ?? null),
    mouseover: () => preview(item), mousemove: () => preview(item), mouseout: leaveIfInactive,
  }), [item, onSelect, preview, leaveIfInactive])
  return <Marker ref={marker} position={[item.latitude, item.longitude]} icon={icons[item.category]} title={`${item.name}, ${categoryLabels[item.category]}`} alt={item.name} keyboard eventHandlers={handlers} />
})
function MapLifecycle({ onViewport, target }: { onViewport: (viewport: CampusViewport) => void; target: CampusLocation | null }) {
  const map = useMapEvents({ moveend: () => { const point = map.getCenter(); onViewport({ center: [point.lat, point.lng], zoom: map.getZoom() }) } })
  useEffect(() => { if (target) map.setView([target.latitude, target.longitude], Math.max(map.getZoom(), 17), { animate: false }) }, [map, target])
  return <button type="button" className="campus-return" onClick={() => map.setView(initialViewport.center, initialViewport.zoom, { animate: false })}>Return to campus</button>
}
function TileStatus({ config }: { config: ExplorerConfig }) {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const map = useMap()
  if (!tilesConfigured(config)) return null
  return <>
    <TileLayer key={attempt} url={`https://api.maptiler.com/maps/${config.mapId}/{z}/{x}/{y}.png?key=${encodeURIComponent(config.key)}`} tileSize={512} zoomOffset={-1} maxNativeZoom={19} maxZoom={20}
      attribution={'&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}
      eventHandlers={{ tileerror: () => setFailed(true) }} />
    {failed && <div className="campus-tile-error" role="alert">Map tiles could not load. You can still use the location list. <button onClick={() => { setFailed(false); setAttempt(n => n + 1); map.invalidateSize() }}>Retry map</button></div>}
  </>
}
// React Leaflet Tooltip needs a parent layer. This single shared map overlay
// instead uses Leaflet's standalone tooltip API and a React text-only portal.
function Preview({ item, stay, leave }: { item: CampusLocation; stay: () => void; leave: () => void }) {
  const map = useMap()
  const container = useMemo(() => document.createElement('div'), [])
  useEffect(() => {
    const overlay = tooltip({ permanent: true, interactive: true, direction: 'top', offset: [0, -36] }).setLatLng([item.latitude, item.longitude]).setContent(container).addTo(map)
    return () => { overlay.remove() }
  }, [map, item, container])
  return createPortal(<div onMouseEnter={stay} onMouseLeave={leave}><strong>{item.name}</strong><br />{categoryLabels[item.category]}{item.building && ` · ${item.building}`}</div>, container)
}
export default function CampusMap({ items, onSelect, viewport, onViewport, target, config }: {
  items: CampusLocation[]; onSelect: Select; viewport: CampusViewport; onViewport: (viewport: CampusViewport) => void; target: CampusLocation | null; config: ExplorerConfig
}) {
  const [hover, setHover] = useState<CampusLocation | null>(null)
  const dismissed = useRef(false)
  const previewId = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = useCallback(() => { if (timer.current) clearTimeout(timer.current) }, [])
  const preview = useCallback((item: CampusLocation, focused = false) => {
    if (dismissed.current && !focused) return
    if (focused) dismissed.current = false
    cancel()
    // Pointer movement within the same marker does not schedule React updates.
    if (previewId.current !== item.id) { previewId.current = item.id; setHover(item) }
  }, [cancel])
  const leave = useCallback(() => { cancel(); timer.current = setTimeout(() => { previewId.current = null; setHover(null) }, 150) }, [cancel])
  useEffect(() => cancel, [cancel])
  useEffect(() => {
    if (!hover) return
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') { dismissed.current = true; previewId.current = null; cancel(); setHover(null) } }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [hover, cancel])
  const visibleHover = hover && items.some(item => item.id === hover.id) ? hover : null
  return <div className="campus-map" aria-label="Campus resource map" onPointerMoveCapture={() => { dismissed.current = false }}>
    <MapContainer center={viewport.center} zoom={viewport.zoom} maxZoom={20} scrollWheelZoom={false}>
      <TileStatus config={config} />
      <MapLifecycle onViewport={onViewport} target={target} />
      {items.map(item => <ResourceMarker key={item.id} item={item} onSelect={onSelect} preview={preview} leave={leave} />)}
      {visibleHover && <Preview item={visibleHover} stay={cancel} leave={leave} />}
    </MapContainer>
    {tilesConfigured(config) && <a className="campus-maptiler" href="https://www.maptiler.com/" target="_blank" rel="noreferrer" aria-label="MapTiler maps"><img src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler" width="86" height="25" /></a>}
  </div>
}
