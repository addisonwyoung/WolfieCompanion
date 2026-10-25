import { useRef, useState } from 'react'
import { validateRows } from './account'
import type { ClassRow } from './account'
export default function ManualClasses({ onSave }: { onSave: (rows: ClassRow[]) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ClassRow[]>([{ code: '', section: '', professor_first_name: '', professor_last_name: '' }])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const saving = useRef(false)
  return <div className="manual-classes">
    <button aria-expanded={open} aria-controls="manual-classes" onClick={() => setOpen(!open)} disabled={busy}>Enter classes manually</button>
    {open && <form id="manual-classes" onSubmit={async e => {
      e.preventDefault(); if (saving.current) return
      if (!validateRows(rows)) { setMessage('Enter a valid course code, section, professor first name, and professor last name for every class. Save 1 to 100 rows.'); return }
      saving.current = true; setBusy(true); setMessage('Saving classes…')
      try { await onSave(rows); setRows([{ code: '', section: '', professor_first_name: '', professor_last_name: '' }]); setMessage('Classes saved to your account.') }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save classes. Please retry.') }
      finally { saving.current = false; setBusy(false) }
    }}>
      <p className="field-help">Enter your current classes, sections, and each professor’s first and last name. These are self-reported, not official registration records.</p>
      <fieldset disabled={busy}><legend>Add your classes</legend>
        {rows.map((row, index) => <div className="import-row" key={index}>
          <label>Manual course code {index + 1}<input value={row.code} aria-describedby="manual-message" onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, code: e.target.value } : r))} placeholder="CSE 310" /></label>
          <label>Manual section {index + 1}<input value={row.section} maxLength={20} aria-describedby="manual-message" onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, section: e.target.value } : r))} placeholder="01" /></label>
          <label>Professor first name {index + 1}<input value={row.professor_first_name} maxLength={80} aria-describedby="manual-message" onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, professor_first_name: e.target.value } : r))} /></label>
          <label>Professor last name {index + 1}<input value={row.professor_last_name} maxLength={80} aria-describedby="manual-message" onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, professor_last_name: e.target.value } : r))} /></label>
          <button type="button" onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label={`Remove manual class ${index + 1}`}>Remove</button>
        </div>)}
        <div className="import-actions"><button type="button" disabled={rows.length >= 100} onClick={() => setRows([...rows, { code: '', section: '', professor_first_name: '', professor_last_name: '' }])}>Add another class</button><button className="primary" type="submit">{busy ? 'Saving classes…' : 'Save classes'}</button></div>
      </fieldset><p id="manual-message" role="status">{message}</p>
    </form>}
  </div>
}
