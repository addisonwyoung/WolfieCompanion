import { useEffect, useRef, useState } from 'react'
import { loadLibraryHistory, occupancyLoadingDelayMs, occupancySource } from './libraryOccupancyApi'
import type { LibraryHistory, LiveLibraryReading } from './libraryOccupancyApi'
import { compareOccupancy, matchingHistoricalHourIndex } from './occupancyComparison'
import './OccupancyChart.css'

function hourLabel(hour: number) { return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}` }

export default function OccupancyChart({ libraryId, live, now }: { libraryId: number; live?: LiveLibraryReading; now?: number }) {
  const [history, setHistory] = useState<LibraryHistory | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const pending = useRef(true)
  const retryFocus = useRef(false)
  const retryButton = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const bars = useRef(new Map<number, HTMLButtonElement>())
  useEffect(() => {
    const controller = new AbortController()
    const delayed = window.setTimeout(() => { if (!controller.signal.aborted) setSlow(true) }, occupancyLoadingDelayMs)
    void loadLibraryHistory(libraryId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setHistory(value); setFailed(value.status !== 'available') }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) }).finally(() => {
      window.clearTimeout(delayed)
      if (!controller.signal.aborted) { pending.current = false; setLoading(false); setSlow(false) }
    })
    return () => { controller.abort(); window.clearTimeout(delayed) }
  }, [libraryId, attempt])

  function retry() {
    if (pending.current) return
    pending.current = true; retryFocus.current = true
    setLoading(true); setSlow(false); setAttempt(value => value + 1)
  }
  useEffect(() => {
    if (!loading && retryFocus.current) {
      retryFocus.current = false
      if (history?.status === 'available') heading.current?.focus()
      else retryButton.current?.focus()
    }
  }, [loading, history])

  const available = history?.status === 'available'
  const comparison = compareOccupancy(live, history, now)
  const buckets = available ? history.buckets : []
  // A student selection always wins over the initial retrieval-hour highlight.
  const activeIndex = selected ?? matchingHistoricalHourIndex(live, history) ?? 0
  const midnight = buckets.findIndex((bucket, index) => index > 0 && bucket.hour === 0)
  function description(index: number) {
    const bucket = buckets[index]!
    const nextDay = midnight >= 0 && index >= midnight ? ' (next day)' : ''
    const value = bucket.percentage === null ? 'No data' : `${Math.round(bucket.percentage)}% occupancy${bucket.percentage > 100 ? ' (above configured capacity)' : ''}`
    return `${hourLabel(bucket.hour)}${nextDay}: ${value}`
  }
  return <section className="panel occupancy-history" aria-labelledby="occupancy-history-heading">
    <p className="eyebrow">PLAN YOUR VISIT</p><h2 id="occupancy-history-heading" ref={heading} tabIndex={-1}>Historical hourly occupancy</h2>
    {comparison && <div className={`history-comparison history-comparison-${comparison.tone}`}>
      <h3>{comparison.label}</h3>
    </div>}
    {loading && <p role="status" aria-live="polite" className="history-message">{slow ? 'Loading is taking longer than usual. You can keep waiting or return later.' : 'Loading historical occupancy…'}</p>}
    {failed && <div className="history-message">{!loading && <p role="alert">Historical data is unavailable for this location. Current occupancy is shown separately.</p>}<button type="button" ref={retryButton} className="library-retry" aria-disabled={loading} onClick={retry}>Try again</button></div>}
    {available && <>
      <div className="history-chart" role="group" aria-label="Hourly historical occupancy. Use left and right arrow keys to inspect hours.">
        <div className="history-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
        <div className="history-plot">
          <div className="history-grid" aria-hidden="true"><i /><i /><i /></div>
          <div className="history-bars">{buckets.map((bucket, index) => {
            const showLabel = index === 0 || index === buckets.length - 1 || (index % 6 === 0 && index < buckets.length - 3)
            return <button type="button" key={bucket.referenceDateTime} className={`history-hour${index === activeIndex ? ' history-hour-selected' : ''}${index === midnight ? ' history-midnight' : ''}`}
              ref={node => { if (node) bars.current.set(index, node); else bars.current.delete(index) }}
              tabIndex={index === activeIndex ? 0 : -1} aria-label={description(index)} aria-pressed={index === activeIndex}
              onPointerEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onClick={() => setSelected(index)}
              onKeyDown={event => {
                let target: number
                if (event.key === 'ArrowRight') target = Math.min(buckets.length - 1, index + 1)
                else if (event.key === 'ArrowLeft') target = Math.max(0, index - 1)
                else if (event.key === 'Home') target = 0
                else if (event.key === 'End') target = buckets.length - 1
                else return
                event.preventDefault(); setSelected(target); bars.current.get(target)?.focus()
              }}>
              {bucket.percentage === null ? <span className="history-missing" aria-hidden="true">×</span> : <span className={`history-bar${bucket.percentage === 0 ? ' history-zero' : ''}`} style={{ height: `${Math.min(100, bucket.percentage)}%` }} />}
              {showLabel && <span className={`history-hour-label${index === 0 ? ' history-first-label' : ''}${index === buckets.length - 1 ? ' history-last-label' : ''}`} aria-hidden="true">{hourLabel(bucket.hour)}</span>}
            </button>
          })}</div>
        </div>
      </div>
      <output className="history-inspection" aria-live="polite">{description(activeIndex)}</output>
      <p className="history-context">Historical reference data, not a forecast.</p>
      <details className="history-about"><summary>About this data</summary>
        <p>Historical occupancy follows SBU Libraries’ selected reference weeks. Comparisons use the corresponding campus hour and are not a forecast.</p>
        <p>Hourly window: {hourLabel(buckets[0]!.hour)} → {hourLabel(buckets.at(-1)!.hour)}{midnight >= 0 ? ' next day. The dashed line marks midnight.' : '.'}</p>
        <p>Hover, tap or use arrow keys to explore hourly occupancy. × means no data; a baseline mark means 0%. Values above capacity appear in the selected-hour text.</p>
      </details>
    </>}
    <a className="library-source-link" href={occupancySource}>Source: SBU Libraries.</a>
  </section>
}
