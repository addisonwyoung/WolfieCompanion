import { useEffect, useRef, useState } from 'react'
import type { FriendRequest } from './friendshipApi'

export default function FriendRequests({ incoming, loading, error, busyIds, onRespond, onViewProfile, onRetry }: {
  incoming: FriendRequest[]; loading: boolean; error: boolean; busyIds: Set<string>; onRetry: () => void
  onRespond: (id: string, action: 'accept' | 'decline') => void
  onViewProfile: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) { element.showModal(); element.querySelector<HTMLButtonElement>('button')?.focus() }
    if (!open && element.open) element.close()
  }, [open])
  return <section className="panel friend-requests" aria-label="Friend requests">
    <button className="friend-requests-trigger" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
      Friend requests <span className="friend-request-badge" aria-label={`${incoming.length} pending incoming friend requests`}>{incoming.length}</span>
    </button>
    <dialog className="friend-dialog" ref={dialog} aria-labelledby="friend-requests-heading" onCancel={event => { event.preventDefault(); setOpen(false) }} onKeyDown={event => {
      if (event.key !== 'Tab') return
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      if (!buttons?.length) return
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}>
      <div className="section-top"><h2 id="friend-requests-heading">Friend requests</h2><button type="button" onClick={() => setOpen(false)} aria-label="Close friend requests">Close</button></div>
      {loading && <p role="status">Loading friend requests…</p>}
      {error && <div role="alert"><p>Unable to load friend requests.</p><button type="button" onClick={onRetry}>Retry friend requests</button></div>}
      {!loading && !error && !incoming.length && <p className="empty-state">You have no pending friend requests.</p>}
      <ul className="friend-request-list">{incoming.map(request => <li className="panel friend-request-card" key={request.request_id}>
        <div><h3>{request.sender_name}</h3><p className="student-major">{request.sender_major?.trim() || 'Major not added'}</p></div>
        <div className="friend-request-actions"><button type="button" onClick={() => onViewProfile(request.sender_id)}>View profile</button>
          <button type="button" className="primary" disabled={busyIds.has(request.request_id)} onClick={() => onRespond(request.request_id, 'accept')}>{busyIds.has(request.request_id) ? 'Updating…' : 'Accept'}</button>
          <button type="button" disabled={busyIds.has(request.request_id)} onClick={() => onRespond(request.request_id, 'decline')}>Decline</button></div>
      </li>)}</ul>
    </dialog>
  </section>
}
