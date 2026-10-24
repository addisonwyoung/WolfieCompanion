import { useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { campusCategories, normalizeCampusLocation } from './campusLocations'
import type { CampusLocation, CampusLocationInput } from './campusLocations'
import { categoryLabels } from './campusExplorerConfig'
import { useAcademicDialog } from './useAcademicDialog'

function localTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export default function CampusLocationEditor({ input, target, dirty, allowed, busy, error, onChange, onSave, onDelete, onCancel, onReposition, onReload, onRetry }: {
  input: CampusLocationInput; target: CampusLocation | null; dirty: boolean; allowed: boolean; busy: boolean; error: string
  onChange: (input: CampusLocationInput) => void; onSave: (input: CampusLocationInput) => Promise<void>
  onDelete: () => Promise<void>; onCancel: () => void; onReposition: () => void; onReload: () => Promise<boolean>
  onRetry: () => void
}) {
  const dialog = useAcademicDialog()
  const [validation, setValidation] = useState('')
  const [confirmation, setConfirmation] = useState<'discard' | 'delete' | 'reload' | null>(null)
  const safeAction = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const previousConfirmation = useRef(confirmation)
  useLayoutEffect(() => {
    if (confirmation) safeAction.current?.focus()
    else if (previousConfirmation.current) cancel.current?.focus()
    previousConfirmation.current = confirmation
  }, [confirmation])
  function requestCancel() { if (!busy) { if (dirty) setConfirmation('discard'); else onCancel() } }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!allowed || busy) return
    setValidation('')
    let value: CampusLocationInput
    try { value = normalizeCampusLocation(input) } catch (failure) { setValidation((failure as Error).message); return }
    await onSave(value)
  }
  async function reload() {
    setConfirmation(null); setValidation('')
    if (!await onReload()) setValidation('This location could not be reloaded. Your draft is retained; it may have been removed or become unreadable. Retry permissions or cancel.')
  }
  const textFields = [
    ['building', 'Building', 160], ['floor', 'Floor', 40], ['directions', 'Directions', 1000],
    ['description', 'Description (optional)', 2000], ['access_note', 'Access note', 500],
    ['source_url', 'Source URL (HTTPS)', 2000], ['source_note', 'Source note', 1000],
  ] as const
  return <dialog ref={dialog} className="campus-editor-dialog" aria-labelledby="campus-editor-title" onCancel={event => { event.preventDefault(); if (confirmation) { setConfirmation(null); cancel.current?.focus() } else requestCancel() }}>
    <h2 id="campus-editor-title">{target ? 'Edit location' : 'Add location'}</h2>
    {!allowed && <div role="alert">Editing permission is unavailable. Your draft is retained. <button type="button" disabled={busy} onClick={onRetry}>Retry permissions</button></div>}
    {confirmation ? <section aria-label="Confirm location action">
      <h3>{confirmation === 'delete' ? 'Delete this location permanently?' : confirmation === 'reload' ? 'Replace your edits with the latest saved location?' : 'Discard unsaved changes?'}</h3>
      <p>{confirmation === 'delete' ? 'This removes the saved location for everyone. This cannot be undone.' : 'Your unsaved details and position will be discarded.'}</p>
      <div className="campus-editor-actions"><button ref={safeAction} disabled={busy} onClick={() => { setConfirmation(null); cancel.current?.focus() }}>Keep editing</button>
        <button disabled={busy || (confirmation !== 'discard' && !allowed)} onClick={() => {
          if (confirmation === 'discard') onCancel()
          else if (confirmation === 'reload') void reload()
          else { setConfirmation(null); void onDelete() }
        }}>{confirmation === 'delete' ? 'Confirm delete' : confirmation === 'reload' ? 'Reload and discard edits' : 'Discard changes'}</button></div>
    </section> : <form noValidate onSubmit={event => void submit(event)}>
      <p>Name and directions are required. New locations default to draft; other details can be added before publication.</p>
      <p className="campus-editor-position">Selected position: {input.latitude.toFixed(6)}, {input.longitude.toFixed(6)}</p>
      <button type="button" disabled={busy || !allowed} onClick={onReposition}>Reposition on map</button>
      <fieldset disabled={busy || !allowed} className="campus-editor-fields">
        <legend>Resource details</legend>
        <label>Name<input data-initial-focus required maxLength={160} value={input.name} onChange={event => onChange({ ...input, name: event.target.value })} /></label>
        <label>Category<select value={input.category} onChange={event => onChange({ ...input, category: event.target.value as CampusLocationInput['category'] })}>{campusCategories.map(category => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label>
        {textFields.map(([field, label, max]) => <label key={field}>{label}{['directions', 'description', 'access_note', 'source_note'].includes(field)
          ? <textarea required={field === 'directions'} maxLength={max} value={input[field] ?? ''} onChange={event => onChange({ ...input, [field]: event.target.value })} />
          : <input type={field === 'source_url' ? 'url' : 'text'} maxLength={max} value={input[field] ?? ''} onChange={event => onChange({ ...input, [field]: event.target.value })} />}</label>)}
        <label>Verified at (your local time)<input type="datetime-local" value={localTime(input.verified_at)} onChange={event => onChange({ ...input, verified_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
        <button type="button" onClick={() => onChange({ ...input, verified_at: new Date().toISOString() })}>Verify now</button>
        <label>Publication<select value={input.status} onChange={event => onChange({ ...input, status: event.target.value as CampusLocationInput['status'] })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
        <p>Publish only after manual verification. Publication requires a verification date and a source URL or source note. Description is optional.</p>
      </fieldset>
      {(validation || error) && <p role="alert">{validation || error}</p>}
      <div className="campus-editor-actions"><button type="submit" disabled={busy || !allowed}>{busy ? 'Saving changes…' : 'Save location'}</button><button ref={cancel} type="button" disabled={busy} onClick={requestCancel}>Cancel</button>
        {target && <><button type="button" disabled={busy || !allowed} onClick={() => setConfirmation('reload')}>Reload latest location</button><button type="button" disabled={busy || !allowed} onClick={() => setConfirmation('delete')}>Delete location</button></>}</div>
    </form>}
  </dialog>
}
