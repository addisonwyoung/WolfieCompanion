# Proposal

## Why

Students can already save courses, but cannot keep private coursework deadlines and assessment dates alongside them. A course-linked agenda will help authenticated students plan work and recognize approaching or overdue dates.

## What Changes

- Add an authenticated Assignments & Exams navigation view with an all-courses agenda, saved-course and type filters, and overdue/today/upcoming indicators as in-app reminders.
- Allow students to add, view, edit, complete, and reopen assignments, exams, quizzes, and projects.
- Allow deletion of individual pending or completed items only after explicit confirmation; cancellation leaves data unchanged and deleting an item does not delete its course.
- Keep the editor focused on course, title, type, due date and optional time, optional notes, optional location, and completion status. Do not include a section field.
- Persist items in one private Supabase `academic_items` table linked to `user_courses` by the actual database UUID. Preserve that UUID separately from the existing code-derived UI course identifier in both course-loading and course-saving adapters.
- Enforce eligible-student ownership and ownership of the associated course through RLS and database constraints. Do not expose items to classmates.
- Prevent deletion of a saved course while academic items reference it; never cascade course removal into silent item deletion.
- Defer email notifications, scheduled delivery, calendar integration, recurrence, semester management, and course-removal UI.
- Keep date-only items due throughout their calendar date and overdue only starting the following campus day; never default an unspecified time to midnight.
- Prioritize the complete persistent workflow over UI polish. Plan a Supabase SQL migration for future implementation, with manual user review and application; this planning phase generates no migration and makes no hosted database changes.

## Capabilities

### New Capabilities

- `academic-items`: Private course-linked academic planning, persistent editing and completion, an accessible agenda with in-app date indicators, and protection against data loss on course removal.

### Modified Capabilities

None. Existing dashboard behavior remains available; the new authenticated view is additive. Preserving a separate database UUID is an adapter change supporting the new capability, not a change to existing course selection semantics.

## Impact

- Client: `App.tsx`, authenticated course types and `account.ts` adapters, a new academic-items API/state layer and agenda/editor, and existing shared styling conventions.
- Supabase: a versioned migration for one table, constraints, indexes, timestamps, and owner/course-owner RLS, with isolated SQL tests.
- Existing course selection and save/import workflows must retain their code-derived identifiers and section behavior; sections are excluded only from academic items.
- Depends on the existing accounts/enrollments schema. Existing memberships lack term information, so this change does not claim term-specific enrollment.
- Adds client lifecycle, accessibility, date-boundary, and database authorization coverage. No Resend dependency or delivery infrastructure is needed.
