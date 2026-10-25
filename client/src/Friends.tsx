import { useEffect, useRef, useState } from 'react'
import type { DiscoverableStudent, FriendApi, FriendRelationship, FriendStudent } from './friendshipApi'
import type { LoadState } from './useFriendships'

export default function Friends({ friends, busyIds, onRetry, onViewProfile, onUnfriend, api, onOpenRequests, relationshipById = new Map() }: {
  friends: LoadState<FriendStudent>
  busyIds: Set<string>
  onRetry: () => void
  onViewProfile: (id: string) => void
  onUnfriend: (id: string) => void
  api: FriendApi
  onOpenRequests: () => void
  relationshipById?: Map<string, FriendRelationship>
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [directory, setDirectory] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; data: DiscoverableStudent[] }>({ status: 'idle', data: [] })
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  const [sendError, setSendError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const query = search.trim().toLocaleLowerCase()
  const filteredFriends = friends.status === 'success'
    ? friends.data.filter(friend => friend.name.toLocaleLowerCase().includes(query))
    : []
  const filteredDirectory = directory.status === 'success'
    ? directory.data.filter(student => student.name.toLocaleLowerCase().includes(query))
    : []
  const displayedDirectory = filteredDirectory.flatMap(student => {
    const relationship = relationshipById.get(student.student_id)?.relationship
    if (relationship === 'accepted') return []
    return [{ ...student, relationship: relationship ?? student.relationship }]
  })
  function closeFriends() { setOpen(false); setAdding(false); setSearch(''); setSendError('') }
  function openAddFriend() {
    setAdding(true); setSearch(''); setSendError('')
    if (directory.status === 'success') return
    setDirectory({ status: 'loading', data: [] })
    const controller = new AbortController()
    void api.directory(controller.signal).then(data => setDirectory({ status: 'success', data }), () => setDirectory({ status: 'error', data: [] }))
  }
  async function sendRequest(student: DiscoverableStudent) {
    if (student.relationship === 'outgoing_pending' || student.relationship === 'incoming_pending' || sendingIds.has(student.student_id)) return
    setSendError(''); setSendingIds(previous => new Set(previous).add(student.student_id))
    try {
      await api.sendToStudent(student.student_id)
      setDirectory(previous => ({ ...previous, data: previous.data.map(row => row.student_id === student.student_id ? { ...row, relationship: 'outgoing_pending' } : row) }))
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Friend request could not be sent. Please retry.')
    } finally {
      setSendingIds(previous => { const next = new Set(previous); next.delete(student.student_id); return next })
    }
  }
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) { element.showModal(); element.querySelector<HTMLButtonElement>('button')?.focus() }
    if (!open && element.open) element.close()
  }, [open])
  return <section className="panel friend-requests" aria-label="Friends">
    <button className="friend-requests-trigger" type="button" aria-label="Friends" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
      Friends <span className="friend-list-count">{friends.status === 'success' ? friends.data.length : ' '}</span>
    </button>
    <dialog className="friend-dialog" ref={dialog} aria-labelledby="friends-heading" onCancel={event => { event.preventDefault(); closeFriends() }} onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
      if (!controls?.length) return
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}>
      <div className="section-top"><h2 id="friends-heading">{adding ? 'Add a Friend' : 'Friends'}</h2><div className="friend-dialog-heading-actions">{adding ? <button type="button" onClick={() => { setAdding(false); setSearch(''); setSendError('') }}>Back to Friends</button> : <button type="button" onClick={openAddFriend}>Add a Friend</button>}<button type="button" onClick={closeFriends} aria-label="Close friends">Close</button></div></div>
      {adding ? <>
        <label className="friend-search-label" htmlFor="add-friend-search">Search students</label>
        <input id="add-friend-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Type a student's name" />
        {directory.status === 'loading' && <p role="status">Loading students…</p>}
        {directory.status === 'error' && <div role="alert"><p>Unable to load students.</p><button type="button" onClick={() => { setDirectory({ status: 'idle', data: [] }); openAddFriend() }}>Retry</button></div>}
        {sendError && <p role="alert">{sendError}</p>}
        {directory.status === 'success' && (displayedDirectory.length ? <ul className="friend-request-list">{displayedDirectory.map(student => <li className="panel friend-request-card friend-directory-card" key={student.student_id}>
          <div><h3>{student.name}</h3><p className="student-major">{student.major?.trim() || 'Major not added'}</p></div>
          <div className="recommendation-actions friend-directory-actions">
            <button type="button" className="recommendation-profile-button friend-directory-state-button" aria-label={`View profile of ${student.name}`} onClick={() => onViewProfile(student.student_id)}>View profile</button>
            {student.relationship === 'outgoing_pending' ? <span className="friend-status friend-directory-state-button friend-directory-request-sent" role="status" aria-label={`Friend request sent to ${student.name}`}>Request sent</span>
              : student.relationship === 'incoming_pending' ? <button type="button" onClick={onOpenRequests}>Respond to request</button>
                : <button type="button" className="add-friend-button" aria-label={sendingIds.has(student.student_id) ? `Sending friend request to ${student.name}` : student.relationship === 'declined' ? `Send friend request to ${student.name} again` : `Add ${student.name} as a friend`} title={student.relationship === 'declined' ? 'Send friend request again' : 'Add friend'} disabled={sendingIds.has(student.student_id)} onClick={() => void sendRequest(student)}>
                  {sendingIds.has(student.student_id) ? <span aria-hidden="true">…</span> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4" /><path d="M2.5 21a6.5 6.5 0 0 1 13 0M19 8v8m-4-4h8" /></svg>}
                  <span>{sendingIds.has(student.student_id) ? 'Sending…' : 'Add friend'}</span>
                </button>}
          </div>
        </li>)}</ul> : <p className="empty-state" role="status">{query ? 'No students match your search.' : 'No students available to add.'}</p>)}
      </> : <>
      {friends.status === 'loading' && <p role="status">Loading friends…</p>}
      {friends.status === 'error' && <div role="alert"><p>Unable to load your friends.</p><button type="button" onClick={onRetry}>Retry friends</button></div>}
      {friends.status === 'success' && !friends.data.length && <p className="empty-state">Accepted friends will appear here.</p>}
      {friends.status === 'success' && !!friends.data.length && <>
        <label className="friend-search-label" htmlFor="friends-search">Search friends</label>
        <input id="friends-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Type a friend's name" />
        {!filteredFriends.length ? <p className="empty-state" role="status">No friends match your search.</p> : <ul className="friend-request-list">{filteredFriends.map(friend => <li className="panel friend-request-card" key={friend.student_id}>
        <div><h3>{friend.name}</h3><p className="student-major">{friend.major?.trim() || 'Major not added'}</p></div>
        <div className="friend-card-actions">
          <button type="button" aria-label={`View profile of ${friend.name}`} onClick={() => onViewProfile(friend.student_id)}>View profile</button>
          <button type="button" className="remove-friend-button" aria-label={`Remove ${friend.name} as friend`} disabled={busyIds.has(friend.student_id)} onClick={() => onUnfriend(friend.student_id)}>{busyIds.has(friend.student_id) ? 'Removing…' : 'Remove friend'}</button>
        </div>
      </li>)}</ul>}
      </>}
      </>}
    </dialog>
  </section>
}
