# Design

## Context

See proposal.md for motivation. `App.tsx` supplies fictional `students` to `CourseBrowser.tsx`; `getClassmates` filters that fixture locally. `account.ts` already loads real `user_courses` and maps canonical codes to display IDs. Those display IDs and per-user enrollment UUIDs are not shared course keys. `profiles` supplies name and nullable major. Account SQL deliberately restricts all direct profile/enrollment/section access to the owner; Storage is also private. The review catalog is unrelated to saved memberships.

## Goals / Non-Goals

**Goals:** One database-authorized lookup, a three-column response, and a small selected-course asynchronous UI using existing Supabase authentication.

**Non-Goals:** Public directory, visibility toggles, opt-out, new tables, avatar sharing, year/interests cards, section/semester matching, enrollment verification/removal, realtime subscriptions, service credentials, or a new server endpoint.

## Decisions

### Minimal additive SQL and one RPC

Prepare a new versioned migration after the existing account/review migrations. Define `public.find_classmates(p_course_code text)` returning `table (student_id uuid, name text, major text)`. Use a stable, read-only `SECURITY DEFINER` function with `search_path = ''` and fully qualified references, owned by the migration role capable of reading the protected rows. Revoke execution from PUBLIC and anon explicitly; grant execute only to authenticated. Do not change any existing table grants, RLS policies, helpers, or Storage policies.

The function must explicitly enforce authorization because its owner can bypass RLS: require non-null `auth.uid()` and `private.is_eligible()`, normalize/validate the parameter using the existing course-code rules, then require a `user_courses` row for the caller/code. Reject failed authorization with `42501`; reject invalid input with `22023`. Never accept a caller/user ID parameter or build dynamic SQL.

Join other `user_courses` rows on canonical `course_code` to `profiles.id = user_id`, excluding `auth.uid()`. Apply peer eligibility inline using an EXISTS over trusted `auth.users`/Google `auth.identities` with the same confirmed-email, exact domain, matching email, and verified Google identity criteria as `private.is_eligible()`. That existing helper checks only the caller; do not reuse it as a peer check. EXISTS prevents multiple identities from duplicating rows; `(user_id, course_code)` uniqueness prevents multiple enrollments. Do not join section rows. Project only student_id/name/major; sort by name then student_id. The internal student_id is solely a stable rendering key, not displayed profile information.

Return the complete selected-course roster for this small prototype so the visible count remains exact. Pagination and a course-leading index are deferred until measured roster size warrants them; there is no public bulk lookup endpoint. This adds one function and its ACL only, with no structural schema changes.

Alternatives: direct joins or an invoker RPC cannot read peers through current RLS; expanding SELECT policies would expose all currently granted profile columns; a service-role server endpoint adds credentials and duplicate authorization. A narrow definer RPC provides the required explicit exception with the smallest surface.

### Minimal client integration

Add a typed adapter beside the existing account API (or a small `classmates.ts` module) that calls the RPC with the selected saved `Course.code`, not its display ID or enrollment UUID. Define a dedicated result type with only student_id/name/major, rather than the fixture `Student` type requiring year/interests/courseIds. Surface a safe retryable error without leaking database details.

Own request state in a small hook or the authenticated workspace: idle/loading/success/error keyed by authenticated user ID and canonical course code. Clear data synchronously when the effective key changes; use a request generation/disposal guard so delayed responses cannot restore old data. Fetch only when account state is ready and a saved course is selected. Retry the active key; course switches, sign-out, expiration, and account switches invalidate requests. Do not add realtime infrastructure.

Pass live state into `CourseBrowser`, remove the runtime fixture roster dependency from `App`, and render name/major cards with an unset-major placeholder. Omit year, interests, and avatar controls from peer cards. Keep existing personal profile editing and enrollment entry unchanged. Retain fixtures for isolated tests/demonstrations without blending them into live results. Replace fictional/private-course messaging with the explicit restricted-visibility MVP explanation in the spec. An unavailable migration is an error, never a fixture fallback.

### Focused verification

Use isolated Postgres SQL fixtures with two eligible same-course users, a different-course user, an ineligible user, and anonymous access. Assert exact output columns, normalization, section independence, uniqueness, database-side self exclusion, membership authorization, eligibility of caller and peers, unset major, and deterministic ordering. Recheck function ACLs and existing policy definitions/grants; same-course students must still fail direct foreign reads/writes and avatar access. Run existing account/RLS regression tests too.

Use Vitest adapter and UI tests for correct RPC/code parameters, minimal rendered fields, nullable major, loading/empty/error/retry, no fixture fallback, and out-of-order course/account responses including sign-out. Run relevant client lint/type/build checks. Keep mock UI checks distinct from live OAuth acceptance.

### Existing OpenSpec overlap

The durable prototype spec still describes the original anonymous demo, while the unarchived accounts change supplies the implemented authentication and saved-course behavior. This delta changes only the roster requirement by its existing exact title. During implementation, reconcile the accounts change's overlapping roster wording and privacy documentation so it acknowledges this later restricted RPC exception. Preserve its original owner-only table guarantees; sync/archive the accounts change before this change to avoid resurrecting fictional-roster requirements. Do not rewrite unrelated pending artifacts now.

## Risks / Trade-offs

- [A definer function bypasses owner-only RLS] -> Explicit session, eligibility, membership, projection, and execution-ACL checks; isolated negative authorization tests.
- [Students can save any valid course code] -> Explain that discovery uses self-reported membership, not official enrollment verification.
- [No term data or enrollment removal UI] -> Explain course-code-only matching and potentially stale memberships; defer academic history and removal.
- [Visibility changes without individual controls] -> Explicit MVP limitation in the UI/docs: eligible peers sharing a saved course see name and major; no public/private or opt-out setting yet.
- [Eligibility rules duplicated for peers] -> Mirror trusted criteria exactly and cover unconfirmed, wrong-domain, non-Google, and provider-unverified peers in SQL tests.
- [Live deployment differs from checked-in SQL] -> Owner review and manual application before live acceptance; report missing migration as a retryable failure.
- [Complete rosters may become large] -> Accept small prototype scale; revisit pagination/indexing before broader rollout.

## Migration Plan

1. Implement the additive migration, adapter/UI, tests, and documentation in a later apply phase. Execute SQL tests only in an isolated local database; never bootstrap or test against shared Supabase.
2. The project owner reviews and manually applies the migration in the Supabase SQL Editor; automated application to shared Supabase is outside scope.
3. Deploy the client after migration availability. With two eligible real accounts in the same project, save the same course, confirm reciprocal minimal discovery and self exclusion, then confirm unrelated-course denial and unchanged owner-only access.
4. Roll back the UI release and revoke discovery-function execution if needed; retain all profiles, enrollments, avatars, and fixtures. Do not delete user data.
