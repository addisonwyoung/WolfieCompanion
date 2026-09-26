import { useMemo, useState, type FormEvent } from 'react'
import { courseOfferings, sampleEvaluations } from './evaluationData'
import type { CourseEvaluation } from './evaluationData'

export default function CourseEvaluations() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(courseOfferings[0].id)
  const [evaluations, setEvaluations] = useState(sampleEvaluations)
  const [submittedIds, setSubmittedIds] = useState<string[]>([])
  const [hours, setHours] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [review, setReview] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')

  const offerings = courseOfferings.filter(offering => offering.published)
  const visibleOfferings = offerings.filter(offering =>
    `${offering.code} ${offering.title}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )
  const selected = offerings.find(offering => offering.id === selectedId)!
  const currentEvaluations = evaluations.filter(evaluation => evaluation.offeringId === selected.id)
  const averages = useMemo(() => currentEvaluations.length ? {
    hours: currentEvaluations.reduce((sum, item) => sum + item.weeklyHours, 0) / currentEvaluations.length,
    difficulty: currentEvaluations.reduce((sum, item) => sum + item.difficulty, 0) / currentEvaluations.length,
  } : null, [currentEvaluations])
  const alreadySubmitted = submittedIds.includes(selected.id)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (alreadySubmitted) {
      setNotice('You can publish only one review for this offering during this session.')
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
    const newEvaluation: CourseEvaluation = {
      id: `session-${evaluations.length + 1}`,
      offeringId: selected.id,
      weeklyHours: parsedHours,
      difficulty: parsedDifficulty,
      review: review.trim(),
    }
    setEvaluations(current => [...current, newEvaluation])
    setSubmittedIds(current => [...current, selected.id])
    setHours('')
    setDifficulty('')
    setReview('')
    setErrors({})
    setNotice('Your anonymous review is published for this session.')
  }

  return <section className="evaluation-view" aria-labelledby="evaluation-heading">
    <div className="evaluation-intro"><p className="eyebrow">COURSE EXPERIENCES</p><h1 id="evaluation-heading">Compare course offerings.</h1><p>Browse anonymous sample reviews and share one review per offering. </p></div>
    <div className="evaluation-layout">
      <section className="panel offering-panel" aria-labelledby="offerings-heading">
        <h2 id="offerings-heading">Published offerings</h2>
        <label htmlFor="offering-search">Search by course code or title</label>
        <input id="offering-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. CSE 416" />
        <ul className="offering-list" aria-label="Matching course offerings">
          {visibleOfferings.map(offering => <li key={offering.id}><button className="offering-button" aria-pressed={selectedId === offering.id} onClick={() => { setSelectedId(offering.id); setNotice(''); setErrors({}) }}>
            <strong>{offering.code}: {offering.title}</strong><span>{offering.professor}</span><span>{offering.semester} {offering.year}</span>
          </button></li>)}
        </ul>
        {visibleOfferings.length === 0 && <div className="empty-state search-empty" role="status"><h3>No matching offerings</h3><p>Try a different course code or title.</p></div>}
      </section>

      <div className="evaluation-content" aria-live="polite">
        <section className="panel summary-panel" aria-labelledby="selected-offering-heading">
          <p className="eyebrow">SELECTED OFFERING</p><h2 id="selected-offering-heading">{selected.code}: {selected.title}</h2>
          <p className="muted">{selected.professor} · {selected.semester} {selected.year}</p>
          {averages ? <div className="evaluation-stats"><div><strong>{averages.hours.toFixed(1)}</strong><span>average hours / week</span></div><div><strong>{averages.difficulty.toFixed(1)} / 5</strong><span>average difficulty</span></div><div><strong>{currentEvaluations.length}</strong><span>{currentEvaluations.length === 1 ? 'review' : 'reviews'}</span></div></div> : <div className="empty-state no-reviews" role="status"><h3>No evaluations yet</h3><p>Be the first to share an anonymous review for this offering.</p></div>}
          <h3 className="review-heading">Anonymous reviews</h3>
          {currentEvaluations.length ? <ul className="review-list">{currentEvaluations.map(item => <li key={item.id}><p>{item.review || 'No written comment provided.'}</p><span>{item.weeklyHours} hours/week · Difficulty {item.difficulty}/5</span></li>)}</ul> : <p className="muted review-empty-note">No written reviews to display yet.</p>}
        </section>

        <section className="panel submission-panel" aria-labelledby="submission-heading">
          <p className="eyebrow">YOUR EXPERIENCE</p><h2 id="submission-heading">Write an anonymous review</h2>
          {alreadySubmitted ? <p className="submitted-note" role="status">You’ve already published a review for this offering this session. Reading reviews remains available.</p> : <form onSubmit={submit} noValidate>
            <label htmlFor="review-offering">Course offering</label><select id="review-offering" value={selected.id} onChange={event => { setSelectedId(event.target.value); setNotice(''); setErrors({}) }}>{offerings.map(offering => <option key={offering.id} value={offering.id}>{offering.code} · {offering.professor} · {offering.semester} {offering.year}</option>)}</select>
            <label htmlFor="review-hours">Weekly hours</label><input id="review-hours" type="number" min="0" max="40" step="any" value={hours} onChange={event => setHours(event.target.value)} aria-invalid={Boolean(errors.hours)} aria-describedby={errors.hours ? 'hours-error' : 'hours-help'} />
            {errors.hours ? <p id="hours-error" className="error">{errors.hours}</p> : <p id="hours-help" className="field-help">Enter a value from 0 to 40.</p>}
            <label htmlFor="review-difficulty">Difficulty</label><select id="review-difficulty" value={difficulty} onChange={event => setDifficulty(event.target.value)} aria-invalid={Boolean(errors.difficulty)} aria-describedby={errors.difficulty ? 'difficulty-error' : undefined}><option value="">Select a rating</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} — {['', 'Very easy', 'Easy', 'Moderate', 'Hard', 'Very hard'][value]}</option>)}</select>
            {errors.difficulty && <p id="difficulty-error" className="error">{errors.difficulty}</p>}
            <label htmlFor="review-text">Written review</label><textarea id="review-text" rows={5} maxLength={1000} value={review} onChange={event => setReview(event.target.value)} aria-invalid={Boolean(errors.review)} aria-describedby={errors.review ? 'review-error' : 'review-count'} />
            {errors.review ? <p id="review-error" className="error">{errors.review}</p> : <p id="review-count" className="field-help">{review.length}/1,000 characters. Written review is optional.</p>}
            <button className="primary publish-button" type="submit">Publish review</button>
          </form>}
          {notice && <p className="submission-notice" role="status">{notice}</p>}
          <p className="session-note">Demo data only: reviews are anonymous.</p>
        </section>
      </div>
    </div>
  </section>
}
