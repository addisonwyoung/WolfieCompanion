# Proposal

## Why

Wolfie Companion's existing course dashboard helps students find classmates, but it does not yet let them compare experiences for a particular course offering. A sample-data evaluation workflow will make course decisions tangible in the prototype while keeping authentication, enrollment verification, moderation, and persistence outside this initial change.

## What Changes

- Add a course-evaluation view where students can search the five sample course offerings and browse only published evaluations.
- Represent each offering by course code, professor, semester, and four-digit year, including two distinct CSE 416 offerings from different semesters and professors.
- Show offering-level average weekly hours, average difficulty, and anonymous written reviews.
- Add an evaluation form that targets an existing offering and collects hours, difficulty, and a written review.
- Publish a submitted review immediately in the current React session and include it in that offering's aggregates.
- Allow a session to publish at most one review for each specific offering while leaving reading unrestricted.
- Keep all evaluation and submission state in React memory; reloads restore the sample data and remove session submissions.
- Define empty search, no-evaluation, validation, and duplicate-submission states.

## Capabilities

### New Capabilities

- `course-evaluations`: Search course offerings, view published anonymous evaluations and offering-level aggregates, and submit one in-session review per offering.

### Modified Capabilities

<!-- No existing capability requirements change. -->

## Impact

- React application navigation, course data, evaluation components, form validation, and session state.
- Sample data only; no backend API, authentication provider, database, or persistent storage is introduced.
- Existing course/classmate and study-space prototype views remain available.

