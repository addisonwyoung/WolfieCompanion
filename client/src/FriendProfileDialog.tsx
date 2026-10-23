import { useEffect, useRef, useState } from 'react'
import { Avatar, Interests } from './Profile'
import type { FriendApi, FriendStudent } from './friendshipApi'

export default function FriendProfileDialog({ api, student, onClose }: { api: FriendApi; student: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [profile, setProfile] = useState<FriendStudent | null | undefined>()
  const [error, setError] = useState(false)
  const [picture, setPicture] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const element = dialog.current!
    const origin = document.activeElement as HTMLElement | null
    element.showModal(); element.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { element.close(); if (origin?.isConnected) origin.focus() }
  }, [])
  useEffect(() => {
    const controller = new AbortController(); let active = true; let objectUrl = ''
    setProfile(undefined); setError(false); setPicture('')
    void api.profile(student, controller.signal).then(value => {
      if (!active) return
      setProfile(value)
      if (value?.has_shared_avatar) void api.picture(student, controller.signal).then(blob => { if (active) { objectUrl = URL.createObjectURL(blob); setPicture(objectUrl) } }).catch(() => {})
    }).catch(() => { if (active) setError(true) })
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [api, student, attempt])
  return <dialog className="peer-dialog" ref={dialog} aria-labelledby="friend-profile-heading" onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    if (!buttons?.length) return
    const first = buttons[0], last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }}>
    <div className="section-top"><h2 id="friend-profile-heading">Student profile</h2><button onClick={onClose} aria-label="Close profile">Close</button></div>
    {!profile && !error && <p role="status">Loading profile…</p>}
    {error && <><p role="alert">Unable to load profile. Please retry.</p><button onClick={() => setAttempt(value => value + 1)}>Retry profile</button></>}
    {profile === null && <p role="status">Profile unavailable.</p>}
    {profile && <><div className="profile-identity"><Avatar name={profile.name} url={picture || undefined} /><h3>{profile.name}</h3></div>
      <dl><dt>Major</dt><dd>{profile.major || 'Major not added'}</dd>
        {'year' in profile && <><dt>Year of study</dt><dd>{profile.year || 'Not added'}</dd></>}
        {'residence_status' in profile && <><dt>Residence</dt><dd>{profile.residence_status === 'commuter' ? 'Commuter' : profile.residence_status === 'dormer' ? 'Dormer' : 'Not added'}</dd></>}
      </dl>{'interests' in profile && <><h4>Interests</h4><Interests interests={profile.interests ?? []} /></>}
      <p className="field-help">Only details this student has chosen to share appear here.</p></>}
  </dialog>
}
