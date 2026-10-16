import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { normalizeProfile, years } from './account'
import type { StudentProfile, PictureChange } from './account'

export function Interests({ interests }: { interests: string[] }) {
  return interests.length ? <ul className="tags">{interests.map((interest, index) => <li key={`${index}-${interest}`}>{interest}</li>)}</ul> : <p className="muted">No interests added yet.</p>
}
export function Avatar({ name, url }: { name: string; url?: string }) {
  const [failedUrl, setFailedUrl] = useState('')
  return url && url !== failedUrl ? <img className="avatar" src={url} alt={`${name}'s profile picture`} onError={() => setFailedUrl(url)} /> : <span className="avatar" aria-hidden="true">{name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span>
}
export default function Profile({ profile, onSave, pictureUrl }: { profile: StudentProfile; onSave: (profile: StudentProfile, picture?: PictureChange) => Promise<void>; pictureUrl?: (path: string) => Promise<string> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile)
  const [interests, setInterests] = useState(profile.interests.join(', '))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [remove, setRemove] = useState(false)
  const [preview, setPreview] = useState('')
  const [savedPicture, setSavedPicture] = useState<{ path: string; url: string } | null>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const saving = useRef(false)
  useEffect(() => {
    if (!profile.avatar_path || !pictureUrl) return
    const path = profile.avatar_path
    let active = true
    const load = () => { void pictureUrl(path).then(url => { if (active) setSavedPicture({ path, url }) }).catch(() => { if (active) setSavedPicture(null) }) }
    load(); const timer = setInterval(load, 240_000)
    return () => { active = false; clearInterval(timer) }
  }, [profile.avatar_path, pictureUrl])
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file); const timer = setTimeout(() => setPreview(url), 0)
    return () => { clearTimeout(timer); URL.revokeObjectURL(url) }
  }, [file])
  function beginEdit() {
    setDraft(profile); setInterests(profile.interests.join(', ')); setFile(null); setRemove(false); setError(''); setEditing(true)
  }
  function closeEditor() { setEditing(false); setFile(null); setRemove(false); requestAnimationFrame(() => editButton.current?.focus()) }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    setError('')
    let next: StudentProfile
    try { next = normalizeProfile({ ...draft, interests: interests.split(',') }) } catch (error) { setError((error as Error).message); nameInput.current?.focus(); return }
    saving.current = true; setBusy(true)
    try { await onSave(next, { file: file ?? undefined, remove }); closeEditor() }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to save. Please retry.') }
    finally { saving.current = false; setBusy(false) }
  }
  const avatarUrl = savedPicture?.path === profile.avatar_path ? savedPicture?.url : undefined
  return <section className="panel profile" aria-labelledby="profile-heading">
    <div className="section-top"><h2 id="profile-heading">Your profile</h2></div>
    <div className="profile-identity"><Avatar name={profile.name} url={avatarUrl} /><h3>{profile.name}</h3><p className="muted">A little about you. A place to connect.</p></div>
    {editing ? <form onSubmit={save}>
      <fieldset disabled={busy}>
        <legend className="eyebrow">Make it your own</legend>
        <label htmlFor="name">Name</label><input id="name" ref={nameInput} autoFocus maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} aria-describedby="profile-error" />
        <label htmlFor="major">Major (optional)</label><input id="major" aria-describedby="profile-error" maxLength={120} value={draft.major ?? ''} onChange={e => setDraft({ ...draft, major: e.target.value })} />
        <label htmlFor="year">Year of study (optional)</label><select id="year" aria-describedby="profile-error" value={draft.year ?? ''} onChange={e => setDraft({ ...draft, year: e.target.value || null })}><option value="">Not set</option>{years.map(value => <option key={value}>{value}</option>)}</select>
        <label htmlFor="residence">Residence status (optional)</label><select id="residence" aria-describedby="profile-error" value={draft.residence_status ?? ''} onChange={e => setDraft({ ...draft, residence_status: (e.target.value || null) as StudentProfile['residence_status'] })}><option value="">Not set</option><option value="commuter">Commuter</option><option value="dormer">Dormer</option></select>
        <label htmlFor="interests">Interests (optional)</label><textarea id="interests" value={interests} onChange={e => setInterests(e.target.value)} aria-describedby="interests-help profile-error" rows={3} />
        <p id="interests-help" className="field-help">Separate up to 20 interests with commas. Each can have up to 50 characters.</p>
        <label htmlFor="picture">Profile picture (optional)</label><input id="picture" type="file" accept="image/png,image/jpeg" aria-describedby="picture-help profile-error" onChange={e => {
          const next = e.target.files?.[0]; if (!next) return
          if (!['image/png','image/jpeg'].includes(next.type) || !next.size || next.size > 5 * 1024 * 1024) { setError('Choose a nonempty PNG or JPEG up to 5 MiB.'); e.target.value = ''; return }
          setFile(next); setRemove(false); setError('')
        }} />
        <p id="picture-help" className="field-help">PNG or JPEG, up to 5 MiB. Pictures stay private to your account.</p>
        {file && preview && <img className="picture-preview" src={preview} alt="New profile picture preview" onError={() => { setFile(null); setError('This picture could not be opened. Choose a readable PNG or JPEG.') }} />}
        {(file || profile.avatar_path) && <button type="button" onClick={() => { setFile(null); setRemove(true) }}>Remove picture</button>}
        {remove && <p className="field-help">Your picture will be removed when you save.</p>}
        <div className="form-actions"><button className="primary" type="submit">{busy ? 'Saving…' : 'Save'}</button><button type="button" onClick={closeEditor}>Cancel</button></div>
      </fieldset>
      <p id="profile-error" className="error" role="alert">{error}</p><p role="status">{busy ? 'Saving your profile…' : ''}</p>
    </form> : <>
      <dl><dt>Major</dt><dd>{profile.major || 'Not set'}</dd><dt>Year of study</dt><dd>{profile.year || 'Not set'}</dd><dt>Residence</dt><dd>{profile.residence_status === 'commuter' ? 'Commuter' : profile.residence_status === 'dormer' ? 'Dormer' : 'Not set'}</dd></dl>
      <h4>Interests</h4><Interests interests={profile.interests} /><button ref={editButton} className="edit-button" onClick={beginEdit}>Edit profile <span aria-hidden="true">↗</span></button>
    </>}
    <p className="session-note">Saved to your account. Add details now or come back later.</p>
  </section>
}
