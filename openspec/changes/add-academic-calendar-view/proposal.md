# Proposal

## Why

Students can save academic deadlines but currently see them only as agenda rows. A calendar makes busy dates and overlapping deadlines easier to see, with a direct route from a dated item to the existing editor.

## What Changes

- Add Agenda and Calendar tabs inside Assignments & Exams; preserve Agenda as the default and its current completion, editing, and deletion workflow.
- Show the signed-in student's saved assignments, exams, quizzes, and projects on their due dates in a navigable month calendar with Previous month, Next month, and Today controls.
- Default Calendar to all completion states, visibly distinguish completed work, and allow All/Pending/Completed filtering. Share course/type filters between tabs while retaining Agenda's existing Pending/Completed selection separately.
- Activate a calendar item to open the existing populated Edit modal. Confirmed saves update both views, including moving an item to its new due date; cancellation and failed saves preserve saved calendar entries.
- Preserve private ownership, campus date/time semantics, keyboard accessibility, mobile usability, and account teardown protections.

## Capabilities

### New Capabilities

- `academic-calendar`: Private monthly deadline calendar, navigation, filtering, accessible dated entries, and direct editing synchronized with the agenda.

### Modified Capabilities

- `academic-agenda-interface`: Scope existing rows to the Agenda tab and extend editor return-focus behavior to Calendar item triggers and calendar fallbacks.

## Impact

- Client: `AcademicPlanner.tsx`, new calendar rendering/date helpers, existing dialog and focus integration, and `App.css`.
- Reuse `academicItems.ts`, `useAcademicItems.ts`, and `AcademicItemDialog.tsx`; no new persistence, backend endpoints, database migration, or secrets are needed.
- Extend planner/date tests, native Chrome fixtures/checks, and `docs/academic-items.md`.
- Based on current `main` at `13c780e`, matching `origin/main`; proposal branch is `codex/academic-calendar-view`.
