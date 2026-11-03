import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { AcademicInput, ItemType } from './academicItems'
import { itemTypes, normalizeItem } from './academicItems'
import type { SavedCourse } from './account'
import ReminderChoices from './ReminderChoices'
import { useAcademicReminders } from './reminderContext'
import { defaultReminderSettings } from './academicReminders'
import { useAcademicDialog } from './useAcademicDialog'

function comparable(value: AcademicInput) {
  return JSON.stringify([value.user_course_id, value.title.trim(), value.type, value.due_date,
    value.due_time ? value.due_time.padEnd(8, ':00') : null, value.notes?.trim() || null, value.location?.trim() || null, !!value.completed_at, value.reminder_offsets??null])
}
type Field = keyof AcademicInput
export default function AcademicItemDialog({ initial, editing, courses, busy, saveError, onClose, onSave }: {
  initial: AcademicInput; editing: boolean; courses: SavedCourse[]; busy: boolean; saveError: string | null
  onClose: () => void; onSave: (value: AcademicInput) => Promise<boolean>
}) {
  const dialog = useAcademicDialog()
  const reminderState=useAcademicReminders()
  const preferences=reminderState?.settings??defaultReminderSettings
  const [timeNotice,setTimeNotice]=useState(false)
  const id = useId()
  const [draft, setDraft] = useState(initial)
  const [confirming, setConfirming] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(!!(initial.notes || initial.location))
  const [validation, setValidation] = useState<{ field: Field; message: string } | null>(null)
  const [attempted, setAttempted] = useState(false)
  const submitting = useRef(false)
  const lastField = useRef<HTMLElement | null>(null)
  const dirty = comparable(initial) !== comparable(draft)
  const fieldId = (field: string) => `${id}-${field}`
  function dismiss() { if (!busy && !submitting.current) { if (dirty) setConfirming(true); else onClose() } }
  function escape() { if (busy || submitting.current) return; if (confirming) setConfirming(false); else dismiss() }
  function change(patch: Partial<AcademicInput>) { setDraft(previous => ({ ...previous, ...patch })); setValidation(null) }
  useLayoutEffect(() => {
    const node = dialog.current
    if (busy) node?.querySelector<HTMLElement>('[data-progress]')?.focus()
    else if (confirming) node?.querySelector<HTMLElement>('[data-keep-editing]')?.focus()
    else if (validation) node?.querySelector<HTMLElement>(`[name="${validation.field}"]`)?.focus()
    else (lastField.current ?? node?.querySelector<HTMLElement>('[data-initial-focus]'))?.focus()
  }, [confirming, validation, busy, dialog])
  const invalid = (field: Field) => validation?.field === field
  const description = (field: Field) => [invalid(field) ? `${id}-error` : '', field === 'due_time' ? `${id}-time-help` : ''].filter(Boolean).join(' ') || undefined
  return <dialog ref={dialog} className={`academic-dialog ${confirming ? 'academic-confirmation' : 'academic-editor-dialog'}`} role={confirming ? 'alertdialog' : 'dialog'}
    aria-labelledby={`${id}-heading`} aria-describedby={confirming ? `${id}-discard-description` : undefined}
    onCancel={event => { event.preventDefault(); escape() }}
    onKeyDown={event => {
      // Handle Escape before the native close request: repeated native requests
      // can become non-cancelable after entering the same-dialog confirmation.
      if (event.key === 'Escape') { event.preventDefault(); escape() }
    }}>
    {confirming ? <>
      <header className="academic-dialog-header"><p className="eyebrow">UNSAVED CHANGES</p><h2 id={`${id}-heading`}>Discard unsaved changes?</h2></header>
      <div className="academic-dialog-body"><p id={`${id}-discard-description`}>Your changes have not been saved. Keep editing to continue, or discard them to close this editor.</p></div>
      <footer className="academic-dialog-footer"><button type="button" data-keep-editing onClick={() => setConfirming(false)}>Keep Editing</button><button type="button" className="academic-destructive" onClick={onClose}>Discard Changes</button></footer>
    </> : <header className="academic-dialog-header academic-editor-header"><div><p className="eyebrow">YOUR COURSEWORK</p><h2 id={`${id}-heading`}>{editing ? 'Edit academic item' : 'Add academic item'}</h2></div><button type="button" className="academic-close" disabled={busy} aria-label="Close editor" onClick={dismiss}><span aria-hidden="true">×</span></button></header>}
    <form hidden={confirming} noValidate onFocusCapture={event => { if (event.target.matches('input,select,textarea')) lastField.current = event.target }} onSubmit={async event => {
      event.preventDefault()
      if (submitting.current || busy) return
      setValidation(null)
      let value: AcademicInput
      try {
        value = normalizeItem({ ...draft, completed_at: draft.completed_at ? initial.completed_at ?? draft.completed_at : null })
        if (!courses.some(course => course.databaseId === value.user_course_id)) throw new Error('Choose a saved course.')
      } catch (problem) {
        const message = (problem as Error).message
        const field: Field = /reminder/i.test(message) ? 'reminder_offsets' : /title/i.test(message) ? 'title' : /type/i.test(message) ? 'type' : /notes/i.test(message) ? 'notes' : /location/i.test(message) ? 'location' : /time/i.test(message) ? 'due_time' : /date/i.test(message) ? 'due_date' : 'user_course_id'
        if (field === 'notes' || field === 'location') setDetailsOpen(true)
        setValidation({ field, message }); return
      }
      submitting.current = true; setAttempted(true)
      try { await onSave(value) } finally { submitting.current = false }
    }}>
      <div className="academic-dialog-body">
        <fieldset disabled={busy}><legend className="sr-only">Academic item details</legend>
          <label htmlFor={fieldId('title')}>Title</label><input id={fieldId('title')} name="title" data-initial-focus required maxLength={200} placeholder="What’s coming up?" value={draft.title} aria-invalid={invalid('title')} aria-describedby={description('title')} onChange={event => change({ title: event.target.value })} />
          <div className="academic-form-grid"><div><label htmlFor={fieldId('course')}>Course</label><select id={fieldId('course')} name="user_course_id" required value={draft.user_course_id} aria-invalid={invalid('user_course_id')} aria-describedby={description('user_course_id')} onChange={event => change({ user_course_id: event.target.value })}>{courses.map(course => <option key={course.databaseId} value={course.databaseId}>{course.code}</option>)}</select></div>
            <div><label htmlFor={fieldId('type')}>Type</label><select id={fieldId('type')} name="type" value={draft.type} aria-invalid={invalid('type')} aria-describedby={description('type')} onChange={event => change({ type: event.target.value as ItemType })}>{itemTypes.map(type => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></div></div>
          <div className="academic-form-grid"><div><label htmlFor={fieldId('date')}>Due date</label><input id={fieldId('date')} name="due_date" type="date" required min="0001-01-01" max="9999-12-31" value={draft.due_date} aria-invalid={invalid('due_date')} aria-describedby={description('due_date')} onChange={event => change({ due_date: event.target.value })} /></div>
            <div><label htmlFor={fieldId('time')}>Time (optional)</label><input id={fieldId('time')} name="due_time" type="time" step="1" value={draft.due_time ?? ''} aria-invalid={invalid('due_time')} aria-describedby={description('due_time')} onChange={event => {const time=event.target.value||null;setTimeNotice(!time&&!!draft.reminder_offsets?.includes('three_hours'));change({due_time:time,...(!time&&draft.reminder_offsets?.includes('three_hours')?{reminder_offsets:draft.reminder_offsets.filter(key=>key!=='three_hours')}:{})})}} /></div></div>
          <p className="field-help" id={`${id}-time-help`}>Times use America/New_York. Leave time blank to stay due throughout that calendar date; it becomes overdue the following day.</p>
          <section className="item-reminders" aria-label="Item reminders"><label htmlFor={fieldId('reminder-mode')}>Reminders</label><select name="reminder_offsets" aria-invalid={invalid('reminder_offsets')} aria-describedby={description('reminder_offsets')} id={fieldId('reminder-mode')} value={draft.reminder_offsets==null?'inherit':'custom'} onChange={event=>change({reminder_offsets:event.target.value==='inherit'?null:preferences[draft.type].filter(key=>!!draft.due_time||key!=='three_hours')})}><option value="inherit">Use my defaults</option><option value="custom">Customize (none selected = Off)</option></select>
          <ReminderChoices value={(draft.reminder_offsets??preferences[draft.type]).filter(key=>!!draft.due_time||key!=='three_hours')} timed={!!draft.due_time} disabled={busy||draft.reminder_offsets==null} onChange={offsets=>change({reminder_offsets:offsets})}/>{!preferences.enabled&&<p className="field-help">All reminders are currently disabled in your personal settings.</p>}{timeNotice&&<p role="status">Three-hour reminder removed because this item has no due time. Save to keep this change.</p>}</section>
          <details className="academic-optional" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>Optional details</summary>
            <label htmlFor={fieldId('location')}>Location (optional)</label><input id={fieldId('location')} name="location" maxLength={200} value={draft.location ?? ''} aria-invalid={invalid('location')} aria-describedby={description('location')} onChange={event => change({ location: event.target.value })} />
            <label htmlFor={fieldId('notes')}>Notes (optional)</label><textarea id={fieldId('notes')} name="notes" maxLength={5000} rows={3} value={draft.notes ?? ''} aria-invalid={invalid('notes')} aria-describedby={description('notes')} onChange={event => change({ notes: event.target.value })} />
          </details>
          <label className="academic-checkbox"><input type="checkbox" checked={!!draft.completed_at} onChange={event => change({ completed_at: event.target.checked ? initial.completed_at ?? new Date().toISOString() : null })} />Completed</label>
        </fieldset>
        {validation && <p id={`${id}-error`} role="alert" className="academic-dialog-error">{validation.message}</p>}
        {attempted && saveError && !busy && <p role="alert" className="academic-dialog-error">{saveError}</p>}
        {busy && <p role="status" tabIndex={-1} data-progress>Saving item…</p>}
      </div>
      <footer className="academic-dialog-footer"><button type="button" disabled={busy} onClick={dismiss}>Cancel</button><button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save item'}</button></footer>
    </form>
  </dialog>
}
