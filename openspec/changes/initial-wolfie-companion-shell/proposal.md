# Proposal

## Why

The frontend currently displays the default Vite starter rather than Wolfie Companion. An interactive sample profile and course-based classmate view will provide an initial demonstrable application shell aligned with the student connection vision.

## What Changes

- Replace the starter screen and browser title with a responsive Wolfie Companion dashboard clearly identified as a sample-data prototype.
- Display one fictional student profile with editable major, interests, and year of study, including Save and Cancel actions.
- Display the student's fixed sample courses: CSE 416, CSE 310, AMS 210, and AMS 261.
- Allow selecting each course to view fictional classmates enrolled in that course, including their names and profile summaries.
- Use bundled sample data and client-side state for this initial shell; profile edits last for the current page session and reset on reload.
- Keep authentication, backend/database integration, course editing/import, messaging, recommendations, and study groups outside this change.

## Capabilities

### New Capabilities

- `prototype-dashboard`: Branded application shell, editable sample profile, fixed sample courses, and course-filtered sample classmates.

### Modified Capabilities

None. The project currently has no main specs.

## Impact

The change affects the React frontend in `client/src/App.tsx`, application/global styles, document metadata in `client/index.html`, and new small frontend components and sample-data modules as needed. Existing React and TypeScript dependencies are sufficient. The Express health endpoint, server code, database setup, and CI workflow are not part of this change. Implementation verification uses existing client lint/build commands and browser interaction checks.
