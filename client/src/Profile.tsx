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

const interestCategories = [
  { name: 'sports & fitness', interests: ['Volleyball', 'Basketball', 'Soccer', 'Going to the Gym', 'Running', 'Hiking', 'Yoga', 'Walking', 'Baseball', 'Tennis', 'Swimming', 'Rock Climbing', 'Dance'] },
  { name: 'games & entertainment', interests: ['Video Games', 'Board Games', 'Anime & Manga', 'Movies', 'TV Shows', 'Listening to Music', 'Reading', 'Comic Books'] },
  { name: 'technology & business', interests: ['Web Development', 'Game Development', 'Robotics', 'Engineering', 'Trading & Investing'] },
  { name: 'arts', interests: ['Crafting', 'Drawing', 'Painting', 'Graphic Design', 'Photography', 'Video Editing', 'Creative Writing', 'Knitting & Crocheting', 'Playing an Instrument', 'Singing', 'Pottery'] },
  { name: 'food', interests: ['Cooking', 'Baking', 'Trying New Foods', 'Trying New Cafes'] },
] as const
const catalogInterests = new Set(interestCategories.flatMap(category => category.interests.map(interest => interest.toLowerCase())))
function cleanInterestDraft(interests: string[]) {
  return [...new Map(interests.map(interest => interest.trim()).filter(Boolean).map(interest => [interest.toLowerCase(), interest])).values()]
}

export default function Profile({ profile, onSave, pictureUrl }: { profile: StudentProfile; onSave: (profile: StudentProfile, picture?: PictureChange) => Promise<void>; pictureUrl?: (path: string) => Promise<string> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile)
  const [interestSearch, setInterestSearch] = useState('')
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
    setDraft({ ...profile, interests: cleanInterestDraft(profile.interests) }); setInterestSearch(''); setFile(null); setRemove(false); setError(''); setEditing(true)
  }
  function closeEditor() { setEditing(false); setInterestSearch(''); setFile(null); setRemove(false); requestAnimationFrame(() => editButton.current?.focus()) }
  function toggleInterest(interest: string) {
    const selected = draft.interests.some(value => value.trim().toLowerCase() === interest.toLowerCase())
    if (selected) {
      setDraft(previous => ({ ...previous, interests: previous.interests.filter(value => value.trim().toLowerCase() !== interest.toLowerCase()) }))
    } else if (draft.interests.length < 5) {
      setDraft(previous => ({ ...previous, interests: [...previous.interests, interest] }))
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    setError('')
    let next: StudentProfile
    try { next = normalizeProfile(draft) } catch (error) { setError((error as Error).message); nameInput.current?.focus(); return }
    saving.current = true; setBusy(true)
    try { await onSave(next, { file: file ?? undefined, remove }); closeEditor() }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to save. Please retry.') }
    finally { saving.current = false; setBusy(false) }
  }
  const avatarUrl = savedPicture?.path === profile.avatar_path ? savedPicture?.url : undefined
  const selectedCount = draft.interests.length
  const normalizedSearch = interestSearch.trim().toLowerCase()
  const legacyInterests = draft.interests.filter(interest => !catalogInterests.has(interest.trim().toLowerCase()))
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
        <div className="interests-heading"><label htmlFor="interests-search">Interests (optional)</label><span className="interest-count" aria-live="polite">{selectedCount}/5 selected</span></div>
        <input id="interests-search" type="search" value={interestSearch} onChange={event => setInterestSearch(event.target.value)} aria-describedby="interests-help profile-error" placeholder="Search interests" />
        <p id="interests-help" className="field-help">Search the categories and select up to five interests total. Your selections are saved to your profile.</p>
        <div className="selected-interests" aria-label="Selected interests">
          {draft.interests.length ? <ul className="interest-chips">{draft.interests.map((interest, index) => <li key={`${index}-${interest}`}><button type="button" className="interest-chip" onClick={() => toggleInterest(interest)} aria-label={`Remove ${interest} interest`}>{interest}<span aria-hidden="true"> ×</span></button></li>)}</ul> : <p className="field-help">No interests selected.</p>}
        </div>
        {legacyInterests.length > 0 && <p className="field-help">Some saved interests are outside the current list. They remain selected until removed.</p>}
        <div className="interest-categories">
          {interestCategories.map(category => {
            const options = category.interests.filter(interest => interest.toLowerCase().includes(normalizedSearch))
            if (!options.length) return null
            return <details className="interest-category" key={category.name} open={normalizedSearch ? true : undefined}>
              <summary>{category.name}<span className="interest-category-count">{category.interests.filter(interest => draft.interests.some(value => value.trim().toLowerCase() === interest.toLowerCase())).length} selected</span></summary>
              <div className="interest-options">{options.map(interest => {
                const selected = draft.interests.some(value => value.trim().toLowerCase() === interest.toLowerCase())
                return <button key={interest} type="button" className="interest-option" aria-pressed={selected} disabled={!selected && selectedCount >= 5} onClick={() => toggleInterest(interest)}>{interest}</button>
              })}</div>
            </details>
          })}
          {normalizedSearch && interestCategories.every(category => category.interests.every(interest => !interest.toLowerCase().includes(normalizedSearch))) && <p className="field-help">No listed interests match your search. Clear the search to browse categories.</p>}
        </div>
        <p className="field-help">Your name and major are always shared with eligible students who saved the same course. Choose which other details to share. Courses are self-reported.</p>
        {([['share_year', 'year of study'], ['share_interests', 'interests'], ['share_residence_status', 'residence status'], ['share_avatar', 'profile picture']] as const).map(([key, label]) => <label className="sharing-choice" key={key}><input type="checkbox" checked={draft[key] === true} onChange={e => setDraft({ ...draft, [key]: e.target.checked })} /> Share my {label} with classmates</label>)}
        <label className="sharing-choice"><input type="checkbox" checked={draft.allow_new_dms !== false} onChange={event => setDraft({ ...draft, allow_new_dms: event.target.checked })} /> Allow new direct messages</label>
        <p className="field-help">New DMs are open by default. Turning this off prevents new direct conversations and new group additions. Existing direct and group chats stay available.</p>
        <label htmlFor="picture">Profile picture (optional)</label><input id="picture" type="file" accept="image/png,image/jpeg" aria-describedby="picture-help profile-error" onChange={e => {
          const next = e.target.files?.[0]; if (!next) return
          if (!['image/png','image/jpeg'].includes(next.type) || !next.size || next.size > 5 * 1024 * 1024) { setError('Choose a nonempty PNG or JPEG up to 5 MiB.'); e.target.value = ''; return }
          setFile(next); setRemove(false); setError('')
        }} />
        <p id="picture-help" className="field-help">PNG or JPEG, up to 5 MiB. Pictures stay private unless you choose to share them with classmates.</p>
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
