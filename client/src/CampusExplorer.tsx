import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CampusLocation, CampusLocationInput, CampusLocationsApi } from './campusLocations'
import { campusCategories } from './campusLocations'
import type { CampusCategory } from './campusLocations'
import { useCampusLocations } from './useCampusLocations'
import CampusMap from './CampusMap'
import type { CampusPoint } from './CampusMap'
import CampusLocationEditor from './CampusLocationEditor'
import { categoryLabels, categoryPaths, explorerConfig, feedbackLink, initialViewport, tilesConfigured } from './campusExplorerConfig'
import type { ExplorerConfig } from './campusExplorerConfig'
import './CampusExplorer.css'

type ExplorerProps = { api: CampusLocationsApi; userId: string; active?: boolean; config?: ExplorerConfig }
type Editing = { input: CampusLocationInput; target: CampusLocation | null; pointChosen: boolean; stage: 'place' | 'form' }
function editableInput(item: CampusLocation): CampusLocationInput {
  const { name, category, latitude, longitude, building, floor, directions, description, access_note, source_url, source_note, verified_at, status } = item
  return { name, category, latitude, longitude, building, floor, directions, description, access_note, source_url, source_note, verified_at, status }
}
export default function CampusExplorer(props: ExplorerProps) {
  // Account changes discard all editor state and pending focus work synchronously.
  return <CampusExplorerView key={props.userId} {...props} />
}
function CampusExplorerView({ api, userId, active = true, config = explorerConfig }: ExplorerProps) {
  const data = useCampusLocations(api, userId, active)
  const [editorMode, setEditorMode] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const editorTrigger = useRef<HTMLElement | null>(null)
  const manageButton = useRef<HTMLButtonElement>(null)
  const mapColumn = useRef<HTMLDivElement>(null)
  const hadEditor = useRef(false)
  const hasEditor = editing !== null
  const managing = editorMode && data.canManage
  const dirty = !!editing && (!editing.target || JSON.stringify(editing.input) !== JSON.stringify(editableInput(editing.target)))
  const latitude = editing?.pointChosen ? editing.input.latitude : undefined
  const longitude = editing?.pointChosen ? editing.input.longitude : undefined
  const category = editing?.pointChosen ? editing.input.category : undefined
  const placement = useMemo(() => latitude !== undefined && longitude !== undefined && category ? { latitude, longitude, category } : undefined, [latitude, longitude, category])
  const capture = useCallback((point: CampusPoint) => setEditing(previous => previous ? { ...previous, input: { ...previous.input, ...point }, pointChosen: true, stage: 'form' } : previous), [])
  const [categories, setCategories] = useState<CampusCategory[]>([...campusCategories])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewport, setViewport] = useState(initialViewport)
  const trigger = useRef<HTMLElement | null>(null)
  const details = useRef<HTMLElement>(null)
  const listHeading = useRef<HTMLHeadingElement>(null)
  const hadSelection = useRef(false)
  const published = useMemo(() => data.items.filter(item => managing || item.status === 'published'), [data.items, managing])
  const filtered = useMemo(() => published.filter(item => categories.includes(item.category)), [published, categories])
  const selected = filtered.find(item => item.id === selectedId) ?? null
  if (selectedId && !selected) setSelectedId(null)
  const onSelect = useCallback((id: string, element: HTMLElement | null) => { if (!hasEditor) { trigger.current = element; setSelectedId(id) } }, [hasEditor])
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
    if (!selected || !active || hasEditor) return
    function dismiss(event: KeyboardEvent) { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [selected, active, close, hasEditor])
  useEffect(() => {
    if (!hasEditor && hadEditor.current) {
      if (editorTrigger.current?.isConnected) editorTrigger.current.focus()
      else if (manageButton.current) manageButton.current.focus()
      else listHeading.current?.focus()
    }
    hadEditor.current = hasEditor
  }, [hasEditor])
  useEffect(() => {
    if (editing?.stage === 'place' && active) mapColumn.current?.querySelector<HTMLElement>('.leaflet-container')?.focus()
  }, [editing?.stage, active])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  async function save(input: CampusLocationInput) {
    if (!editing) return
    const target = editing.target
    if (await data.mutate(() => api.save(input, target ? { id: target.id, revision: target.revision } : undefined))) {
      setEditing(null)
      await data.refresh()
    }
  }
  async function remove() {
    if (!editing?.target) return
    const { id, revision } = editing.target
    if (await data.mutate(() => api.remove(id, revision), id)) { setEditing(null); await data.refresh() }
  }
  async function reload() {
    const items = await data.refresh()
    const latest = items?.find(item => item.id === editing?.target?.id)
    if (!latest) return false
    data.clearMutationMessage()
    // Cancel during the read must not reopen a discarded editor.
    setEditing(previous => previous === editing ? { input: editableInput(latest), target: latest, pointChosen: true, stage: 'form' } : previous)
    return true
  }
  const suggestion = feedbackLink(config.feedback)
  const report = selected ? feedbackLink(config.feedback, selected) : null
  const coincident = selected ? filtered.filter(item => item.id !== selected.id && item.latitude === selected.latitude && item.longitude === selected.longitude) : []
  function toggle(category: CampusCategory) { setCategories(previous => previous.includes(category) ? previous.filter(value => value !== category) : [...previous, category]) }
  return <section className="campus-explorer" aria-labelledby="campus-heading">
    <header className="campus-intro"><div><p className="eyebrow">GOOD PLACES, CLOSE BY</p><h1 id="campus-heading">Campus Explorer</h1><p>The little things that make a campus day easier.</p></div><span className="campus-curated">Curated campus resources</span></header>
    {data.canManage && <div className="campus-editor-bar"><button ref={manageButton} disabled={hasEditor || data.busy} aria-pressed={editorMode} onClick={() => setEditorMode(value => !value)}>{editorMode ? 'Exit editor mode' : 'Manage locations'}</button>{editorMode && <><strong>Editor mode · Drafts and published locations</strong><button disabled={hasEditor || data.busy} onClick={event => {
      data.clearMutationMessage()
      editorTrigger.current = event.currentTarget
      setSelectedId(null)
      setEditing({ input: { name: '', category: 'microwave', latitude: viewport.center[0], longitude: viewport.center[1], building: null, floor: null, directions: '', description: null, access_note: null, source_url: null, source_note: null, verified_at: null, status: 'draft' }, target: null, pointChosen: false, stage: 'place' })
    }}>Add location</button></>}</div>}
    {(data.capabilityError || (editorMode && !data.canManage)) && <p className="campus-notice" role="status">Editing permission is unavailable or being checked. Saved drafts are hidden until confirmed. <button disabled={data.busy} onClick={() => void data.refresh()}>Retry permissions</button></p>}
    {!!data.message && !hasEditor && <p role={data.mutationError ? 'alert' : 'status'}>{data.message}</p>}
    {editing?.stage === 'place' && <div className="campus-notice" role="status"><strong>{editing.target ? 'Reposition location' : 'Add location'}:</strong> Click or tap the map background, or focus the map, pan with arrow keys and choose Use map center. Nothing is saved yet.
      <button disabled={data.busy} onClick={() => { if (editing.pointChosen) setEditing({ ...editing, stage: 'form' }); else setEditing(null) }}>{editing.pointChosen ? 'Back to form' : 'Cancel placement'}</button></div>}
    <fieldset className="campus-legend"><legend>Explore by resource</legend>{campusCategories.map(category => <label key={category} className={categories.includes(category) ? 'is-selected' : ''}><input type="checkbox" checked={categories.includes(category)} onChange={() => toggle(category)} /><span className={`campus-symbol campus-${category}`} aria-hidden="true"><ResourceIcon category={category} /></span>{categoryLabels[category]}</label>)}<button onClick={() => setCategories([...campusCategories])}>Show all</button></fieldset>
    {data.status === 'loading' && <p role="status">Loading campus locations…</p>}
    {data.status === 'error' && <div role="alert" className="campus-notice">{data.message} {data.stale && 'Displayed locations may be out of date.'} <button onClick={() => void data.refresh()}>Retry locations</button></div>}
    {!tilesConfigured(config) && <p className="campus-notice" role="status">Map background setup is pending. Configure VITE_MAPTILER_API_KEY and VITE_MAPTILER_MAP_ID. The location list and map markers remain available.</p>}
    <div className="campus-layout"><div ref={mapColumn} className="campus-map-column">{active && <CampusMap items={filtered} onSelect={onSelect} viewport={viewport} onViewport={setViewport} target={hasEditor ? null : selected} config={config} capture={managing && editing?.stage === 'place' && !data.busy ? capture : undefined} placement={managing ? placement : undefined} />}<p className="campus-map-note">Zoom to explore. Indoor directions are included with each resource.</p></div>
      <div className="campus-results"><div className="campus-results-heading"><h2 ref={listHeading} tabIndex={-1}>Locations</h2><span>{filtered.length} found</span></div>
        {data.status === 'success' && !published.length && <p>{managing ? 'No locations yet. Add a draft to start the campus guide.' : 'No published locations yet. Check back as the campus guide grows.'}</p>}
        {!!published.length && !filtered.length && <p>No matching locations. Choose a category or select Show all.</p>}
        <ul className="campus-location-list">{filtered.map(item => <li key={item.id}><button disabled={hasEditor} aria-pressed={selected?.id === item.id} onClick={event => onSelect(item.id, event.currentTarget)}><span className={`campus-symbol campus-${item.category}`} aria-hidden="true"><ResourceIcon category={item.category} /></span><span><strong>{item.name}</strong>{managing && <span className={`campus-publication campus-publication-${item.status}`}>{item.status === 'draft' ? 'Draft' : 'Published'}</span>}<small>{[categoryLabels[item.category], item.building, item.floor && `Floor ${item.floor}`].filter(Boolean).join(' · ')}</small></span><span aria-hidden="true">↗</span></button></li>)}</ul>
      </div>
    </div>
    {selected && <section className="campus-details" aria-labelledby="campus-detail-heading" ref={details} tabIndex={-1}><div className="campus-detail-top"><div><p className="eyebrow">{categoryLabels[selected.category]}</p><h2 id="campus-detail-heading">{selected.name}</h2></div><button onClick={close} aria-label="Close location details">Close ✕</button></div><p className="campus-detail-place">{[selected.building, selected.floor && `Floor ${selected.floor}`].filter(Boolean).join(' · ')}</p><h3>Find it</h3><p>{selected.directions}</p>{selected.description && <p>{selected.description}</p>}{selected.access_note && <p><strong>Access: </strong>{selected.access_note}</p>}<Source item={selected} />
      {managing && <div className="campus-editor-actions"><span className="campus-publication">{selected.status === 'draft' ? 'Draft' : 'Published'}</span><button disabled={hasEditor || data.busy} onClick={event => { data.clearMutationMessage(); editorTrigger.current = event.currentTarget; setEditing({ input: editableInput(selected), target: selected, pointChosen: true, stage: 'form' }) }}>Edit location</button></div>}
      {!!coincident.length && <div className="campus-coincident"><h3>Also at this point</h3>{coincident.map(item => <button key={item.id} onClick={event => onSelect(item.id, event.currentTarget)}>{item.name}{item.floor && ` · Floor ${item.floor}`}</button>)}</div>}
      {report ? <a href={report} target="_blank" rel="noreferrer">Report an issue</a> : <span className="muted">Issue reporting link is being set up.</span>}
    </section>}
    <footer className="campus-footer"><p>{managing ? 'Drafts require manual verification before publication.' : 'Manually verified locations. Please check access notes before visiting.'}</p>{suggestion ? <a href={suggestion} target="_blank" rel="noreferrer">Suggest a location</a> : <span>Suggestion link is being set up.</span>}<a href={`${import.meta.env.BASE_URL}third-party-notices.txt`}>Map library notices</a></footer>
    {active && editing?.stage === 'form' && <CampusLocationEditor input={editing.input} target={editing.target} dirty={dirty} allowed={managing} busy={data.busy} error={data.mutationError} onChange={input => setEditing({ ...editing, input })} onSave={save} onDelete={remove} onCancel={() => setEditing(null)} onReposition={() => setEditing({ ...editing, stage: 'place' })} onReload={reload} onRetry={() => void data.refresh()} />}
  </section>
}
function ResourceIcon({ category }: { category: CampusCategory }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={categoryPaths[category]} /></svg>
}
function Source({ item }: { item: CampusLocation }) {
  const source = item.source_url?.startsWith('https://') ? item.source_url : null
  return <div className="campus-source">{item.source_note && <p>{item.source_note}</p>}{source && <a href={source} target="_blank" rel="noreferrer">Reference source</a>}{item.verified_at && <p>Verified {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' }).format(new Date(item.verified_at))}</p>}</div>
}
