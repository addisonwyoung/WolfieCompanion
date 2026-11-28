# Proposal

## Why

Students can currently add course entries to the dashboard but cannot correct a typo or remove a course they added by mistake. A stale membership can also keep granting access to course-based classmates and recommendations, so editing or deleting an entry must revoke that access to the old course while preserving personal planner data and existing social connections.

## What Changes

- Let students edit and delete their own current-semester course entries from the dashboard, with a prefilled edit flow and confirmation before deletion.
- Persist each change against the authenticated student's exact enrollment, update the dashboard from the saved result, and clear old course selections and results immediately.
- Revoke course-scoped classmates, recommendations, and profile lookup access for the old course after an edit or deletion. Keep assignments and exams, existing friendships, and direct messages.
- Preserve academic items when a course entry is removed; course deletion must not silently erase students' planner data.

## Capabilities

### New Capabilities

- `course-membership-management`: Owner-authorized editing and removal of current-semester dashboard course memberships, with prompt revocation of access tied to the old membership.

### Modified Capabilities

- `prototype-dashboard`: Add course edit and delete controls, accessible confirmation/validation, and stale-selection cleanup.
- `academic-items`: Replace the restriction that course removal is outside scope with preservation of linked assignments and exams when a dashboard membership is removed or edited.
- `classmate-discovery`: Require an active saved membership for discovery and deny further course-scoped access after that membership is edited or removed.

## Impact

- Client: `CourseBrowser`, account/course loading and mutation APIs, dashboard selection, classmate/recommendation hooks, and related tests.
- Supabase: authenticated, owner-scoped enrollment edit/delete operations and membership state or equivalent logic that keeps course-based authorization in sync while preserving academic-item foreign keys. This will require a database migration.
- Authorization: course-scoped classmate/recommendation and profile lookups must stop accepting the old membership after a successful edit or delete. Existing friendships, direct messages, academic items, and owned reviews remain intact.
