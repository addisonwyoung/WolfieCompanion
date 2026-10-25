import { useEffect, useState, type FormEvent } from 'react'
import { summarizeEvaluations } from './evaluationData'
import type { CourseOffering } from './evaluationData'
import type { CourseEvaluation } from './evaluationData'
import { DuplicateCourseReviewError } from './courseReviews'
import type { CourseReviewApi } from './courseReviews'

export default function CourseEvaluations({ api }: { api: CourseReviewApi }) {
  const [query, setQuery] = useState('')
  const [offerings, setOfferings] = useState<CourseOffering[]>([])
  const [offeringsError, setOfferingsError] = useState(false)
  const [offeringsAttempt, setOfferingsAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [persistedByOffering, setPersistedByOffering] = useState<Record<string, CourseEvaluation[]>>({})
  const [submittedIds, setSubmittedIds] = useState<string[]>([])
  const [loadErrors, setLoadErrors] = useState<Record<string, boolean>>({})
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [submissionStatusError, setSubmissionStatusError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hours, setHours] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [review, setReview] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')

  const visibleOfferings = offerings.filter(offering =>
    `${offering.code} ${offering.title}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )
  const selected = offerings.find(offering => offering.id === selectedId) ?? offerings[0] ?? null

  useEffect(() => {
    let active = true
    void api.loadOfferings().then(data => {
      if (!active) return
      setOfferings(data)
      setOfferingsError(false)
    }).catch(() => { if (active) setOfferingsError(true) })
    return () => { active = false }
  }, [api, offeringsAttempt])

  useEffect(() => {
    if (!selected) return
    let active = true
    void api.loadOffering(selected.id).then(data => {
      if (!active) return
      setPersistedByOffering(current => ({ ...current, [selected.id]: data }))
      setLoadErrors(current => ({ ...current, [selected.id]: false }))
    }).catch(() => {
      if (active) setLoadErrors(current => ({ ...current, [selected.id]: true }))
    })
    return () => { active = false }
  }, [api, selected, loadAttempt])

  useEffect(() => {
    let active = true
    void api.myOfferingIds().then(ids => {
      if (active) setSubmittedIds(ids)
    }).catch(error => {
      if (active) setSubmissionStatusError(error instanceof Error ? error.message : 'Unable to check previous reviews.')
    })
    return () => { active = false }
  }, [api])

  const currentEvaluations = selected ? persistedByOffering[selected.id] ?? [] : []
  const averages = summarizeEvaluations(currentEvaluations)
  const alreadySubmitted = selected ? submittedIds.includes(selected.id) : false
  const loadState = selected ? (loadErrors[selected.id] ? 'error' : Object.hasOwn(persistedByOffering, selected.id) ? 'ready' : 'loading') : 'loading'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    if (alreadySubmitted || isSubmitting) {
      setNotice('You can publish only one review for this offering.')
      return
    }
    const nextErrors: Record<string, string> = {}
    const parsedHours = Number(hours)
    const parsedDifficulty = Number(difficulty)
    if (hours.trim() === '' || !Number.isFinite(parsedHours) || parsedHours < 0 || parsedHours > 40) nextErrors.hours = 'Enter weekly hours from 0 to 40.'
    if (difficulty.trim() === '' || !Number.isInteger(parsedDifficulty) || parsedDifficulty < 1 || parsedDifficulty > 5) nextErrors.difficulty = 'Choose a whole-number rating from 1 to 5.'
    if (review.length > 1000) nextErrors.review = 'Review must be 1,000 characters or fewer.'
    setErrors(nextErrors)
    setNotice('')
    if (Object.keys(nextErrors).length) return

    setIsSubmitting(true)
    try {
      const saved = await api.submit(selected.id, { weeklyHours: parsedHours, difficulty: parsedDifficulty, review: review.trim() })
      setPersistedByOffering(current => ({ ...current, [selected.id]: saved }))
      setSubmittedIds(current => [...new Set([...current, selected.id])])
      setHours('')
      setDifficulty('')
      setReview('')
      setErrors({})
      setNotice('Your anonymous review is saved and published for this offering.')
    } catch (error) {
      if (error instanceof DuplicateCourseReviewError) {
        setSubmittedIds(current => [...new Set([...current, selected.id])])
        setNotice('You have already published a review for this offering.')
      } else {
        setNotice(error instanceof Error ? error.message : 'Your review could not be saved. Your draft is still here; please retry.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return <section className="evaluation-view" aria-labelledby="evaluation-heading">
    <div className="evaluation-intro"><p className="eyebrow">COURSE EXPERIENCES</p><h1 id="evaluation-heading">Compare course offerings.</h1><p>Browse anonymous course reviews and share one review per offering.</p></div>
    <div className="evaluation-layout">
      <section className="panel offering-panel" aria-labelledby="offerings-heading">
        <h2 id="offerings-heading">Published offerings</h2>
        <label htmlFor="offering-search">Search by course code or title</label>
        <input id="offering-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. CSE 416" />
        {offeringsError && <div className="error" role="alert"><p>Course offerings could not be loaded.</p><button type="button" onClick={() => setOfferingsAttempt(value => value + 1)}>Retry offerings</button></div>}
        {!offeringsError && offerings.length === 0 && <p className="muted" role="status">{offeringsAttempt === 0 ? 'Loading published offerings…' : 'No catalog-verified offerings are available yet.'}</p>}
        <ul className="offering-list" aria-label="Matching course offerings">
          {visibleOfferings.map(offering => <li key={offering.id}><button className="offering-button" aria-pressed={selectedId === offering.id} onClick={() => { setSelectedId(offering.id); setNotice(''); setErrors({}) }}>
            <strong>{offering.code}: {offering.title}</strong><span>{offering.professor}{offering.section ? ` · Section ${offering.section}` : ''}</span><span>{offering.semester} {offering.year}</span>
          </button></li>)}
        </ul>
        {!offeringsError && offerings.length > 0 && visibleOfferings.length === 0 && <div className="empty-state search-empty" role="status"><h3>No matching offerings</h3><p>Try a different course code or title.</p></div>}
      </section>

      <div className="evaluation-content" aria-live="polite">
        <section className="panel summary-panel" aria-labelledby="selected-offering-heading">
          {!selected ? <><p className="eyebrow">SELECTED OFFERING</p><h2 id="selected-offering-heading">Select a course offering</h2><p className="muted">Verified offerings will appear here once available.</p></> : <>
          <p className="eyebrow">SELECTED OFFERING</p><h2 id="selected-offering-heading">{selected.code}: {selected.title}</h2>
          <p className="muted">{selected.professor}{selected.section ? ` · Section ${selected.section}` : ''} · {selected.semester} {selected.year}</p>
          {loadState === 'loading' && <p role="status">Loading course reviews…</p>}
          {loadState === 'error' && <div className="error" role="alert"><p>Saved course reviews could not be loaded.</p><button type="button" onClick={() => setLoadAttempt(value => value + 1)}>Retry reviews</button></div>}
          {averages ? <div className="evaluation-stats"><div><strong>{averages.hours.toFixed(1)}</strong><span>average hours / week</span></div><div><strong>{averages.difficulty.toFixed(1)} / 5</strong><span>average difficulty</span></div><div><strong>{currentEvaluations.length}</strong><span>{currentEvaluations.length === 1 ? 'review' : 'reviews'}</span></div></div> : loadState === 'ready' ? <div className="empty-state no-reviews" role="status"><h3>No evaluations yet</h3><p>Be the first to share an anonymous review for this offering.</p></div> : null}
          {(currentEvaluations.length > 0 || loadState === 'ready') && <>
            <h3 className="review-heading">Anonymous reviews</h3>
            {currentEvaluations.length ? <ul className="review-list">{currentEvaluations.map(item => <li key={item.id}><p>{item.review || 'No written comment provided.'}</p><span>{item.weeklyHours} hours/week · Difficulty {item.difficulty}/5</span></li>)}</ul> : <p className="muted review-empty-note">No written reviews to display yet.</p>}
          </>}
          </>}
        </section>

        <section className="panel submission-panel" aria-labelledby="submission-heading">
          <p className="eyebrow">YOUR EXPERIENCE</p><h2 id="submission-heading">Write an anonymous review</h2>
          {submissionStatusError && <p className="field-help" role="status">{submissionStatusError}</p>}
          {!selected ? <p className="muted">Choose an offering before writing a review.</p> : alreadySubmitted ? <p className="submitted-note" role="status">You’ve already published a review for this offering. Reading reviews remains available.</p> : <form onSubmit={submit} noValidate>
            <label htmlFor="review-offering">Course offering</label><select id="review-offering" value={selected.id} onChange={event => { setSelectedId(event.target.value); setNotice(''); setErrors({}) }}>{offerings.map(offering => <option key={offering.id} value={offering.id}>{offering.code} · {offering.professor}{offering.section ? ` · Section ${offering.section}` : ''} · {offering.semester} {offering.year}</option>)}</select>
            <label htmlFor="review-hours">Weekly hours</label><input id="review-hours" type="number" min="0" max="40" step="any" value={hours} onChange={event => setHours(event.target.value)} aria-invalid={Boolean(errors.hours)} aria-describedby={errors.hours ? 'hours-error' : 'hours-help'} />
            {errors.hours ? <p id="hours-error" className="error">{errors.hours}</p> : <p id="hours-help" className="field-help">Enter a value from 0 to 40.</p>}
            <label htmlFor="review-difficulty">Difficulty</label><select id="review-difficulty" value={difficulty} onChange={event => setDifficulty(event.target.value)} aria-invalid={Boolean(errors.difficulty)} aria-describedby={errors.difficulty ? 'difficulty-error' : undefined}><option value="">Select a rating</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} — {['', 'Very easy', 'Easy', 'Moderate', 'Hard', 'Very hard'][value]}</option>)}</select>
            {errors.difficulty && <p id="difficulty-error" className="error">{errors.difficulty}</p>}
            <label htmlFor="review-text">Written review</label><textarea id="review-text" rows={5} maxLength={1000} value={review} onChange={event => setReview(event.target.value)} aria-invalid={Boolean(errors.review)} aria-describedby={errors.review ? 'review-error' : 'review-count'} />
            {errors.review ? <p id="review-error" className="error">{errors.review}</p> : <p id="review-count" className="field-help">{review.length}/1,000 characters. Written review is optional.</p>}
            <button className="primary publish-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Publishing…' : 'Publish review'}</button>
          </form>}
          {notice && <p className="submission-notice" role="status">{notice}</p>}
          <p className="session-note">New reviews are saved to the course offering. Reviewer identity is never shown.</p>
        </section>
      </div>
    </div>
  </section>
}
