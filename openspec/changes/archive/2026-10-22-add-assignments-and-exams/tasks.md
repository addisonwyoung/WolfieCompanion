# Tasks

Planning only: do not generate or execute a SQL migration in this phase. The unchecked tasks below describe future implementation. Prioritize the complete persistent create/load/edit/complete/reopen/delete workflow and authorization before UI polish. Reuse existing controls and styles; retain essential accessibility and error handling.

## 1. Private academic item storage

- [x] 1.1 During implementation, prepare a versioned Supabase SQL migration for `academic_items` with the specified fields, nullable time without a midnight default, validation, completion timestamp, indexes, and updated-at behavior; verify isolated local SQL tests accept valid values and reject invalid types, blank/oversized titles, and malformed optional fields without adding a section column. Do not generate this migration during planning or execute it against hosted Supabase.
- [x] 1.2 Add eligible-owner/course-owner RLS, immutable ownership, and ownership-consistent UUID foreign keys; verify isolated SQL tests cover owner access, anonymous/ineligible/second-user denial, item reassignment, cross-owner course associations, course-owner changes, and owner-only item deletion.
- [x] 1.3 Restrict deletion of referenced courses; verify SQL tests preserve both pending and completed items and reject course deletion, while deleting an unreferenced owned course still works. Document course-removal restrictions and the separate ordered account-cleanup prerequisite.
- [x] 1.4 Provide the migration SQL, local verification results, prerequisites, private visibility, deployment ordering, and data-preserving rollback instructions for user review; verify against the isolated setup. The user reviews and applies the migration manually; do not run hosted migration commands or modify the hosted database.

## 2. Preserve saved-course database identity

- [x] 2.1 Introduce authenticated course typing with a separate required `databaseId`, preserving code-derived `id` in both `account.ts` load and save mappings; verify adapter tests retain actual UUIDs for loaded, manually saved, and reviewed imported courses.
- [x] 2.2 Update authenticated consumers and fixtures without changing existing selection or enrollment-section semantics; verify account, classmates, and schedule-import regressions pass and TypeScript compilation succeeds. Document the distinction between UI and database identifiers near the adapter/type.

## 3. Academic item API, state, and date rules

- [x] 3.1 Add a typed Supabase adapter for private item loading, creation, editing, completion/reopening, and individual deletion using saved-course UUIDs; verify adapter tests cover returned values, validation failures, missing storage, retryable errors, and no use of UI IDs as foreign keys.
- [x] 3.2 Add isolated user-scoped item state with guarded asynchronous requests and server-confirmed mutations; verify lifecycle tests cover sign-out/account switching during loads and writes, superseded responses, retained drafts on failure, and prevention of duplicate submission.
- [x] 3.3 Implement deterministic campus-time grouping/sorting and refresh on timer/visibility changes; verify injected-clock tests show date-only items retain null time, stay Today for the entire due date, and become Overdue only the following calendar day, including after clearing a prior time. Also cover ordinary timed deadlines, completed items, and non-campus browser zones using standard America/New_York zone awareness. Do not build custom DST gap/overlap handling or specialized transition tests.
- [x] 3.4 Document campus-time input and date-only behavior, the limitation around DST transition-hour wall times, uniform completion for all types, and in-app indicators with email deferred; verify the documentation matches date-rule tests and contains no delivery promise.

## 4. Agenda and focused editor

- [x] 4.1 Add authenticated Assignments & Exams navigation and the all-courses agenda with independent course/type filters and Pending/Completed views; verify component tests cover ordering, filtering, course-entry links, all empty/error states, and continued dashboard availability when item storage fails.
- [x] 4.2 Build the in-page add/edit form for course, title, type, date/time, notes, optional location, and completion with no section field; verify component tests cover prefilled filtered course, Save/Cancel, validation, persisted edits, failed-save draft retention, and completion/reopening for all four types.
- [x] 4.3 After the persistent workflow passes, make only necessary adjustments using existing panels, actions, focus styles, responsive layout, and accessible status/error announcements; verify keyboard-only flows and a 375-pixel viewport have labeled controls, visible focus, no horizontal page overflow, and no silent loss of dirty drafts when navigating/filtering. Defer decorative styling and animation.
- [x] 4.4 Add student-facing documentation for adding/editing items, filtering, marking complete/reopening, privacy, optional location, confirmed individual deletion, and course retention; review against the implemented UI and confirm sections and email controls are absent.
- [x] 4.5 Add a Delete action for pending and completed items with a simple accessible confirmation identifying the item and offering Delete/Cancel; verify tests cover cancellation issuing no request, successful persistent deletion of only the selected item, failed-delete retention and retry, duplicate-request prevention, and keyboard/focus behavior. Keep course deletion restricted while any other items reference it.

## 5. Integrated acceptance

- [x] 5.1 Run client tests, lint, and build plus isolated database authorization/constraint tests; verify existing account, course selection/import, classmate, study-space, and evaluation functionality remains intact and record any unavailable checks.
- [x] 5.2 Verify the complete persistent create/load/edit/complete/reopen/delete workflow, cross-owner denial, sign-out during requests, and rejection of referenced-course deletion in an isolated local test environment. Record hosted acceptance as pending until the user confirms manual migration application; do not modify hosted Supabase. Hosted smoke tests that create or edit data require a separate explicit request, and mocked checks must not be reported as hosted acceptance.
