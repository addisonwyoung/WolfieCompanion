import { useEffect, useRef, useState } from 'react'
import { Avatar, Interests } from './Profile'
import type { ClassmateProfile as Peer, PeerApi } from './classmateProfile'

function ProfileDialog({ api, course, student, onClose }: { api: PeerApi; course: string; student: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ status: 'success' | 'error' | 'unavailable'; profile?: Peer } | null>(null)
  const [picture, setPicture] = useState('')
  useEffect(() => {
    const element = dialog.current!
    const origin = document.activeElement as HTMLElement | null
    element.showModal()
    element.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { element.close(); if (origin?.isConnected) origin.focus() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let objectUrl = ''
    void api.detail(course, student, controller.signal).then(profile => {
      if (!active) return
      setResult(profile ? { status: 'success', profile } : { status: 'unavailable' })
      if (profile?.has_shared_avatar) void api.picture(course, student, controller.signal).then(blob => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob); setPicture(objectUrl)
      }).catch(() => { /* Initials remain when a shared picture cannot load. */ })
    }).catch(() => { if (active) setResult({ status: 'error' }) })
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [api, course, student, attempt])
  const peer = result?.profile
  return <dialog className="peer-dialog" ref={dialog} aria-labelledby="peer-heading" onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    if (!buttons?.length) return
    const first = buttons[0], last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }}>
    <div className="section-top"><h2 id="peer-heading">Classmate profile</h2><button onClick={onClose} aria-label="Close profile">Close</button></div>
    <p className="muted">Classmates in {course}</p>
    {!result && <p role="status">Loading profile…</p>}
    {result?.status === 'error' && <><p role="alert">Unable to load profile. Please retry.</p><button onClick={() => { setResult(null); setPicture(''); setAttempt(value => value + 1) }}>Retry profile</button></>}
    {result?.status === 'unavailable' && <p role="status">Profile unavailable.</p>}
    {peer && <><div className="profile-identity"><Avatar name={peer.name} url={picture} /><h3>{peer.name}</h3></div>
      <dl><dt>Major</dt><dd>{peer.major || 'Major not added'}</dd>
        {'year' in peer && <><dt>Year of study</dt><dd>{peer.year || 'Not added'}</dd></>}
        {'residence_status' in peer && <><dt>Residence</dt><dd>{peer.residence_status === 'commuter' ? 'Commuter' : peer.residence_status === 'dormer' ? 'Dormer' : 'Not added'}</dd></>}
      </dl>
      {'interests' in peer && <><h4>Interests</h4><Interests interests={peer.interests ?? []} /></>}
      <p className="field-help">Only details this student has chosen to share appear here.</p>
    </>}
  </dialog>
}

// Remount on a peer/course change to mask old details before effects run.
export default function ClassmateProfile(props: { api: PeerApi; course: string; student: string; onClose: () => void }) {
  return <ProfileDialog key={JSON.stringify([props.course, props.student])} {...props} />
}
