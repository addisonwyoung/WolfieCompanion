# Proposal

## Why

The dashboard shows which classmates share a selected course, but it does not help students find peers with similar academic and personal interests. Course-specific recommendations can make existing course connections more useful while respecting each student's profile-sharing choices.

## What Changes

- Add a recommendation section for the currently selected course, using saved course enrollment and section records to find eligible peers.
- Rank each eligible peer using same major (30 points), shared interests (8 points per unique match, capped at 40), same academic year (15 points), and same residence status (15 points).
- Keep the score on a fixed 100-point scale. Private or unavailable factors earn no points and do not reduce the denominator.
- Display a similarity score and useful profile details only when those details are public under the existing profile-sharing choices. Keep one recommendation per student per selected course and exclude the signed-in student.
- Provide separate selectable Classmates and People you may connect with views for the selected course so only the chosen list is shown at a time.
- Introduce a separate course-classmate-recommendations capability. Keep the existing classmate-discovery requirements unchanged.

## Capabilities

### New Capabilities
- `course-classmate-recommendations`: Recommend and rank eligible peers enrolled in a selected course using only profile fields they have chosen to share.

### Modified Capabilities

## Impact

- `client/src/CourseBrowser.tsx`, `client/src/App.css`, and recommendation loading/ranking logic in the client.
- A dedicated authenticated, course-scoped data projection is needed because clients cannot directly read other students' profiles or enrollment rows. It must reuse existing eligibility, course membership, name/major visibility, and optional profile-sharing checks without changing the `classmate-discovery` API contract or requirements.
- Profile inputs reuse the existing major, interests, year, residence, and `share_*` fields. The current user’s private fields are excluded from comparison too.
- Cross-capability integration: recommendations sit alongside existing classmate discovery and reuse its course and eligibility boundary; its roster and limited name/major projection remain unchanged.
- A SQL change will need owner review and manual application. Add the migration under `supabase/migrations/` for review; do not execute or apply it to a database during implementation.
