# Proposal

## Why

Course evaluations currently live only in React session state, so student reviews disappear on reload and are not shared across accounts. Persisting reviews through the existing Supabase project will make evaluations available across sessions while retaining anonymous student-facing content and database-enforced ownership.

## What Changes

- Add an authoritative `course_offerings` catalog containing the existing offering IDs plus course code/title, professor, semester, and academic year. Its ID identifies one exact offering.
- Add `course_reviews` with exactly seven columns: generated UUID `id`, FK `offering_id`, session-derived `user_id`, `weekly_hours`, individual `difficulty`, `review`, and generated `created_at`. Offering metadata is not duplicated in review rows.
- Enforce one review per authenticated student and offering with a unique `(user_id, offering_id)` constraint; different offering IDs remain distinct.
- Load offering metadata from the catalog and review content through an anonymous allowlisted projection. Calculate averages from individual ratings.
- Preserve all existing Supabase tables, columns, policies, authentication, account, profile, and enrollment behavior. Keep the versioned SQL migration additive.
- Create or update the migration file for owner review only. Do not execute or apply SQL to Supabase; the project owner will review and run it manually in the SQL Editor.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `course-evaluations`: Persist reviews by authoritative offering ID with student ownership, anonymous reads, and per-offering uniqueness.

## Impact

- `client/src/CourseEvaluations.tsx`, `client/src/courseReviews.ts`, and related types/tests.
- A versioned migration defining `course_offerings`, `course_reviews`, access controls, and the anonymous projection.
- Existing account and enrollment schema remains unchanged; no migration is executed by this implementation.
