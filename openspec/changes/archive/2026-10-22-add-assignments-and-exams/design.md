# Design

## Context

See proposal.md for motivation and specs/academic-items/spec.md for the behavior contract. The React/TypeScript app uses local navigation state inside an eligible-student Supabase workspace. `account.ts` currently selects database course IDs but replaces them with code-derived UI IDs in both load and save paths. `user_courses` has UUID identity, owner, normalized course code, and no semester. Sections are separate enrollment data. Shared CSS provides rounded panels, burgundy actions, visible focus, and mobile stacking. Resend is mentioned in documentation but no reminder delivery implementation exists.

## Goals / Non-Goals

**Goals:** Preserve existing UI identifiers while enabling durable UUID associations; enforce private ownership in the database; provide an isolated, accessible planner with consistent date semantics and safe asynchronous state.

Prioritize the complete persistent workflow: load saved courses, create an item, reload it, edit it, complete it, and reopen it. Use existing controls and shared CSS with only the changes necessary for usability and accessibility. Custom visual treatments, animation, and further UI polish are deferred until that workflow and its authorization checks pass.

**Non-Goals:** Section association on items, changes to saved enrollment sections, new course deletion UI, semester history, recurrence, shared deadlines, automatic syllabus extraction, calendar sync, or notification delivery infrastructure.

## Decisions

### One private table and durable course reference

Add `academic_items` with UUID `id`, immutable `user_id`, `user_course_id`, `title`, `type`, `due_date` (date), nullable `due_time` (time without time zone), nullable `notes`, nullable `location`, nullable `completed_at` (timestamptz), and creation/update timestamps. The completion checkbox maps to `completed_at`; do not maintain a conflicting boolean. Use the lengths and four type values specified in the spec, validating in both UI and SQL. Blank optional strings normalize to null. No section column or selector is added. Index by owner/date/time and course reference for agenda queries and deletion checks.

Add `databaseId` to authenticated saved-course data, keeping `id` as the existing UI course ID. Prefer a distinct authenticated course type with a required UUID over making demo fixtures pretend to have database identity. Preserve UUIDs from the table response and the existing `save_enrollments` RPC response. Do not derive UUIDs from codes or submit the UI ID as a foreign key. No replacement enrollment RPC is needed.

An alternative code-based relationship would conflate display identity with storage identity; a separate table for each item type would duplicate authorization and editor behavior.

### RLS and removal restrictions

Enable RLS; grant authenticated access only with policies requiring `private.is_eligible()` and `user_id = auth.uid()`. Read/delete policies also verify the referenced course belongs to the caller; insert/update policies use both USING and WITH CHECK as applicable, verifying course ownership and denying reassignment. Enforce owner immutability on update in the database. Use a foreign key to `user_courses(id)` with ON DELETE RESTRICT, not CASCADE or SET NULL. Course ownership changes must also be prevented from invalidating existing item ownership, using an ownership-consistent composite relationship (unique `user_courses(id, user_id)` and matching item foreign key) or an equivalent database constraint. Prefer the composite constraint alongside the UUID reference for defense in depth.

The chosen resolution for course removal is blocking deletion while any item references the course. Students can explicitly delete individual items through the confirmed deletion workflow below; completed items also block course deletion until explicitly deleted. Course-removal UI, course archiving, and detaching items are outside scope. Whole-account deletion is a separate lifecycle: avoid adding an account-delete cascade here, and document that retained item references can require an explicitly ordered cleanup before deleting an Auth user. Do not weaken course retention to make account deletion implicit.

Provide a Delete action for each pending or completed item, using a simple accessible confirmation that identifies the title and offers Delete/Cancel. Issue the owner-scoped delete only after confirmation, prevent duplicate requests, and remove the item from client state only after server-confirmed success. On failure retain it and show a retryable error; cancellation sends no request. Deletion affects only that item, never its course or sibling items. Reuse existing controls or native confirmation rather than building a custom dialog framework.

### Agenda and focused editor

Add a fourth navigation view in `App.tsx`. Use separate API and state modules following existing Supabase adapter patterns; load items independently from account hydration so planner failures do not block the dashboard. Default to all courses, with independent course/type filters and Pending/Completed views. Reuse panel/form/primary-action conventions. Expand the editor in-page with Save/Cancel, visible labels and errors, optional location, and a completion checkbox for all four types. Preserve drafts across retry; prevent duplicate pending submissions. An empty course list offers navigation to existing course entry.

Use server-confirmed mutation results before claiming success, disabling only affected actions while pending. Keep private data keyed to current user and invalidate load/mutation responses on identity changes or superseding requests. Clear drafts on sign-out or account change. Protect dirty drafts when changing view/filter rather than silently discarding edits. Do not couple planner filtering to classmate selection.

A calendar-first layout would add complexity and make overdue work harder to scan; the agenda meets the initial planning need.

### Date and completion semantics

Store date and optional time separately so date-only work is never shifted by UTC conversion. Timed inputs mean America/New_York campus wall time, labeled in the form and display. Group all pending item types consistently: timed entries become overdue after their deadline; untimed entries become overdue after their date ends. Today includes remaining entries for the campus date; later dates are Upcoming. This deliberately supersedes the exploration's suggestion to move exams automatically to Past: completion is explicit and consistent across all types.

For date-only items, persist `due_time = null` and compare calendar dates directly. Never substitute `00:00`, construct a midnight deadline on the due date, or convert the date-only value into a timestamp. For example, an item due October 21 stays Today throughout October 21 and first becomes Overdue on October 22 in campus time. Clearing a previously specified time restores these date-only semantics.

Sort groups by date then time (untimed after timed on the same date), then a stable ID tie-breaker. Recompute on a bounded timer and view/window visibility changes. Use an injected clock in tests. Use standard time-zone-aware formatting to obtain the current America/New_York calendar date and wall time and compare against the stored date/optional time. Do not build custom DST gap validation, overlap disambiguation, transition tables, or specialized UI. Repeated or skipped transition-hour wall times follow the ordinary campus-clock comparison; exact transition-hour behavior is a documented MVP limitation rather than a separate implementation effort. Do not introduce a notification scheduler or Resend integration; date labels are the reminders.

## Risks / Trade-offs

- [UI and database course IDs become confused] -> Require a separate UUID field on authenticated courses and test load, manual save, and reviewed import paths.
- [Cross-owner associations through direct API calls] -> RLS checks on both item and course, immutable ownership, ownership-consistent foreign keys, and two-user SQL tests.
- [Course deletion loses work] -> Restrictive foreign keys tested with pending and completed items; future removal UI must explain the restriction.
- [Existing course memberships span terms] -> Keep explicit item dates and avoid term-specific claims.
- [Campus wall time differs from browser time] -> Label the zone and test calendar-day boundaries, ordinary timed deadlines, and browsers in other zones. Custom DST edge-case handling is deferred; retain standard America/New_York zone awareness without hard-coded UTC offsets.
- [Existing account change still has external acceptance tasks pending] -> Verify prerequisites in an isolated database and report deployment prerequisites without changing that change's artifacts.

## Migration Plan

1. Planning produces no SQL migration file and executes no SQL. During implementation only, prepare a versioned Supabase SQL migration after existing account migrations, with the table, ownership constraints, RLS, indexes, and updated-at trigger. Validate against an isolated local database and provide the SQL and verification results for the user's review. Never run it against hosted Supabase; the user will review and apply it manually.
2. Preserve course UUIDs and run enrollment/selection regressions before connecting the planner.
3. Add adapter/state/UI and targeted tests. Document campus-time semantics, private visibility, no email delivery, and restricted course deletion.
4. Wait for the user to manually apply the reviewed migration before hosted persistence acceptance or planner deployment. Do not run hosted migration commands or modify the hosted database. Until the user confirms application, complete local/mocked checks and report hosted persistence acceptance as pending. Any hosted smoke test that creates or edits data requires a separate explicit request.
5. Roll back by disabling the new view or reverting the client release while retaining stored items and protective constraints. Do not drop academic items as rollback.
