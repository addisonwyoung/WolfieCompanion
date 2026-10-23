import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CampusLocation, CampusLocationsApi } from './campusLocations'
import { campusCategories } from './campusLocations'
import type { CampusCategory } from './campusLocations'
import { useCampusLocations } from './useCampusLocations'
import CampusMap from './CampusMap'
import { categoryLabels, categoryPaths, explorerConfig, feedbackLink, initialViewport, tilesConfigured } from './campusExplorerConfig'
import type { ExplorerConfig } from './campusExplorerConfig'
import './CampusExplorer.css'

export default function CampusExplorer({ api, userId, active = true, config = explorerConfig }: { api: CampusLocationsApi; userId: string; active?: boolean; config?: ExplorerConfig }) {
  const data = useCampusLocations(api, userId, active)
  const [categories, setCategories] = useState<CampusCategory[]>([...campusCategories])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewport, setViewport] = useState(initialViewport)
  const trigger = useRef<HTMLElement | null>(null)
  const details = useRef<HTMLElement>(null)
  const listHeading = useRef<HTMLHeadingElement>(null)
  const hadSelection = useRef(false)
  // Student-facing view only, even if the caller is a catalog editor.
  const published = useMemo(() => data.items.filter(item => item.status === 'published'), [data.items])
  const filtered = useMemo(() => published.filter(item => categories.includes(item.category)), [published, categories])
  const selected = filtered.find(item => item.id === selectedId) ?? null
  if (selectedId && !selected) setSelectedId(null)
  const onSelect = useCallback((id: string, element: HTMLElement | null) => { trigger.current = element; setSelectedId(id) }, [])
  const close = useCallback(() => {
    setSelectedId(null)
    if (trigger.current?.isConnected) trigger.current.focus()
    else listHeading.current?.focus()
  }, [])
  useEffect(() => {
    if (selectedId) details.current?.focus()
    else if (hadSelection.current) {
      if (trigger.current?.isConnected) trigger.current.focus()
      else listHeading.current?.focus()
    }
    hadSelection.current = !!selectedId
  }, [selectedId])
  useEffect(() => {
    if (!selected || !active) return
    function dismiss(event: KeyboardEvent) { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [selected, active, close])
  const suggestion = feedbackLink(config.feedback)
  const report = selected ? feedbackLink(config.feedback, selected) : null
  const coincident = selected ? filtered.filter(item => item.id !== selected.id && item.latitude === selected.latitude && item.longitude === selected.longitude) : []
  function toggle(category: CampusCategory) { setCategories(previous => previous.includes(category) ? previous.filter(value => value !== category) : [...previous, category]) }
  return <section className="campus-explorer" aria-labelledby="campus-heading">
    <header className="campus-intro"><div><p className="eyebrow">GOOD PLACES, CLOSE BY</p><h1 id="campus-heading">Campus Explorer</h1><p>The little things that make a campus day easier.</p></div><span className="campus-curated">Curated campus resources</span></header>
    <fieldset className="campus-legend"><legend>Explore by resource</legend>{campusCategories.map(category => <label key={category} className={categories.includes(category) ? 'is-selected' : ''}><input type="checkbox" checked={categories.includes(category)} onChange={() => toggle(category)} /><span className={`campus-symbol campus-${category}`} aria-hidden="true"><ResourceIcon category={category} /></span>{categoryLabels[category]}</label>)}<button onClick={() => setCategories([...campusCategories])}>Show all</button></fieldset>
    {data.status === 'loading' && <p role="status">Loading campus locations…</p>}
    {data.status === 'error' && <div role="alert" className="campus-notice">{data.message} {data.stale && 'Displayed locations may be out of date.'} <button onClick={() => void data.refresh()}>Retry locations</button></div>}
    {!tilesConfigured(config) && <p className="campus-notice" role="status">Map background setup is pending. Configure VITE_MAPTILER_API_KEY and VITE_MAPTILER_MAP_ID. The location list and map markers remain available.</p>}
    <div className="campus-layout"><div className="campus-map-column">{active && <CampusMap items={filtered} onSelect={onSelect} viewport={viewport} onViewport={setViewport} target={selected} config={config} />}<p className="campus-map-note">Zoom to explore. Indoor directions are included with each resource.</p></div>
      <div className="campus-results"><div className="campus-results-heading"><h2 ref={listHeading} tabIndex={-1}>Locations</h2><span>{filtered.length} found</span></div>
        {data.status === 'success' && !published.length && <p>No published locations yet. Check back as the campus guide grows.</p>}
        {!!published.length && !filtered.length && <p>No matching locations. Choose a category or select Show all.</p>}
        <ul className="campus-location-list">{filtered.map(item => <li key={item.id}><button aria-pressed={selected?.id === item.id} onClick={event => onSelect(item.id, event.currentTarget)}><span className={`campus-symbol campus-${item.category}`} aria-hidden="true"><ResourceIcon category={item.category} /></span><span><strong>{item.name}</strong><small>{[categoryLabels[item.category], item.building, item.floor && `Floor ${item.floor}`].filter(Boolean).join(' · ')}</small></span><span aria-hidden="true">↗</span></button></li>)}</ul>
      </div>
    </div>
    {selected && <section className="campus-details" aria-labelledby="campus-detail-heading" ref={details} tabIndex={-1}><div className="campus-detail-top"><div><p className="eyebrow">{categoryLabels[selected.category]}</p><h2 id="campus-detail-heading">{selected.name}</h2></div><button onClick={close} aria-label="Close location details">Close ✕</button></div><p className="campus-detail-place">{[selected.building, selected.floor && `Floor ${selected.floor}`].filter(Boolean).join(' · ')}</p><h3>Find it</h3><p>{selected.directions}</p>{selected.description && <p>{selected.description}</p>}{selected.access_note && <p><strong>Access: </strong>{selected.access_note}</p>}<Source item={selected} />
      {!!coincident.length && <div className="campus-coincident"><h3>Also at this point</h3>{coincident.map(item => <button key={item.id} onClick={event => onSelect(item.id, event.currentTarget)}>{item.name}{item.floor && ` · Floor ${item.floor}`}</button>)}</div>}
      {report ? <a href={report} target="_blank" rel="noreferrer">Report an issue</a> : <span className="muted">Issue reporting link is being set up.</span>}
    </section>}
    <footer className="campus-footer"><p>Manually verified locations. Please check access notes before visiting.</p>{suggestion ? <a href={suggestion} target="_blank" rel="noreferrer">Suggest a location</a> : <span>Suggestion link is being set up.</span>}<a href={`${import.meta.env.BASE_URL}third-party-notices.txt`}>Map library notices</a></footer>
  </section>
}
function ResourceIcon({ category }: { category: CampusCategory }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={categoryPaths[category]} /></svg>
}
function Source({ item }: { item: CampusLocation }) {
  const source = item.source_url?.startsWith('https://') ? item.source_url : null
  return <div className="campus-source">{item.source_note && <p>{item.source_note}</p>}{source && <a href={source} target="_blank" rel="noreferrer">Reference source</a>}{item.verified_at && <p>Verified {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' }).format(new Date(item.verified_at))}</p>}</div>
}
