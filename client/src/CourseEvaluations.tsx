import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { summarizeEvaluations } from './evaluationData'
import type { CourseOffering } from './evaluationData'
import type { CourseEvaluation } from './evaluationData'
import { DuplicateCourseReviewError } from './courseReviews'
import type { CatalogCourse, CourseReviewApi, OwnedCourseReview } from './courseReviews'

interface BarValue { label: string; count: number; tone?: 'yes' | 'no' }
type CatalogOnlyOffering = CourseOffering & { catalogOnly: true }

function catalogOnlyOffering(course: CatalogCourse, professor?: CatalogCourse['professors'][number]): CatalogOnlyOffering {
  const professorName = professor ? `${professor.firstName} ${professor.lastName}` : ''
  return {
    id: `catalog-${course.code.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}${professor ? `-${professorName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '-any-professor'}`,
    code: course.code,
    title: course.title,
    courseNumber: course.courseNumber,
    professor: professorName,
    professorFirstName: professor?.firstName,
    professorLastName: professor?.lastName,
    semester: 'Fall',
    year: 2026,
    published: true,
    catalogOnly: true,
  }
}

function ReviewBarChart({ title, id, rows }: { title: string; id: string; rows: BarValue[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const scale = Math.max(total, 1)
  return <section className="review-chart" aria-labelledby={id}>
    <h3 id={id}>{title}</h3>
    {rows.map(row => <div className="review-chart-row" key={row.label}>
      <span>{row.label}</span>
      <div className="review-chart-track" role="meter" aria-label={`${row.label} ${title.toLocaleLowerCase()}`} aria-valuemin={0} aria-valuemax={scale} aria-valuenow={row.count}>
        <span className={`review-chart-fill${row.tone ? ` review-chart-${row.tone}` : ''}`} style={{ width: `${row.count / scale * 100}%` }} />
      </div>
      <strong>{row.count}</strong>
    </div>)}
    <p className="field-help">{total} {total === 1 ? 'response' : 'responses'}</p>
  </section>
}

export default function CourseEvaluations({ api }: { api: CourseReviewApi }) {
  const [query, setQuery] = useState('')
  const [activeOfferingTab, setActiveOfferingTab] = useState<'current' | 'reviews' | 'search'>('current')
  const [catalogCourses, setCatalogCourses] = useState<CatalogCourse[]>([])
  const [catalogError, setCatalogError] = useState('')
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [offerings, setOfferings] = useState<CourseOffering[]>([])
  const [offeringsError, setOfferingsError] = useState(false)
  const [offeringsAttempt, setOfferingsAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [persistedByOffering, setPersistedByOffering] = useState<Record<string, CourseEvaluation[]>>({})
  const [myReviews, setMyReviews] = useState<OwnedCourseReview[] | null>(null)
  const [submittedIds, setSubmittedIds] = useState<string[]>([])
  const [myReviewsError, setMyReviewsError] = useState('')
  const [myReviewsAttempt, setMyReviewsAttempt] = useState(0)
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null)
  const [deleteReviewId, setDeleteReviewId] = useState<string | null>(null)
  const [isManagingReview, setIsManagingReview] = useState(false)
  const [eligibleOfferingIds, setEligibleOfferingIds] = useState<string[] | null>(null)
  const [eligibilityError, setEligibilityError] = useState('')
  const [currentOfferingIds, setCurrentOfferingIds] = useState<string[] | null>(null)
  const [currentOfferingsError, setCurrentOfferingsError] = useState('')
  const [currentOfferingsAttempt, setCurrentOfferingsAttempt] = useState(0)
  const [loadErrors, setLoadErrors] = useState<Record<string, boolean>>({})
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hours, setHours] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [classRating, setClassRating] = useState('')
  const [wouldRecommend, setWouldRecommend] = useState('')
  const [review, setReview] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const submissionPanelRef = useRef<HTMLElement | null>(null)

  const enrolledOfferings = currentOfferingIds === null ? [] : offerings.filter(offering => currentOfferingIds.includes(offering.id))
  const currentOfferings = enrolledOfferings
  const otherOfferings = currentOfferingIds === null ? [] : offerings.filter(offering => !currentOfferingIds.includes(offering.id))
  const catalogOnlyCourses = useMemo(() => {
    const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
    const normalizeName = (value: string) => normalize(value).replace(/^(dr\.?|prof\.?|professor)\s+/, '')
    return catalogCourses.flatMap(course => {
      const matchingOfferings = offerings.filter(offering => normalize(offering.code) === normalize(course.code))
      if (course.professors.length === 0) return matchingOfferings.length === 0 ? [catalogOnlyOffering(course)] : []
      const unmatchedProfessors = course.professors.filter(professor => !matchingOfferings.some(offering => {
        if (offering.professorFirstName && offering.professorLastName) {
          return normalizeName(offering.professorFirstName) === normalizeName(professor.firstName)
            && normalizeName(offering.professorLastName) === normalizeName(professor.lastName)
        }
        return normalizeName(offering.professor) === normalizeName(`${professor.firstName} ${professor.lastName}`)
      }))
      return unmatchedProfessors.map(professor => catalogOnlyOffering(course, professor))
    })
  }, [catalogCourses, offerings])
  const matchingOtherOfferings = [...otherOfferings, ...catalogOnlyCourses].filter(offering =>
    `${offering.code} ${offering.title} ${offering.professor}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )
  const displayedOtherOfferings = query.trim() ? matchingOtherOfferings : otherOfferings.slice(0, 5)
  const selected = offerings.find(offering => offering.id === selectedId)
    ?? catalogOnlyCourses.find(offering => offering.id === selectedId)
    ?? enrolledOfferings[0]
    ?? offerings[0]
    ?? null

  useEffect(() => {
    let active = true
    void api.loadCatalogCourses().then(data => {
      if (active) {
        setCatalogCourses(data)
        setCatalogError('')
        setCatalogLoading(false)
      }
    }).catch(error => {
      if (active) {
        setCatalogError(error instanceof Error ? error.message : 'Unable to load the course catalog. Please retry.')
        setCatalogLoading(false)
      }
    })
    return () => { active = false }
  }, [api, catalogAttempt])

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
    if ('catalogOnly' in selected && selected.catalogOnly) {
      setPersistedByOffering(current => ({ ...current, [selected.id]: [] }))
      setLoadErrors(current => ({ ...current, [selected.id]: false }))
      return
    }
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
    void api.myReviews().then(reviews => {
      if (!active) return
      setMyReviews(reviews)
      setSubmittedIds(reviews.map(item => item.offeringId))
      setMyReviewsError('')
    }).catch(error => {
      if (active) setMyReviewsError(error instanceof Error ? error.message : 'Unable to load your reviews. Please retry.')
    })
    return () => { active = false }
  }, [api, myReviewsAttempt])

  useEffect(() => {
    let active = true
    void api.myCurrentOfferingIds().then(ids => {
      if (active) {
        setCurrentOfferingIds(ids)
        setCurrentOfferingsError('')
      }
    }).catch(error => {
      if (active) setCurrentOfferingsError(error instanceof Error ? error.message : 'Unable to load your current-semester classes. Please retry.')
    })
    return () => { active = false }
  }, [api, currentOfferingsAttempt])

  useEffect(() => {
    let active = true
    void api.myVerifiedOfferingIds().then(ids => {
      if (active) {
        setEligibleOfferingIds(ids)
        setEligibilityError('')
      }
    }).catch(error => {
      if (active) setEligibilityError(error instanceof Error ? error.message : 'Unable to check your verified course enrollments. Please retry.')
    })
    return () => { active = false }
  }, [api])

  const currentEvaluations = selected ? persistedByOffering[selected.id] ?? [] : []
  const ordinaryReviews = currentEvaluations.filter(item => item.moderationStatus !== 'flagged')
  const flaggedReviews = currentEvaluations.filter(item => item.moderationStatus === 'flagged')
  const averages = summarizeEvaluations(ordinaryReviews)
  const classRatings = ordinaryReviews.map(item => item.classRating).filter((value): value is number => typeof value === 'number')
  const averageClassRating = classRatings.length ? classRatings.reduce((sum, value) => sum + value, 0) / classRatings.length : null
  const recommendationAnswers = ordinaryReviews.map(item => item.wouldRecommend).filter((value): value is boolean => typeof value === 'boolean')
  const recommendYes = recommendationAnswers.filter(Boolean).length
  const recommendNo = recommendationAnswers.length - recommendYes
  const difficultyDistribution = [1, 2, 3, 4, 5].map(value => ({
    label: String(value), count: ordinaryReviews.filter(item => item.difficulty === value).length,
  }))
  const classRatingDistribution = [1, 2, 3, 4, 5].map(value => ({
    label: String(value), count: classRatings.filter(rating => rating === value).length,
  }))
  const submittedReview = selected ? myReviews?.find(item => item.offeringId === selected.id) ?? null : null
  const alreadySubmitted = submittedReview !== null || (selected ? submittedIds.includes(selected.id) : false)
  const selectedIsCatalogOnly = selected !== null && 'catalogOnly' in selected && selected.catalogOnly
  const canReviewSelected = selected !== null && !selectedIsCatalogOnly && eligibleOfferingIds?.includes(selected.id) === true
  const loadState = selectedIsCatalogOnly ? 'catalog' : selected ? (loadErrors[selected.id] ? 'error' : Object.hasOwn(persistedByOffering, selected.id) ? 'ready' : 'loading') : 'loading'

  function selectOffering(id: string) {
    setSelectedId(id)
    setNotice('')
    setErrors({})
    setDeleteReviewId(null)
  }

  function beginEdit(reviewToEdit: OwnedCourseReview) {
    setHours(String(reviewToEdit.weeklyHours))
    setDifficulty(String(reviewToEdit.difficulty))
    setClassRating(reviewToEdit.classRating == null ? '' : String(reviewToEdit.classRating))
    setWouldRecommend(reviewToEdit.wouldRecommend == null ? '' : reviewToEdit.wouldRecommend ? 'yes' : 'no')
    setReview(reviewToEdit.review)
    setEditingReviewId(reviewToEdit.id)
    setDeleteReviewId(null)
    setErrors({})
    setNotice('')
  }

  function cancelEdit() {
    setEditingReviewId(null)
    setHours('')
    setDifficulty('')
    setClassRating('')
    setWouldRecommend('')
    setReview('')
    setErrors({})
    setNotice('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const editing = editingReviewId !== null
    if (!editing && !canReviewSelected) {
      setNotice('A verified enrollment in this exact offering is required to publish a review.')
      return
    }
    if ((!editing && alreadySubmitted) || isSubmitting) {
      setNotice('You can publish only one review for this offering.')
      return
    }
    const nextErrors: Record<string, string> = {}
    const parsedHours = Number(hours)
    const parsedDifficulty = Number(difficulty)
    const parsedClassRating = Number(classRating)
    if (hours.trim() === '' || !Number.isFinite(parsedHours) || parsedHours < 0 || parsedHours > 40) nextErrors.hours = 'Enter weekly hours from 0 to 40.'
    if (difficulty.trim() === '' || !Number.isInteger(parsedDifficulty) || parsedDifficulty < 1 || parsedDifficulty > 5) nextErrors.difficulty = 'Choose a whole-number rating from 1 to 5.'
    if (classRating.trim() === '' || !Number.isInteger(parsedClassRating) || parsedClassRating < 1 || parsedClassRating > 5) nextErrors.classRating = 'Choose a whole-number class rating from 1 to 5.'
    if (wouldRecommend !== 'yes' && wouldRecommend !== 'no') nextErrors.wouldRecommend = 'Choose yes or no.'
    if (review.length > 1000) nextErrors.review = 'Review must be 1,000 characters or fewer.'
    setErrors(nextErrors)
    setNotice('')
    if (Object.keys(nextErrors).length) return

    setIsSubmitting(true)
    const input = { weeklyHours: parsedHours, difficulty: parsedDifficulty, classRating: parsedClassRating, wouldRecommend: wouldRecommend === 'yes', review: review.trim() }
    try {
      if (editing && editingReviewId) {
        const result = await api.updateReview(editingReviewId, input)
        const updated = result.review
        setMyReviews(current => current?.map(item => item.id === updated.id ? updated : item) ?? [updated])
        setPersistedByOffering(current => ({ ...current, [selected.id]: (current[selected.id] ?? []).map(item => item.id === updated.id ? updated : item) }))
        setEditingReviewId(null)
        setNotice(result.moderationStatus === 'flagged' ? 'Your edit was saved in the flagged section.' : 'Your review was updated.')
      } else {
        const saved = await api.submit(selected.id, input)
        setPersistedByOffering(current => ({ ...current, [selected.id]: saved.reviews }))
        setSubmittedIds(current => [...new Set([...current, selected.id])])
        setNotice(saved.moderationStatus === 'flagged'
          ? 'Your review was saved in the flagged section for readers to review.'
          : 'Your anonymous review is saved and published for this offering.')
      }
      setHours('')
      setDifficulty('')
      setClassRating('')
      setWouldRecommend('')
      setReview('')
      setErrors({})
      void api.loadOffering(selected.id).then(rows => setPersistedByOffering(current => ({ ...current, [selected.id]: rows }))).catch(() => setLoadErrors(current => ({ ...current, [selected.id]: true })))
      void api.myReviews().then(rows => { setMyReviews(rows); setSubmittedIds(rows.map(item => item.offeringId)) }).catch(() => setMyReviewsAttempt(value => value + 1))
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

  async function deleteOwnReview() {
    if (!submittedReview || deleteReviewId !== submittedReview.id || isManagingReview) return
    const removed = submittedReview
    setIsManagingReview(true)
    setNotice('')
    try {
      await api.deleteReview(removed.id)
      setMyReviews(current => current?.filter(item => item.id !== removed.id) ?? [])
      setSubmittedIds(current => current.filter(id => id !== removed.offeringId))
      setPersistedByOffering(current => ({ ...current, [removed.offeringId]: (current[removed.offeringId] ?? []).filter(item => item.id !== removed.id) }))
      setDeleteReviewId(null)
      setEditingReviewId(null)
      setNotice('Review deleted. You can submit another review.')
      void api.loadOffering(removed.offeringId).then(rows => setPersistedByOffering(current => ({ ...current, [removed.offeringId]: rows }))).catch(() => setLoadErrors(current => ({ ...current, [removed.offeringId]: true })))
      void api.myReviews().then(rows => { setMyReviews(rows); setSubmittedIds(rows.map(item => item.offeringId)) }).catch(() => setMyReviewsAttempt(value => value + 1))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Your review could not be deleted. Please retry.')
    } finally {
      setIsManagingReview(false)
    }
  }

  return <section className="evaluation-view" aria-labelledby="evaluation-heading">
    <div className="evaluation-intro"><div className="evaluation-intro-copy"><p className="eyebrow">COURSE EXPERIENCES</p><h1 id="evaluation-heading">Compare course offerings.</h1><p>Browse anonymous course reviews and share one review per offering.</p></div>{(canReviewSelected || submittedReview) && <button className="go-to-review-button" type="button" onClick={() => submissionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Go to your review</button>}</div>
    <div className="evaluation-layout">
      <section className="panel offering-panel" aria-labelledby="offerings-heading">
        <h2 id="offerings-heading">Published offerings</h2>
        {offeringsError && <div className="error" role="alert"><p>Course offerings could not be loaded.</p><button type="button" onClick={() => setOfferingsAttempt(value => value + 1)}>Retry offerings</button></div>}
        {!offeringsError && offerings.length === 0 && <p className="muted" role="status">{offeringsAttempt === 0 ? 'Loading published offerings…' : 'No catalog-verified offerings are available yet.'}</p>}
        <div className="offering-tabs" role="tablist" aria-label="Course offering lists">
          <button id="current-offerings-tab" type="button" role="tab" aria-selected={activeOfferingTab === 'current'} aria-controls="current-offerings-panel" onClick={() => setActiveOfferingTab('current')}>Your current offerings</button>
          <button id="your-reviews-tab" type="button" role="tab" aria-selected={activeOfferingTab === 'reviews'} aria-controls="your-reviews-panel" onClick={() => setActiveOfferingTab('reviews')}>Your reviews</button>
          <button id="search-other-tab" type="button" role="tab" aria-selected={activeOfferingTab === 'search'} aria-controls="search-other-panel" onClick={() => setActiveOfferingTab('search')}>Search other</button>
        </div>
        {activeOfferingTab === 'current' && <div id="current-offerings-panel" className="offering-tab-panel" role="tabpanel" aria-labelledby="current-offerings-tab">
          {currentOfferingIds === null && !currentOfferingsError && <p className="muted" role="status">Loading your current classes…</p>}
          {currentOfferingsError && <div className="error" role="alert"><p>{currentOfferingsError}</p><button type="button" onClick={() => setCurrentOfferingsAttempt(value => value + 1)}>Retry current classes</button></div>}
          {currentOfferings.length > 0 ? <ul className="offering-list" aria-label="Your current course offerings">{currentOfferings.map(offering => <li key={offering.id}><button type="button" className="offering-button" aria-pressed={selected?.id === offering.id} onClick={() => selectOffering(offering.id)}><strong>{offering.code}: {offering.title}</strong><span>{offering.professor}{offering.section ? ` · Section ${offering.section}` : ''}</span><span>{offering.semester} {offering.year}</span></button></li>)}</ul> : currentOfferingIds !== null && !currentOfferingsError && <p className="muted" role="status">No current-semester enrollments have a published offering yet.</p>}
        </div>}
        {activeOfferingTab === 'reviews' && <div id="your-reviews-panel" className="offering-tab-panel" role="tabpanel" aria-labelledby="your-reviews-tab">
          {myReviewsError && <div className="error" role="alert"><p>{myReviewsError}</p><button type="button" onClick={() => setMyReviewsAttempt(value => value + 1)}>Retry your reviews</button></div>}
          {myReviews === null && !myReviewsError && <p className="muted" role="status">Loading your reviews…</p>}
          {myReviews?.length === 0 && <p className="muted">You haven’t written any reviews yet.</p>}
          {myReviews && myReviews.length > 0 && <ul className="offering-list" aria-label="Your submitted reviews">{myReviews.map(item => {
            const offering = offerings.find(candidate => candidate.id === item.offeringId)
            return <li key={item.id}><button type="button" className="offering-button" aria-pressed={selected?.id === item.offeringId} disabled={Boolean(editingReviewId || isManagingReview)} onClick={() => selectOffering(item.offeringId)}><strong>{offering ? `${offering.code}: ${offering.title}` : 'Past course offering'}</strong><span>{offering ? `${offering.professor}${offering.section ? ` · Section ${offering.section}` : ''}` : 'Offering details unavailable'}</span><span>{offering ? `${offering.semester} ${offering.year}` : item.createdAt.slice(0, 10)}</span></button></li>
          })}</ul>}
        </div>}
        {activeOfferingTab === 'search' && <div id="search-other-panel" className="offering-tab-panel" role="tabpanel" aria-labelledby="search-other-tab">
          <label htmlFor="offering-search">Search published offerings</label>
          <input id="offering-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. CSE 416" />
          {!query.trim() && otherOfferings.length > 5 && <p className="field-help">Showing 5 verified offerings. Search to find more courses.</p>}
          {!query.trim() && otherOfferings.length <= 5 && catalogCourses.length > 0 && <p className="field-help">Search the catalog to find other courses.</p>}
          {catalogError && <div className="error" role="alert"><p>{catalogError}</p><button type="button" onClick={() => { setCatalogLoading(true); setCatalogAttempt(value => value + 1) }}>Retry course catalog</button></div>}
          {catalogLoading && <p className="muted" role="status">Loading the course catalog…</p>}
          {currentOfferingIds === null && !currentOfferingsError && <p className="muted" role="status">Loading your current classes…</p>}
          {currentOfferingsError && <div className="error" role="alert"><p>{currentOfferingsError}</p><button type="button" onClick={() => setCurrentOfferingsAttempt(value => value + 1)}>Retry current classes</button></div>}
          {!catalogLoading && !catalogError && displayedOtherOfferings.length > 0 && <ul className="offering-list" aria-label="Other published offerings">{displayedOtherOfferings.map(offering => <li key={offering.id}><button type="button" className="offering-button" aria-pressed={selected?.id === offering.id} onClick={() => selectOffering(offering.id)}><strong>{offering.code}: {offering.title}</strong>{'catalogOnly' in offering && offering.catalogOnly ? <>{offering.professor && <span>{offering.professor}</span>}<span>Fall 2026</span></> : <><span>{offering.professor}{offering.section ? ` · Section ${offering.section}` : ''}</span><span>{offering.semester} {offering.year}</span></>}</button></li>)}</ul>}
          {!catalogLoading && !catalogError && currentOfferingIds !== null && !currentOfferingsError && displayedOtherOfferings.length === 0 && <div className="empty-state search-empty" role="status"><h3>{query.trim() ? 'No matching courses' : 'No verified offerings to show'}</h3><p>{query.trim() ? 'Try a different course code or title.' : 'Search the catalog to find courses without a verified offering yet.'}</p></div>}
        </div>}
      </section>

      <div className="evaluation-content" aria-live="polite">
        <section className="panel summary-panel" aria-labelledby="selected-offering-heading">
          {!selected ? <><p className="eyebrow">SELECTED OFFERING</p><h2 id="selected-offering-heading">Select a course offering</h2><p className="muted">Verified offerings will appear here once available.</p></> : <>
          <p className="eyebrow">SELECTED OFFERING</p><h2 id="selected-offering-heading">{selected.code}: {selected.title}</h2>
          {selectedIsCatalogOnly ? <><p className="muted">{selected.professor && `${selected.professor} · `}Fall 2026</p><p className="muted">This course is in the catalog, but no verified section offering is available yet.</p></> : <p className="muted">{selected.professor}{selected.section ? ` · Section ${selected.section}` : ''} · {selected.semester} {selected.year}</p>}
          {loadState === 'loading' && <p role="status">Loading course reviews…</p>}
          {loadState === 'error' && <div className="error" role="alert"><p>Saved course reviews could not be loaded.</p><button type="button" onClick={() => setLoadAttempt(value => value + 1)}>Retry reviews</button></div>}
          {averages ? <div className="evaluation-stats"><div><strong>{averages.hours.toFixed(1)}</strong><span>average hours / week</span></div><div><strong>{averages.difficulty.toFixed(1)} / 5</strong><span>average difficulty</span></div>{averageClassRating !== null && <div><strong>{averageClassRating.toFixed(1)} / 5</strong><span>average class rating</span></div>}<div><strong>{ordinaryReviews.length}</strong><span>{ordinaryReviews.length === 1 ? 'review' : 'reviews'}</span></div></div> : loadState === 'catalog' ? <div className="empty-state no-reviews" role="status"><h3>No verified offering yet</h3><p>You can browse this catalog course here. Reviews become available when a professor and section offering is verified.</p></div> : loadState === 'ready' && flaggedReviews.length === 0 ? <div className="empty-state no-reviews" role="status"><h3>No evaluations yet</h3><p>Be the first to share an anonymous review for this offering.</p></div> : null}
          {ordinaryReviews.length > 0 && <div className="review-chart-grid">
            <ReviewBarChart title="Would you recommend this class?" id="recommendation-chart-heading" rows={[{ label: 'Yes', count: recommendYes, tone: 'yes' }, { label: 'No', count: recommendNo, tone: 'no' }]} />
            <ReviewBarChart title="Difficulty rating (out of 5)" id="difficulty-chart-heading" rows={difficultyDistribution} />
            <ReviewBarChart title="Class rating (out of 5)" id="class-rating-chart-heading" rows={classRatingDistribution} />
          </div>}
          {(currentEvaluations.length > 0 || loadState === 'ready') && <>
            <h3 className="review-heading">Anonymous reviews</h3>
            {ordinaryReviews.length ? <ul className="review-list">{ordinaryReviews.map(item => <li key={item.id}><p>{item.review || 'No written comment provided.'}</p><span>{item.weeklyHours} hours/week · Difficulty {item.difficulty}/5{item.classRating == null ? '' : ` · Class rating ${item.classRating}/5`}{item.wouldRecommend == null ? '' : ` · Would recommend: ${item.wouldRecommend ? 'Yes' : 'No'}`}</span></li>)}</ul> : <p className="muted review-empty-note">No appropriate reviews to display yet.</p>}
            {flaggedReviews.length > 0 && <details className="flagged-reviews"><summary>Flagged reviews ({flaggedReviews.length})</summary><p className="field-help">These reviews may contain personal or otherwise inappropriate content. Use your judgment when reading them.</p><ul className="review-list">{flaggedReviews.map(item => <li key={item.id}><p>{item.review || 'No written comment provided.'}</p><span>{item.weeklyHours} hours/week · Difficulty {item.difficulty}/5{item.classRating == null ? '' : ` · Class rating ${item.classRating}/5`}{item.wouldRecommend == null ? '' : ` · Would recommend: ${item.wouldRecommend ? 'Yes' : 'No'}`}</span></li>)}</ul></details>}
          </>}
          </>}
        </section>

        {selected && (submittedReview || (eligibleOfferingIds !== null && !eligibilityError && canReviewSelected)) && <section ref={submissionPanelRef} className="panel submission-panel" aria-labelledby="submission-heading">
          <p className="eyebrow">YOUR EXPERIENCE</p><h2 id="submission-heading">{editingReviewId ? 'Edit your review' : submittedReview ? 'Your review' : 'Write an anonymous review'}</h2>
          {submittedReview && !editingReviewId ? <>
            <p className="submitted-note" role="status">You’ve already published a review for this offering.</p>
            <ul className="review-list" aria-label="Your published anonymous review"><li className="own-review-card">
              <div className="own-review-content">
                <p>{submittedReview.review || 'No written comment provided.'}</p>
                <span>{submittedReview.weeklyHours} hours/week · Difficulty {submittedReview.difficulty}/5{submittedReview.classRating == null ? '' : ` · Class rating ${submittedReview.classRating}/5`}{submittedReview.wouldRecommend == null ? '' : ` · Would recommend: ${submittedReview.wouldRecommend ? 'Yes' : 'No'}`}</span>
              </div>
              <div className="own-review-actions">
                <button className="review-icon-button" type="button" aria-label="Edit review" title="Edit review" onClick={() => beginEdit(submittedReview)} disabled={isManagingReview}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                </button>
                <button className="review-icon-button delete-review-icon" type="button" aria-label="Delete review" title="Delete review" onClick={() => setDeleteReviewId(submittedReview.id)} disabled={isManagingReview}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
                </button>
              </div>
            </li></ul>
            {deleteReviewId === submittedReview.id && <div className="review-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !isManagingReview) setDeleteReviewId(null) }}>
              <section className="review-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-review-heading" aria-describedby="delete-review-description" onKeyDown={event => { if (event.key === 'Escape' && !isManagingReview) setDeleteReviewId(null) }}>
                <h3 id="delete-review-heading">Delete this review?</h3>
                <p id="delete-review-description">This will permanently delete your review and remove it from the course.</p>
                <div className="review-modal-actions">
                  <button type="button" onClick={() => setDeleteReviewId(null)} disabled={isManagingReview} autoFocus>Cancel</button>
                  <button className="danger-button" type="button" onClick={() => void deleteOwnReview()} disabled={isManagingReview}>{isManagingReview ? 'Deleting…' : 'Confirm deletion'}</button>
                </div>
              </section>
            </div>}
          </> : <form onSubmit={submit} noValidate>
            {!editingReviewId && <><label htmlFor="review-offering">Course offering</label><select id="review-offering" value={selected.id} onChange={event => selectOffering(event.target.value)}>{offerings.map(offering => <option key={offering.id} value={offering.id}>{offering.code} · {offering.professor}{offering.section ? ` · Section ${offering.section}` : ''} · {offering.semester} {offering.year}</option>)}</select></>}
            <label htmlFor="review-hours">Weekly hours</label><input id="review-hours" type="number" min="0" max="40" step="any" value={hours} onChange={event => setHours(event.target.value)} aria-invalid={Boolean(errors.hours)} aria-describedby={errors.hours ? 'hours-error' : 'hours-help'} />
            {errors.hours ? <p id="hours-error" className="error">{errors.hours}</p> : <p id="hours-help" className="field-help">Enter a value from 0 to 40.</p>}
            <label htmlFor="review-difficulty">Difficulty</label><select id="review-difficulty" value={difficulty} onChange={event => setDifficulty(event.target.value)} aria-invalid={Boolean(errors.difficulty)} aria-describedby={errors.difficulty ? 'difficulty-error' : undefined}><option value="">Select a rating</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} — {['', 'Very easy', 'Easy', 'Moderate', 'Hard', 'Very hard'][value]}</option>)}</select>
            {errors.difficulty && <p id="difficulty-error" className="error">{errors.difficulty}</p>}
            <label htmlFor="review-class-rating">Class rating</label><select id="review-class-rating" value={classRating} onChange={event => setClassRating(event.target.value)} aria-invalid={Boolean(errors.classRating)} aria-describedby={errors.classRating ? 'class-rating-error' : undefined}><option value="">Select a rating</option><option value="1">1 — Strongly disliked it</option><option value="2">2 — Didn’t like it</option><option value="3">3 — It was okay</option><option value="4">4 — Really liked it</option><option value="5">5 — Loved it!</option></select>
            {errors.classRating && <p id="class-rating-error" className="error">{errors.classRating}</p>}
            <fieldset className="review-take-again"><legend>Would you recommend this class?</legend><label><input type="radio" name="review-recommend" value="yes" checked={wouldRecommend === 'yes'} onChange={event => setWouldRecommend(event.target.value)} /> Yes</label><label><input type="radio" name="review-recommend" value="no" checked={wouldRecommend === 'no'} onChange={event => setWouldRecommend(event.target.value)} /> No</label></fieldset>
            {errors.wouldRecommend && <p className="error">{errors.wouldRecommend}</p>}
            <label htmlFor="review-text">Written review</label><textarea id="review-text" rows={5} maxLength={1000} value={review} onChange={event => setReview(event.target.value)} aria-invalid={Boolean(errors.review)} aria-describedby={errors.review ? 'review-error' : 'review-count'} />
            {errors.review ? <p id="review-error" className="error">{errors.review}</p> : <p id="review-count" className="field-help">{review.length}/1,000 characters. Written review is optional.</p>}
            <button className="primary publish-button" type="submit" disabled={isSubmitting}>{isSubmitting ? (editingReviewId ? 'Saving…' : 'Publishing…') : (editingReviewId ? 'Save changes' : 'Publish review')}</button>{editingReviewId && <> <button type="button" onClick={cancelEdit} disabled={isSubmitting}>Cancel editing</button></>}
          </form>}
          {notice && <p className="submission-notice" role="status">{notice}</p>}
          <p className="session-note">New reviews are saved to the course offering. Reviewer identity is never shown.</p>
        </section>}
      </div>
    </div>
  </section>
}
