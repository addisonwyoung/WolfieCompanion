# Tasks

## 1. Restricted database lookup

- [x] 1.1 Add a versioned migration defining only `find_classmates(p_course_code text)` and its execution ACL: fixed search path, session-derived caller, trusted eligibility, normalized code, saved caller membership, eligible peers, self exclusion, exact student_id/name/major projection, and stable ordering. Verify SQL review shows no changes to existing tables, grants, policies, or Storage; do not apply to shared Supabase.
- [x] 1.2 Add isolated SQL tests for same-course matching, different/multiple sections, duplicate prevention, null major, exact projection/order, self exclusion, invalid/null codes, anonymous/ineligible callers, unsaved-course denial, and unconfirmed/wrong-domain/non-Google/provider-unverified peers. Verify these tests and existing account/RLS regressions pass only against isolated Postgres; record unavailable local execution explicitly.
- [x] 1.3 Verify function execution permissions and unchanged table/Storage ownership with SQL tests comparing existing policy/grant definitions and attempting direct same-course peer reads/writes and avatar access. Confirm all unauthorized access remains denied despite successful discovery.
- [x] 1.4 Update database setup documentation with the RPC contract, account migration prerequisite, manual owner review/application, isolated-test commands, and rollback by revoking RPC access. Verify instructions never bootstrap/test/apply automatically against shared Supabase.

## 2. Live classmate interface

- [x] 2.1 Add a dedicated minimal classmate type and authenticated RPC adapter using selected `Course.code`. Add adapter tests verifying canonical course parameters, exact result mapping, nullable major, and safe errors; verify focused Vitest tests pass without caller IDs or privileged credentials.
- [x] 2.2 Replace `App` fixture roster wiring and `CourseBrowser` peer cards with live name/major results, accurate success counts, loading, empty, error/retry, and no-course states. Add UI tests proving only name/major render, unset major is handled, and failed/empty requests never use fixtures; verify those tests pass while personal profile/course entry remains functional.
- [x] 2.3 Implement request invalidation keyed by session user and selected code, clearing prior data immediately. Add deferred-response tests for course switches, retry, account changes, sign-out, and expiration; verify superseded responses never restore stale classmates and no requests run without a ready account/selected course.
- [x] 2.4 Replace fictional-roster/private-class messaging with explicit shared-course name/major visibility and deferred public/private/opt-out controls; document self-reported, course-code-only membership without semester verification. Verify UI tests assert the explanation and review setup/privacy docs for conflicting promises; keep demonstration seeds separate.
- [x] 2.5 Reconcile overlapping fictional-roster wording in the unarchived accounts change with this later discovery exception, preserving owner-only table requirements and documenting accounts-before-discovery spec sync/archive order. Verify both changes validate and no unrelated requirements are rewritten; do not archive as part of implementation.

## 3. Integration verification

- [x] 3.1 Run relevant client Vitest, lint, and build/type checks plus isolated database suites. Verify keyboard-accessible selection/retry and narrow-screen cards; record results and any unexecuted checks in a verification artifact without claiming mocks prove live OAuth/RLS acceptance.
- [x] 3.2 After owner-reviewed manual deployment, perform or document pending two-real-account acceptance: shared-course reciprocal name/major discovery, self exclusion, unrelated-course denial, profile updates visible on subsequent lookup, unchanged owner-only access, and missing-migration errors without fixture fallback. Verify the acceptance record distinguishes completed checks from checks requiring owner deployment/accounts; never apply SQL to shared Supabase automatically.
