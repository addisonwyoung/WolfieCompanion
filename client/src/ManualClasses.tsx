import { useRef, useState } from 'react'
import { validateRows } from './account'
import type { ClassRow } from './account'
import type { ProfessorCatalogState } from './courseProfessors'
import ProfessorPicker from './ProfessorPicker'
export default function ManualClasses({ onSave, catalog }: { onSave: (rows: ClassRow[]) => Promise<void>; catalog: ProfessorCatalogState }) {
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
      <p className="field-help">Enter your current classes and sections, then choose a listed professor or submit another name for verification. These are self-reported, not official registration records.</p>
      {catalog.status === 'error' && <div role="alert"><p>The approved professor list is unavailable. Apply the professor-verification migration, then retry.</p><button type="button" onClick={catalog.retry}>Retry professor list</button></div>}
      <fieldset disabled={busy}><legend>Add your classes</legend>
        {rows.map((row, index) => <div className="import-row" key={index}>
          <div className="class-entry-fields">
            <label>Course code<input value={row.code} aria-describedby="manual-message" onChange={e => setRows(previous => previous.map((r, i) => i === index ? { ...r, code: e.target.value, professor_first_name: '', professor_last_name: '' } : r))} placeholder="CSE 310" /></label>
            <label>Section<input value={row.section} maxLength={20} aria-describedby="manual-message" onChange={e => setRows(previous => previous.map((r, i) => i === index ? { ...r, section: e.target.value } : r))} placeholder="01" /></label>
            <ProfessorPicker key={`${index}-${row.code}`} id={`manual-${index}`} code={row.code} firstName={row.professor_first_name} lastName={row.professor_last_name} catalog={catalog} onChange={(professor_first_name, professor_last_name) => setRows(previous => previous.map((r, i) => i === index ? { ...r, professor_first_name, professor_last_name } : r))} />
          </div>
          <button type="button" onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label={`Remove manual class ${index + 1}`}>Remove</button>
        </div>)}
        <div className="import-actions"><button type="button" disabled={rows.length >= 100} onClick={() => setRows([...rows, { code: '', section: '', professor_first_name: '', professor_last_name: '' }])}>Add another class</button><button className="primary" type="submit" disabled={catalog.status !== 'success'}>{busy ? 'Saving classes…' : 'Save classes'}</button></div>
      </fieldset><p id="manual-message" role="status">{message}</p>
    </form>}
  </div>
}
