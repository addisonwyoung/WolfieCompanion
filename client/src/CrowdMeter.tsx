import { useEffect, useRef, useState } from 'react'
import './CrowdMeter.css'

const levels = ['Empty', 'Low', 'Moderate', 'Busy', 'Full'] as const
type Report = { id: string; locationId: string; level: typeof levels[number]; note: string; submittedAt: string }
type Location = { id: string; name: string; latestReport: Report | null }
type Detail = Location & { reports: Report[] }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const timeout = new AbortController()
  const timer = window.setTimeout(() => timeout.abort(), 8000)
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout.signal]) : timeout.signal
  let response: Response
  try {
    response = await fetch(url, { ...init, signal })
  } catch (error) {
    if (timeout.signal.aborted) throw new Error('The crowd meter is taking too long to respond. Please retry.', { cause: error })
    throw error
  } finally {
    window.clearTimeout(timer)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Unable to reach the crowd meter. Please retry.')
  }
  return response.json()
}
function Age({ value, now }: { value: string; now: number }) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000))
  const age = minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`
  return <span className="report-time"><time dateTime={value}>{age}</time><span>{new Date(value).toLocaleString()}</span></span>
}
function Level({ value }: { value: Report['level'] }) {
  return <span className={`crowd-level level-${value.toLowerCase()}`}>{value}</span>
}
export default function CrowdMeter() {
  const [locations, setLocations] = useState<Location[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    let alive = true
    async function refresh() {
      controller.current?.abort()
      const abort = new AbortController()
      controller.current = abort
      const token = ++generation.current
      try {
        const [list, result] = await Promise.all([
          request<{ locations: Location[] }>('/api/locations', { signal: abort.signal }),
          selected ? request<Detail>(`/api/locations/${selected}`, { signal: abort.signal }) : Promise.resolve(null),
        ])
        if (!alive || token !== generation.current) return
        setLocations(list.locations); setDetail(result); setError(''); setLoading(false)
      } catch (e) {
        if (!alive || abort.signal.aborted || token !== generation.current) return
        setError(e instanceof Error ? e.message : 'Unable to refresh.'); setLoading(false)
      }
    }
    void refresh()
    const poll = window.setInterval(() => { if (!document.hidden) void refresh() }, 15000)
    const foreground = () => { if (!document.hidden) { setNow(Date.now()); void refresh() } }
    document.addEventListener('visibilitychange', foreground)
    return () => { alive = false; controller.current?.abort(); window.clearInterval(poll); document.removeEventListener('visibilitychange', foreground) }
  }, [selected, revision])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer) }, [])
  function select(id: string | null) {
    generation.current++; controller.current?.abort()
    setSelected(id); setDetail(null); setLoading(true); setError('')
  }
  function accepted(report: Report) {
    generation.current++; controller.current?.abort()
    setNow(Date.now())
    setLocations(previous => previous?.map(l => l.id === report.locationId ? { ...l, latestReport: report } : l) ?? null)
    setDetail(previous => previous && previous.id === report.locationId ? { ...previous, latestReport: report, reports: [report, ...previous.reports.filter(r => r.id !== report.id)].slice(0, 10) } : previous)
    setRevision(n => n + 1)
  }
  const current = detail?.id === selected ? detail : null
  return <section aria-label="Campus crowd meter">
    <div className="welcome"><p className="eyebrow">A LITTLE ROOM TO FOCUS</p><h1>Find your study space.</h1><p>Check the crowd. Share what you see. Make room for a good study session.</p></div>
    <p className="crowd-disclaimer">Student-reported, not live occupancy. Updates refresh every 15 seconds.</p>
    {selected && <button className="back-button" onClick={() => select(null)}>← All study spaces</button>}
    {error && <div className="crowd-error" role="alert">{error} Displayed information may be out of date. <button onClick={() => setRevision(n => n + 1)}>Retry</button></div>}
    {loading && <p role="status">Loading study spaces…</p>}
    {!selected && locations && <div className="location-grid">{locations.map(location => <button className="panel location-card" key={location.id} onClick={() => select(location.id)}>
      <span className="eyebrow">CAMPUS STUDY SPACE</span><h2>{location.name}</h2>
      {location.latestReport ? <><Level value={location.latestReport.level} /><Age value={location.latestReport.submittedAt} now={now} /></> : <span className="muted">No reports yet</span>}
      <span className="location-link">View crowd reports <span aria-hidden="true">→</span></span>
    </button>)}</div>}
    {selected && current && <div className="crowd-detail">
      <div><section className="panel crowd-summary"><p className="eyebrow">LATEST STUDENT REPORT</p><h2>{current.name}</h2>{current.latestReport ? <><Level value={current.latestReport.level} /><p className="muted">Last updated</p><Age value={current.latestReport.submittedAt} now={now} />{current.latestReport.note && <p className="crowd-note">{current.latestReport.note}</p>}</> : <p className="muted">No reports yet. Be the first to share an update.</p>}</section>
      <section className="report-history"><h2>Recent reports</h2><p className="muted">The latest ten observations from fellow students.</p>{current.reports.length ? <ol>{current.reports.map(report => <li className="panel" key={report.id}><div className="section-top"><Level value={report.level} /><Age value={report.submittedAt} now={now} /></div>{report.note && <p className="crowd-note">{report.note}</p>}</li>)}</ol> : <p className="empty-state">No reports yet.</p>}</section></div>
      <ReportForm key={selected} locationId={selected} onAccepted={accepted} />
    </div>}
  </section>
}
function ReportForm({ locationId, onAccepted }: { locationId: string; onAccepted: (report: Report) => void }) {
  const [level, setLevel] = useState('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy.current) return
    setSuccess(false)
    if (!level || note.trim().length > 200) { setError('Choose a crowd level and keep your note to 200 characters.'); return }
    busy.current = true; setPending(true); setError('')
    try {
      const report = await request<Report>(`/api/locations/${locationId}/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level, note: note.trim() }) })
      if (!mounted.current) return
      onAccepted(report); setNote(''); setSuccess(true)
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Unable to submit. Please retry.') }
    finally { busy.current = false; if (mounted.current) setPending(false) }
  }
  return <section className="panel report-form"><p className="eyebrow">HELP THE NEXT STUDENT</p><h2>How crowded is it?</h2><p className="muted">Share a quick observation from your visit.</p>
    <form onSubmit={submit}><label htmlFor="crowd-level">Crowd level</label><select id="crowd-level" value={level} onChange={e => { setLevel(e.target.value); setSuccess(false) }} disabled={pending} required><option value="">Choose a level</option>{levels.map(l => <option key={l}>{l}</option>)}</select>
    <label htmlFor="crowd-note">Short note <span className="muted">(optional)</span></label><textarea id="crowd-note" rows={3} value={note} onChange={e => { setNote(e.target.value); setSuccess(false) }} disabled={pending} aria-describedby="note-help" placeholder="Many seats available, very noisy…" /><p id="note-help" className="field-help">{note.trim().length}/200 characters</p>
    {error && <p className="error" role="alert">{error}</p>}{success && <p className="report-success" role="status">Report saved. Thanks for sharing!</p>}
    <button className="primary" disabled={pending} type="submit">{pending ? 'Submitting…' : error ? 'Retry report' : 'Submit report'}</button></form>
    <p className="session-note">Every update is a new report. Previous observations stay in the history.</p>
  </section>
}
