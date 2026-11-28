# Design

## Context

See `proposal.md` and the delta specs for the required behavior. The dashboard reads current-term rows through `my_current_enrollments`; the client currently keeps a separate legacy `user_courses` UUID as the academic-item foreign key. Several older membership checks still read `user_courses`, while newer verified discovery uses `course_enrollments`. Academic items restrict deletion of their saved-course row. A change therefore must separate active course access from the personal course reference used by the planner.

## Goals / Non-Goals

**Goals:**

- Make owner-only, current-term course edits and removals atomic in Supabase.
- Remove course-scoped authorization immediately after a successful edit or removal, including authorization paths that still rely on the legacy course table.
- Keep academic items, friendships, direct messages, and owned reviews intact.
- Preserve existing verification rules when corrected course details identify a verified offering or require verification.

**Non-Goals:**

- Editing past-term enrollments or global course offerings.
- Deleting or editing academic items, friendships, messages, or reviews as a side effect of course membership changes.
- Removing the course from the public catalog or Search Other.

## Decisions

### Keep a stable enrollment identity separate from the planner course ID

Add the `course_enrollments.enrollment_id` to the client course model explicitly. Keep the existing `databaseId`/legacy course UUID for academic items. Target edit and remove operations using the exact enrollment ID and derive the owner from `auth.uid()` in Supabase.

**Alternative considered:** Reuse the current UI course ID or legacy course UUID. Those IDs are synthesized or course-code scoped, so they cannot safely distinguish the exact current-term enrollment from the planner reference.

### Revoke membership without deleting personal course references

Add a revocation state to course enrollment records (or an equivalent retained membership-history record). Editing revokes the old tuple and creates or updates the corrected tuple in one transaction, applying the same verification rules as adding a course. Removal revokes the selected current-term tuple. Keep `user_courses` and its academic-item links so the student can still manage existing assignments and exams. For a course-code correction, update or merge the owner's planner reference and academic-item links atomically so the items follow the corrected course record.

**Alternative considered:** Delete the enrollment and its legacy course row. This conflicts with academic-item foreign keys and would either erase personal planner history or require a destructive cascade.

### Use active enrollment state for all membership-based authorization

Audit and update course-scoped RPCs and handlers so `user_courses` alone cannot authorize classmates, recommendations, profile lookup, or other course actions after revocation. Require an eligible caller and a non-revoked matching enrollment, plus the existing current-term, verification, professor, and section checks where applicable. Preserve separately stored friendships and direct-message access.

**Alternative considered:** Remove only the selected row from the visible dashboard. That would leave older authorization checks able to treat the retained planner reference as current membership.

### Refresh and clear dashboard state from the mutation result

Provide accessible edit and delete flows in `CourseBrowser`. On success, reload the authenticated account's current courses, update selection, and clear classmate/recommendation state tied to the old course. Keep pending requests abortable or keyed to the active selection so late results cannot repopulate old data. On failure, retain the saved course and show a retryable error.

**Alternative considered:** Optimistically remove the item before the database confirms success. That can hide a course after a failed request and leave the UI inconsistent with membership authorization.

## Risks / Trade-offs

- **[Risk] A remaining legacy RPC may authorize access from `user_courses` alone.** → Audit every course-based discovery, recommendation, friend, and group authorization path and add regression coverage for revoked memberships.
- **[Risk] Updating a course code can collide with an existing planner course row.** → Perform collision handling and academic-item reassignment in the same transaction; reject only when the memberships cannot be merged safely.
- **[Risk] Verification may be needed after correcting professor or section data.** → Reuse the existing verified/pending decision rules and revoke the old membership in the same transaction so it cannot remain usable while the correction is pending.
- **[Risk] React state may retain a prior roster or accept a late response.** → Reset selection-dependent hooks and test delayed responses after edit, delete, navigation, and account changes.

## Migration Plan

1. Apply a Supabase migration that records revoked enrollment state, adds authenticated owner-checked edit/remove RPCs, and updates every membership-based authorization function to require a non-revoked enrollment.
2. Deploy the client changes that pass enrollment IDs, expose edit/delete actions, and refresh course and discovery state after successful mutations.
3. Verify that existing enrollments remain active, academic items retain valid owner-scoped course references, and revoked rows no longer authorize course-based access.

Rollback should disable the new dashboard controls and restore the prior client. The database migration should be forward-compatible: revocation data and retained personal course rows remain stored; do not delete academic items or friendships as part of rollback.
