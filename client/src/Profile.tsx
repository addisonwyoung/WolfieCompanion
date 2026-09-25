import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { years } from './sampleData'
import type { Student, Year } from './sampleData'

export function Interests({ interests }: { interests: string[] }) {
  return interests.length ? <ul className="tags">{interests.map((interest, index) => <li key={`${index}-${interest}`}>{interest}</li>)}</ul> : <p className="muted">No interests added yet.</p>
}
export function Avatar({ name }: { name: string }) {
  return <span className="avatar" aria-hidden="true">{name.split(' ').map(part => part[0]).join('')}</span>
}
export default function Profile({ profile, onSave }: { profile: Student; onSave: (profile: Student) => void }) {
  const [editing, setEditing] = useState(false)
  const [major, setMajor] = useState(profile.major)
  const [year, setYear] = useState<Year>(profile.year)
  const [interests, setInterests] = useState(profile.interests.join(', '))
  const [error, setError] = useState('')
  const editButton = useRef<HTMLButtonElement>(null)
  const majorInput = useRef<HTMLInputElement>(null)
  function beginEdit() {
    setMajor(profile.major)
    setYear(profile.year)
    setInterests(profile.interests.join(', '))
    setError('')
    setEditing(true)
  }
  function closeEditor() {
    setEditing(false)
    requestAnimationFrame(() => editButton.current?.focus())
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!major.trim()) {
      setError('Enter a major before saving.')
      majorInput.current?.focus()
      return
    }
    if (!years.includes(year)) return
    onSave({ ...profile, major: major.trim(), year, interests: interests.split(',').map(value => value.trim()).filter(Boolean) })
    closeEditor()
  }
  return <section className="panel profile" aria-labelledby="profile-heading">
    <div className="section-top"><h2 id="profile-heading">Your profile</h2><span className="eyebrow">SAMPLE</span></div>
    <div className="profile-identity"><Avatar name={profile.name} /><h3>{profile.name}</h3><p className="muted">A little about you. A place to connect.</p></div>
    {editing ? <form onSubmit={save}>
      <label htmlFor="major">Major</label>
      <input id="major" ref={majorInput} autoFocus value={major} onChange={event => setMajor(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'major-error' : undefined} />
      {error && <p id="major-error" className="error" role="alert">{error}</p>}
      <label htmlFor="year">Year of study</label>
      <select id="year" value={year} onChange={event => setYear(event.target.value as Year)}>{years.map(value => <option key={value}>{value}</option>)}</select>
      <label htmlFor="interests">Interests <span className="muted">(optional)</span></label>
      <textarea id="interests" value={interests} onChange={event => setInterests(event.target.value)} aria-describedby="interests-help" rows={3} />
      <p id="interests-help" className="field-help">Separate interests with commas.</p>
      <div className="form-actions"><button className="primary" type="submit">Save</button><button type="button" onClick={closeEditor}>Cancel</button></div>
    </form> : <>
      <dl><dt>Major</dt><dd>{profile.major}</dd><dt>Year of study</dt><dd>{profile.year}</dd></dl>
      <h4>Interests</h4><Interests interests={profile.interests} />
      <button ref={editButton} className="edit-button" onClick={beginEdit}>Edit profile <span aria-hidden="true">↗</span></button>
    </>}
    <p className="session-note">Make it your own for this visit. Profile edits reset when you reload.</p>
  </section>
}
