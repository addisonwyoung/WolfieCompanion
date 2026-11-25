import { useEffect, useRef, useState } from 'react'
import { readableTimestamp } from './dateTime'
import { loadLibraryOccupancy, occupancyLoadingDelayMs, occupancySource, occupancyStatus } from './libraryOccupancyApi'
import type { LiveLibraryReading } from './libraryOccupancyApi'
import { amenitiesSource, libraryDetails } from './libraryDetails'
import OccupancyChart from './OccupancyChart'
import './CrowdMeter.css'

function LibraryImage({ id, name, detail = false }: { id: number; name: string; detail?: boolean }) {
  const photo = libraryDetails[id]?.photo
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const visiblePhoto = photo && failedSource !== photo.src ? photo : null
  return <><div className="library-image">
    {visiblePhoto ? <img src={visiblePhoto.src} alt={visiblePhoto.alt} style={{ objectPosition: visiblePhoto.position }} decoding="async" onError={() => setFailedSource(visiblePhoto.src)} /> : <>
      <svg viewBox="0 0 160 100" fill="none" aria-hidden="true"><path d="M27 76h106M36 76V36l44-18 44 18v40M49 76V44h18v32M75 76V44h18v32M101 76V44h10v32M30 36h100" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M22 84h116" stroke="currentColor" strokeWidth="2" /></svg>
      <span className="library-image-label">{name} · Photo placeholder</span>
    </>}
  </div>{detail && visiblePhoto && <p className="library-photo-credit">Photo source: <a href={visiblePhoto.sourceUrl}>{visiblePhoto.credit}</a></p>}</>
}

function Reading({ row, now }: { row: LiveLibraryReading; now: number }) {
  const status = occupancyStatus(row, now)
  const usable = status !== 'unavailable'
  const age = row.retrievedAt ? Math.max(0, Math.floor((now - Date.parse(row.retrievedAt)) / 60_000)) : null
  return <div className={`library-reading library-reading-${status}`}>
    <div className="library-reading-top">
      <p className="library-percentage">{usable ? <>{row.percentage}<span>% full</span></> : <span className="library-no-reading">Current occupancy unavailable</span>}</p>
      {usable && <span className={`library-level library-level-${row.crowdLevel!.toLowerCase()}`}>{row.crowdLevel}</span>}
    </div>
    {usable ? <>
      <div className="library-meter" role="meter" aria-label={`${row.name} occupancy`} aria-valuenow={row.percentage!} aria-valuemin={0} aria-valuemax={100}>
        <span className={`library-meter-fill library-fill-${row.crowdLevel!.toLowerCase()}`} style={{ width: `${row.percentage}%` }} />
      </div>
      <p className="library-retrieved">{status === 'stale' ? 'Last retrieved ' : 'Retrieved '}<time dateTime={row.retrievedAt!} title={readableTimestamp(row.retrievedAt!)}>{age === 0 ? 'just now' : `${age} min ago`}</time></p>
    </> : null}
  </div>
}

export default function CrowdMeter() {
  const [locations, setLocations] = useState<LiveLibraryReading[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const pending = useRef(true)
  const retryFocus = useRef(false)
  const retryButton = useRef<HTMLButtonElement>(null)
  const featureHeading = useRef<HTMLHeadingElement>(null)
  const [now, setNow] = useState(() => Date.now())
  const generation = useRef(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const cards = useRef(new Map<number, HTMLButtonElement>())
  const restoreFocus = useRef<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const token = ++generation.current
    const delayed = window.setTimeout(() => {
      if (!controller.signal.aborted && token === generation.current) setSlow(true)
    }, occupancyLoadingDelayMs)
    void loadLibraryOccupancy(controller.signal).then(rows => {
      if (!controller.signal.aborted && token === generation.current) { setLocations(rows); setNow(Date.now()); setError('') }
    }).catch(() => {
      if (!controller.signal.aborted && token === generation.current) setError('Library occupancy could not be loaded. Please try again.')
    }).finally(() => {
      window.clearTimeout(delayed)
      if (!controller.signal.aborted && token === generation.current) { pending.current = false; setLoading(false); setSlow(false) }
    })
    return () => { controller.abort(); window.clearTimeout(delayed) }
  }, [attempt])

  function retry() {
    if (pending.current) return
    pending.current = true; retryFocus.current = true
    setLoading(true); setSlow(false); setAttempt(value => value + 1)
  }
  useEffect(() => {
    if (!loading && retryFocus.current) {
      retryFocus.current = false
      if (locations) featureHeading.current?.focus()
      else retryButton.current?.focus()
    }
  }, [loading, locations])

  useEffect(() => {
    if (!locations) return
    let timer: number | undefined
    function schedule() {
      const time = Date.now()
      const boundaries = locations!.flatMap(row => [row.freshUntil ? Date.parse(row.freshUntil) : 0,
        row.usableUntil ? Date.parse(row.usableUntil) + 1 : 0]).filter(value => value > time)
      if (boundaries.length) timer = window.setTimeout(() => {
        setNow(Date.now()); schedule()
      }, Math.min(60_000, Math.min(...boundaries) - time))
    }
    function resume() {
      if (document.hidden) return
      setNow(Date.now())
      window.clearTimeout(timer)
      schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
    }
  }, [locations])

  useEffect(() => {
    if (selected !== null) heading.current?.focus()
    else if (restoreFocus.current !== null) {
      cards.current.get(restoreFocus.current)?.focus()
      restoreFocus.current = null
    }
  }, [selected])

  const current = locations?.find(row => row.id === selected)
  const details = current ? libraryDetails[current.id] : null
  const currentStatus = current ? occupancyStatus(current, now) : 'unavailable'

  return <section className="study-spaces" aria-label="Study Spot Finder">
    <div className="welcome"><p className="eyebrow">A LITTLE ROOM TO FOCUS</p><h1 ref={featureHeading} tabIndex={-1}>Find your study space.</h1><p>Find the best place to study based on current library occupancy.</p></div>
    <div className="library-source-note"><span className="library-source-tag">University sensor data</span><p>From <a href={occupancySource}>SBU Libraries</a></p></div>
    {error && <div className="library-notice">{!loading && <p role="alert">{error}</p>}<button type="button" ref={retryButton} className="library-retry" aria-disabled={loading} onClick={retry}>Try again</button></div>}
    {loading && <p className="panel library-loading" role="status" aria-live="polite">{slow ? 'Loading is taking longer than usual. You can keep waiting or return later.' : 'Loading library occupancy…'}</p>}
    {current && details ? <>
      <button className="library-back" onClick={() => { restoreFocus.current = current.id; setNow(Date.now()); setSelected(null) }}>← All study spaces</button>
      <div className="library-detail">
        <section className="panel library-summary" aria-labelledby="library-detail-heading">
          <LibraryImage key={current.id} id={current.id} name={current.name} detail />
          <div className="library-detail-body"><p className="eyebrow">{details.setting}</p><h2 id="library-detail-heading" ref={heading} tabIndex={-1}>{current.name}</h2>
            <Reading row={current} now={now} />
            {currentStatus !== 'unavailable' && <dl className="library-capacity"><div><dt>Current occupancy</dt><dd>{current.population}</dd></div><div><dt>Est. remaining capacity</dt><dd>{current.estimatedRemainingCapacity}</dd></div></dl>}
            <p className="library-fine-print">Estimated capacity, not guaranteed available seats.</p>
            <a className="library-source-link" href={occupancySource}>Occupancy source: SBU Libraries ↗</a>
          </div>
        </section>
        <div className="library-detail-side"><section className="panel library-amenities" aria-labelledby="library-amenities-heading"><p className="eyebrow">PLAN YOUR VISIT</p><h2 id="library-amenities-heading">At this location</h2>{details.facilitiesName && <h3 className="library-facilities-name">{details.facilitiesName}</h3>}<p className="library-scope">{details.scope}</p>
          {details.amenities.length > 0 && <dl className="library-amenity-grid">{details.amenities.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
          {details.facilities.length > 0 && <ul className="library-facilities">{details.facilities.map(item => <li key={item}>{item}</li>)}</ul>}
          <p className="library-fine-print">Installed facilities, not live availability.</p><a className="library-source-link" href={amenitiesSource}>Facilities source: SBU Places to Study ↗</a>
        </section><OccupancyChart key={current.id} libraryId={current.id} live={current} now={now} /></div>
      </div>
    </> : locations && <div className="location-grid">{locations.map(row => <button className="panel location-card" key={row.id} ref={node => { if (node) cards.current.set(row.id, node); else cards.current.delete(row.id) }} aria-label={`View ${row.name}: ${occupancyStatus(row, now) === 'unavailable' ? 'occupancy unavailable' : `${row.percentage}% full, ${row.crowdLevel}${occupancyStatus(row, now) === 'stale' ? ', older reading' : ''}`}`} onClick={() => { setNow(Date.now()); setSelected(row.id) }}>
      <LibraryImage id={row.id} name={row.name} />
      <div className="library-card-body"><span className="eyebrow">{libraryDetails[row.id]?.setting}</span><span className="library-card-title">{row.name}</span>
        <Reading row={row} now={now} />
        <span className="location-link">View library details <span aria-hidden="true">→</span></span>
      </div>
    </button>)}</div>}
    {locations && !current && <p className="library-footer-note">Occupancy readings are retrieved when Study Spot Finder is opened and may be delayed or temporarily unavailable.</p>}
  </section>
}
