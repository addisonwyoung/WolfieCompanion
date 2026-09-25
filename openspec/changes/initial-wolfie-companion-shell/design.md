# Design

## Context

See proposal.md for motivation and specs/prototype-dashboard/spec.md for behavior. The client currently has a Vite starter App.tsx, starter-specific App.css/index.css, and a generic document title. React and TypeScript are already installed; there is no router, component library, or test runner. The Express service only exposes a health endpoint. Design is included to settle prototype state ownership, form behavior, and sample enrollment modeling before implementation.

## Goals / Non-Goals

**Goals:** Keep the first screen easy to run using the existing client tooling; isolate sample data from rendering; make profile editing predictable; allow a later API-backed implementation without conflating profiles and enrollments.

**Non-Goals:** Introduce routing, global state libraries, external services, authentication, persistent storage, real university enrollment claims, or a general recommendation algorithm. This change does not attempt to satisfy the entire M2 milestone.

## Decisions

### Single-page React composition

App owns the saved profile and selected course. Small components render the profile/editor, course list, and classmates section; typed fixture data lives separately under client/src. No router or global store is needed for a single screen. A monolithic component is initially simpler but makes form state and roster selection harder to follow.

### Typed fictional fixtures and stable course identifiers

Represent courses with stable IDs and display codes, and students with IDs, name, major, year, interests, and course IDs. Use the four requested codes without inventing official course titles, sections, meeting times, or a term. Seed multiple classmates per course, some overlapping memberships, and different rosters. Filter by the selected course ID, exclude the sample user's ID, and derive counts from the filtered list. This avoids independent lists and counts drifting apart. Keep data local rather than introducing API/database work for a sample-only screen.

### Explicit edit lifecycle with session-only state

Entering edit mode copies saved profile values into a draft. Save validates a trimmed nonblank major and a supported year, splits comma-separated interests, trims them, drops empty entries, and commits the draft. Cancel discards the draft. Seed the profile with Computer Science, Third year, and a few fictional interests. These defaults and fictional names are minor demo assumptions. Use an inline form so no modal focus trap is needed.

Profile state lasts until page reload; show a short note explaining this. Browser storage and backend persistence are deferred because persistence was not requested for this initial sample screen. Switching courses must not remount or reset saved profile state.

### Cohesive responsive shell

Use a red accent, neutral surfaces, clear headings, and a compact branded header with a demo badge. Arrange the profile beside the course/classmate content on desktop and stack sections on mobile. Use initial avatars rather than remote photos. Native buttons with selected-state semantics and labeled native fields support keyboard access. Avoid inactive links to features outside this change. Replace starter styles and document branding rather than layering the dashboard onto starter layout constraints. Existing CSS is sufficient; no UI dependency is necessary.

## Risks / Trade-offs

- Demo profiles could be mistaken for real students -> Label the screen and fixtures as fictional sample data; avoid verified badges or real contact information.
- Profile edits disappear on reload -> Explain this in the profile area and verify the reset behavior explicitly.
- Fixture rosters can conceal filtering bugs -> Use differing memberships and verify all four selections, exclusion of the current user, and empty results using a temporary development fixture.
- A polished frontend does not establish backend integration -> Document this as a frontend prototype and leave server integration to a separate change.

## Migration Plan

Replace the client entry screen, styles, and metadata through the normal frontend build. No data migration, environment variables, or server deployment is required. Verify client lint/build and browser interactions at desktop and mobile widths. Rollback is a revert of the frontend change; no persisted data is affected.
