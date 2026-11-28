# Tasks

## 1. Enrollment lifecycle and migration

- [ ] 1.1 Add retained revocation state and owner-checked current-term edit/remove RPCs; verify edits, removals, invalid input, duplicate conflicts, and non-owner attempts with database-level cases.
- [ ] 1.2 Delete a planner course's academic items and reminder occurrences atomically when its last active current-term membership is removed; retain them while another current-term membership still uses the planner course, and move/merge references during course-code corrections.
- [ ] 1.3 Reuse current verification rules for corrected professor/course details; verify an unrecognized offering becomes pending and cannot use verified-only features until approved.

## 2. Course-scoped authorization

- [ ] 2.1 Update every classmate, recommendation, profile-lookup, friend-request, and course-group authorization path to require a non-revoked matching membership; verify old course identifiers are denied after edit/removal.
- [ ] 2.2 Add regression cases for independent active memberships and preserved friendships/direct messages; verify revoking one enrollment does not remove existing social records or block access granted by a separate active membership.

## 3. Dashboard management

- [x] 3.1 Preserve enrollment IDs separately from planner course IDs and expose authenticated edit/remove operations in the account API; verify the client targets only the selected current-term enrollment.
- [x] 3.2 Add prefilled course editing, validation, accessible delete confirmation, pending-state protection, and retryable errors; verify save, cancel, invalid input, confirmation, and server failure behavior in dashboard tests.
- [x] 3.3 Refresh course selection after successful changes and clear/abort old classmates and recommendations; verify delayed old responses cannot restore prior course data.
- [ ] 3.4 Remove deleted courses from planner choices and refresh planner items/reminders after successful removal; delete only the owner's review for the exact removed offering, while preserving other reviews, friendships, and direct messages.

## 4. Integration and deployment readiness

- [ ] 4.1 Run the client test suite, lint, and build; verify navigation, profile, course evaluation, dashboard, and planner tests remain green.
- [ ] 4.2 Apply the migration to a Supabase staging project before deploying the client; verify a changed or removed membership immediately loses old course-scoped access and valid current enrollments still work.
