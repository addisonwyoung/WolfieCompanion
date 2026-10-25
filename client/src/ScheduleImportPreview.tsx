import { validateRows } from './account'
import { useEffect, useRef, useState } from 'react'
interface Warning { code: string; message: string }
interface Row { id: number; code: string; section: string; professor_first_name: string; professor_last_name: string; warnings: Warning[] }
const maxBytes = 10 * 1024 * 1024
export default function ScheduleImportPreview({ onAddClasses }: { onAddClasses?: (rows: { code: string; section: string; professor_first_name: string; professor_last_name: string }[]) => Promise<void> | void }) {
  const [expanded, setExpanded] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [layout, setLayout] = useState('class-list')
  const [rows, setRows] = useState<Row[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const savePending = useRef(false)
  const [ready, setReady] = useState(false)
  const [hasResults, setHasResults] = useState(false)
  const requestId = useRef(0)
  const rowId = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const objectUrl = useRef('')
  const input = useRef<HTMLInputElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  useEffect(() => () => {
    requestId.current++
    controller.current?.abort()
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
  }, [])
  function invalidate() {
    requestId.current++; controller.current?.abort(); controller.current = null
    setBusy(false); setRows([]); setMessage(''); setHasResults(false)
  }
  function clear(resetInput = true) {
    invalidate(); setFile(null); setReady(false); setUrl('')
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = ''; if (resetInput && input.current) input.current.value = ''
  }
  function select(next: File | undefined) {
    clear(false)
    if (!next) return
    if (!['image/png', 'image/jpeg'].includes(next.type) || !next.size || next.size > maxBytes) {
      setMessage('Choose a nonempty PNG or JPEG up to 10 MiB.'); return
    }
    const nextUrl = URL.createObjectURL(next)
    objectUrl.current = nextUrl; setUrl(nextUrl); setFile(next)
  }
  async function extract() {
    if (!file || !ready || controller.current) return
    invalidate()
    const id = requestId.current
    const abort = new AbortController(); controller.current = abort; setBusy(true)
    try {
      const response = await fetch(`/api/schedule-preview?layout=${layout}`, {
        method: 'POST', headers: { 'Content-Type': file.type, 'X-Schedule-Preview': '1' }, body: file, signal: abort.signal,
      })
      const data = await response.json()
      if (id !== requestId.current) return
      if (!response.ok) throw new Error(data.error || 'Extraction failed. Please try again.')
      if (!Array.isArray(data.rows) || data.rows.some((r: { code?: unknown; section?: unknown }) => typeof r.code !== 'string' || typeof r.section !== 'string')) throw new Error('Invalid preview response. Please try again.')
      setRows(data.rows.map((r: { code: string; section: string; warnings?: Warning[] }) => ({ ...r, professor_first_name: '', professor_last_name: '', warnings: r.warnings ?? [], id: ++rowId.current })))
      setHasResults(true)
      setMessage(data.rows.length ? `${data.rows.length} class sections detected. Review and correct them below.` : data.warnings?.find((w: Warning) => ['NO_TEXT','NO_CLASSES'].includes(w.code))?.message || 'No classes detected. Try a clearer screenshot or add a class.')
    } catch (error) {
      if (id === requestId.current && !abort.signal.aborted) setMessage(error instanceof Error ? error.message : 'Unable to reach the preview service. Please try again.')
    } finally { if (id === requestId.current) { setBusy(false); controller.current = null } }
  }
  function edit(id: number, key: 'code' | 'section' | 'professor_first_name' | 'professor_last_name', value: string) {
    setRows(previous => previous.map(row => row.id === id ? { ...row, [key]: value, warnings: key === 'section' ? [] : row.warnings } : row))
  }
  const validRows = validateRows(rows)
  return <div className="schedule-import">
    <button ref={trigger} disabled={saving} aria-expanded={expanded} aria-controls="schedule-import-panel" onClick={() => { if (expanded) clear(); setExpanded(!expanded) }}>Import schedule</button>
    {expanded && <section id="schedule-import-panel" aria-labelledby="schedule-import-heading"><fieldset disabled={saving}><legend className="sr-only">Schedule import</legend>
      <div className="section-top"><h3 id="schedule-import-heading">Preview your classes</h3><button onClick={() => { clear(); setExpanded(false); trigger.current?.focus() }}>Close</button></div>
      <p className="muted">Upload a SOLAR class list or weekly calendar. Extracting sends the image to Google to read it. Review the results, then explicitly save them to Your courses. Extraction and edits alone do not save classes. The screenshot is not saved.</p>
      <div className="import-inputs">
        <label>Schedule image<input ref={input} type="file" accept="image/png,image/jpeg" onChange={event => select(event.target.files?.[0])} /></label>
        <label>Screenshot layout<select value={layout} onChange={event => { invalidate(); setLayout(event.target.value) }}><option value="class-list">SOLAR class list</option><option value="weekly-calendar">Weekly calendar</option></select></label>
      </div>
      {url && <img key={url} className="schedule-image" src={url} alt="Selected schedule screenshot" onLoad={() => setReady(true)} onError={() => { clear(); setMessage('This image could not be opened. Choose a readable PNG or JPEG.') }} />}
      <div className="import-actions"><button disabled={!file || !ready || busy || saving} onClick={extract}>{busy ? 'Reading schedule…' : 'Extract classes'}</button><button onClick={() => clear()}>Clear preview</button></div>
      <p role="status" aria-live="polite">{busy ? 'Reading your schedule. Please wait.' : message}</p>
      {hasResults && <div className="import-results">
        <p className="muted">Unverified preview: check each course and section against your screenshot.</p>
        {rows.map((row, index) => {
          const issues = [...row.warnings.map(w => w.message)]
          if (!row.section.trim()) issues.push('Enter the section if you can read it.')
          if (!/^[A-Za-z]{2,4}\s?\d{3}$/.test(row.code.trim())) issues.push('Use a course code such as CSE 310.')
          if (!/^[A-Za-z0-9-]{0,20}$/.test(row.section.trim())) issues.push('Use up to 20 letters, digits, or hyphens for the section.')
          if (!row.professor_first_name.trim()) issues.push('Enter the professor’s first name.')
          if (!row.professor_last_name.trim()) issues.push('Enter the professor’s last name.')
          return <div className="import-row" key={row.id}>
            <label>Course code {index + 1}<input value={row.code} aria-describedby={`row-warning-${row.id}`} onChange={e => edit(row.id, 'code', e.target.value)} /></label>
            <label>Section {index + 1}<input value={row.section} aria-describedby={`row-warning-${row.id}`} onChange={e => edit(row.id, 'section', e.target.value)} /></label>
            <label>Professor first name {index + 1}<input value={row.professor_first_name} maxLength={80} aria-describedby={`row-warning-${row.id}`} onChange={e => edit(row.id, 'professor_first_name', e.target.value)} /></label>
            <label>Professor last name {index + 1}<input value={row.professor_last_name} maxLength={80} aria-describedby={`row-warning-${row.id}`} onChange={e => edit(row.id, 'professor_last_name', e.target.value)} /></label>
            <button aria-label={`Remove class ${index + 1}`} onClick={() => setRows(previous => previous.filter(r => r.id !== row.id))}>Remove</button>
            <p id={`row-warning-${row.id}`} className="import-warning">{[...new Set(issues)].join(' ')}</p>
          </div>
        })}
        {onAddClasses && <div className="import-actions"><button disabled={!validRows || busy || saving} onClick={async () => {
          if (!validRows || savePending.current) return
          savePending.current = true; setSaving(true)
          const id = requestId.current
          try {
            await onAddClasses(rows.map(({ code, section, professor_first_name, professor_last_name }) => ({ code, section, professor_first_name, professor_last_name })))
            if (id === requestId.current) setMessage('Classes saved to Your courses.')
          } catch (error) {
            if (id === requestId.current) setMessage(error instanceof Error ? error.message : 'Unable to save classes. Your draft is still here; please retry.')
          } finally { savePending.current = false; setSaving(false) }
        }}>{saving ? 'Saving classes…' : 'Add to Your courses'}</button></div>}
        <button onClick={() => setRows(previous => [...previous, { id: ++rowId.current, code: '', section: '', professor_first_name: '', professor_last_name: '', warnings: [] }])}>Add class</button>
      </div>}
    </fieldset></section>}
  </div>
}
