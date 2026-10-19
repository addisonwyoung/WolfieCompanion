# Proposal

## Why

The authenticated dashboard saves real profiles and courses but still displays fictional classmates. Students need a minimal way to discover other real students who saved the same course without opening private profile or enrollment tables to general reads.

## What Changes

- Add one authenticated Supabase discovery RPC matching normalized `course_code`, requiring the caller's saved membership and excluding the caller.
- Return a stable student identifier for rendering plus only name and nullable major; display only name and major on live classmate cards.
- Preserve existing owner-only table RLS, grants, writes, and private avatar access. Keep fictional fixtures separate and never use them as a live fallback.
- Replace the dashboard's fictional roster with live loading, results, empty, and retryable error states; invalidate stale results on course/session changes.
- Explain restricted classmate visibility explicitly: eligible students sharing a saved course can see each other's name and major. Public/private settings and opt-out controls are deferred MVP limitations.
- Prepare minimal additive SQL, focused authorization/UI tests, and owner-reviewed deployment instructions. Do not apply SQL to shared Supabase automatically.

## Capabilities

### New Capabilities

- `classmate-discovery`: Restricted, course-scoped discovery contract, limited output, and explicit MVP visibility limitations.

### Modified Capabilities

- `prototype-dashboard`: Replace the selected-course fictional roster with live classmate results and asynchronous states, preserving separate demo fixtures.

## Impact

An additive Supabase migration and isolated SQL tests; a small RPC adapter and selected-course request lifecycle in the React client; `App.tsx`/`CourseBrowser.tsx` wiring and cards; focused Vitest coverage; setup/privacy documentation. No new dependencies, tables, Express endpoint, service-role credentials, avatar sharing, term model, or official enrollment verification.

The unarchived `add-supabase-accounts-and-enrollments` change also modifies `prototype-dashboard` and promises fictional-only discovery. This change builds on its implemented account flow and must be synced/archived after it; reconcile its overlapping fictional-roster wording during implementation without changing its owner-only table security contract.
