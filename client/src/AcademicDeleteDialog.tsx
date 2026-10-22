import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useAcademicDialog } from './useAcademicDialog'

export default function AcademicDeleteDialog({ title, course, busy, error, onCancel, onDelete }: {
  title: string; course: string; busy: boolean; error: string | null
  onCancel: () => void; onDelete: () => Promise<boolean>
}) {
  const ref = useAcademicDialog()
  const id = useId()
  const [attempted, setAttempted] = useState(false)
  const submitting = useRef(false)
  useLayoutEffect(() => {
    if (busy) ref.current?.querySelector<HTMLElement>('[data-progress]')?.focus()
    else if (attempted && error) ref.current?.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus()
  }, [busy, attempted, error, ref])
  return <dialog ref={ref} className="academic-dialog academic-confirmation" role="alertdialog" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-item ${id}-course ${id}-description`}
    onCancel={event => { event.preventDefault(); if (!busy && !submitting.current) onCancel() }}>
    <header className="academic-dialog-header"><p className="eyebrow">REMOVE ACADEMIC ITEM</p><h2 id={`${id}-heading`}>Delete this item?</h2></header>
    <div className="academic-dialog-body"><p id={`${id}-item`} className="academic-confirmation-item">{title}</p><p id={`${id}-course`} className="muted">{course}</p><p id={`${id}-description`}>This will permanently delete this academic item. Deletion cannot be undone. Your course and other items will stay saved.</p>
      {busy && <p role="status" tabIndex={-1} data-progress>Deleting item…</p>}
      {attempted && error && !busy && <p role="alert" className="academic-dialog-error">{error}</p>}
    </div>
    <footer className="academic-dialog-footer"><button type="button" data-initial-focus disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="academic-destructive" disabled={busy} onClick={async () => {
      if (submitting.current) return
      submitting.current = true; setAttempted(true)
      try { await onDelete() } finally { submitting.current = false }
    }}>{busy ? 'Deleting…' : 'Delete'}</button></footer>
  </dialog>
}
