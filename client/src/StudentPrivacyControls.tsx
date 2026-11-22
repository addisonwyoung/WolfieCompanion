import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { StudentPrivacyController } from './useStudentPrivacy'
import type { StudentPrivacyApi, WarningContext } from './studentPrivacy'
import { useSharedGroupWarnings } from './useSharedGroupWarnings'
import './StudentPrivacyControls.css'

export function StudentBlockAction({ privacy, student, name, onBlocked }: { privacy?: StudentPrivacyController; student: string; name: string; onBlocked?: () => void }) {
  const [intent, setIntent] = useState<'block' | 'unblock' | null>(null), [error, setError] = useState(''), [message, setMessage] = useState('')
  const alive = useRef(true), pending = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  if (!privacy) return null
  const blocked = privacy.outgoing.has(student), busy = privacy.busy.size > 0 || privacy.loading
  async function perform() {
    if (!privacy || pending.current || !intent) return
    const targetBlocked = intent === 'block'
    pending.current = true; setError(''); setMessage('')
    try {
      if (await privacy.mutate(student, targetBlocked) && alive.current) {
        setIntent(null); setMessage(targetBlocked ? 'Blocked. Shared group memberships are unchanged.' : 'Unblocked. Friendship and messaging permissions were not restored.')
        if (targetBlocked) onBlocked?.()
      }
    } catch { if (alive.current) setError('This change was not confirmed. Please retry.') }
    finally { pending.current = false }
  }
  return <div className="student-block-action">
    {!intent ? <button type="button" disabled={busy} onClick={() => { setIntent(blocked ? 'unblock' : 'block'); setMessage(''); setError('') }}>{blocked ? 'Unblock' : 'Block'} {name}</button> : <>
      <p>{intent === 'unblock' ? 'Unblocking does not restore friendship or override either student’s messaging preferences.' : 'Blocking removes your friendship and pending friend requests, and prevents direct messages in both directions. It does not remove either student from shared groups.'}</p>
      <button type="button" disabled={busy} onClick={() => void perform()}>{busy ? 'Saving privacy change…' : error ? 'Retry privacy change' : intent === 'unblock' ? 'Confirm unblock' : 'Confirm block'}</button>
      <button type="button" disabled={busy} onClick={() => { setIntent(null); setError('') }}>Cancel privacy change</button>
    </>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </div>
}

export function BlockedStudentsSection({ privacy }: { privacy: StudentPrivacyController }) {
  return <details className="panel blocked-students" onToggle={event => { if (event.currentTarget.open) void privacy.refresh() }}><summary><h2>Blocked Students</h2><span className="blocked-students-summary-hint" aria-hidden="true">Manage</span></summary>
    <div className="blocked-students-content">
    <p className="blocked-students-explanation">Only your outgoing blocks appear here. Names were saved when you blocked the student; missing names stay private. Unblocking does not restore friendships or override other restrictions.</p>
    {privacy.loading && <p role="status">Loading blocked students…</p>}
    {privacy.error && <div role="alert"><p>{privacy.error}</p><button onClick={() => void privacy.refresh()}>Retry blocked students</button></div>}
    {!privacy.loading && !privacy.error && !privacy.blocks.length && <p className="blocked-students-empty">You have not blocked any students.</p>}
    <ul>{privacy.blocks.map(row => <li key={row.student_id}><span>{row.name_snapshot?.trim() || 'Blocked student'}</span><StudentBlockAction privacy={privacy} student={row.student_id} name={row.name_snapshot?.trim() || 'Blocked student'} /></li>)}</ul>
    </div>
  </details>
}

export function SharedGroupWarningBanner({ api, userId, context, groupId, onLeave, leaveControl, leaveDisabled = false }: { api?: StudentPrivacyApi; userId: string; context: WarningContext; groupId: string | null; onLeave?: () => void; leaveControl?: ReactNode; leaveDisabled?: boolean }) {
  const notices = useSharedGroupWarnings(api, userId, context, groupId)
  const panel = useRef<HTMLDivElement>(null)
  if (!api || !groupId) return null
  return <div ref={panel} data-group-id={groupId} tabIndex={-1} role="region" className="group-privacy-notices" aria-label="Private group notices">
    {notices.error && <div role="alert"><p>{notices.error}</p><button onClick={() => void notices.retry()}>Retry privacy notices</button></div>}
    {notices.warnings.map(row => <section className="group-privacy-banner" key={row.warning_id} aria-busy={notices.pending.has(row.warning_id)} aria-label={`Private notice about ${row.name}`}>
      <div className="group-privacy-copy"><p className="group-privacy-label">Private group notice</p><p>You blocked {row.name}. You share this group. Blocking prevents direct messaging but does not prevent shared-group interaction.</p>
      {notices.failed.has(row.warning_id) && <p role="alert">Dismissal was not confirmed. Please retry.</p>}
      </div>
      <div className="group-privacy-actions"><button disabled={notices.pending.has(row.warning_id)} onClick={event => {
        const button = event.currentTarget, origin = panel.current
        void notices.dismiss(row.warning_id).then(confirmed => {
          if (confirmed) requestAnimationFrame(() => { if (panel.current === origin && origin?.dataset.groupId === groupId && !button.isConnected && document.activeElement === document.body) origin.focus() })
        })
      }}>{notices.pending.has(row.warning_id) ? 'Dismissing…' : notices.failed.has(row.warning_id) ? `Retry dismissal for ${row.name}` : `Dismiss notice about ${row.name}`}</button>
      {leaveControl ?? <button disabled={leaveDisabled || !onLeave} onClick={onLeave}>Leave this group</button>}
      </div>
      {leaveDisabled && <p className="group-privacy-help">Resolve the pending group change before leaving.</p>}
    </section>)}
  </div>
}
