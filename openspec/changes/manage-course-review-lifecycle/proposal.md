# Proposal

## Why

Students currently cannot change or remove a review after publishing it, even when their experience or original feedback changes. Letting each author manage their own reviews keeps course feedback accurate and lets a student submit a replacement after deleting an earlier review.

## What Changes

- Let an authenticated author view, edit, and delete their review for any offering they previously reviewed, including past terms.
- Keep public reviews anonymous and enforce ownership in the Render backend for every read or mutation of a student's own review.
- Re-moderate edited text before saving; preserve the review and draft if moderation or persistence fails.
- After a successful edit or deletion, refresh the offering's reviews and recalculate average difficulty, average weekly hours, average class rating, recommendation results, and review counts from the current rows.
- After deletion, allow a new review for the same offering, subject to the existing eligibility and validation rules.
- Keep review updates and deletes behind the existing authenticated Render API and server-only Supabase service role; the existing schema already stores ownership and review fields, and authenticated clients lack direct update/delete grants.
- Deploy the backward-compatible Render API before the Vercel frontend that calls it. No database migration or deployment is performed as part of this planning change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `course-evaluations`: Review authors can manage existing reviews for past or current offerings; edits and deletions update published summaries, and deleting a review permits resubmission.

## Impact

- Client review UI and API: `client/src/CourseEvaluations.tsx`, `client/src/courseReviews.ts`, and related tests.
- Render Express API: `server/src/courseReviewModeration.ts` and its tests.
- Supabase: existing `course_reviews` ownership, primary key, uniqueness, RLS, and column grants; no schema change is expected.
- Release coordination: deploy the Render backend first, then deploy the Vercel frontend.
