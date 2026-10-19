# Design

## Context

Compatibility update for `real-classmate-discovery`: fictional-roster descriptions below record this account change's original baseline. The later discovery change supersedes that roster through one restricted RPC exposing only name/major to eligible peers sharing a saved course, with an internal rendering identifier. Direct table/Storage access remains owner-only. Sync/archive this account change before the discovery change; do not restore fictional-only behavior afterward.

See proposal.md for motivation. The React/Vite client initializes `App.tsx` from `sampleData.ts`; profile saves and schedule confirmation currently mutate React state. `CourseBrowser.tsx` assumes a selected course always exists. `ScheduleImportPreview.tsx` already exposes an Add to Your courses callback, but its completed, unarchived change still describes a nonpersistent preview. The Express server provides crowd and development-only OCR endpoints. Neither package currently declares a Supabase dependency; generated Prisma files are untracked and no checked-in Prisma schema/migrations were found. These files are not an established database contract and must remain untouched.

## Goals / Non-Goals

**Goals:** Make Supabase the authority for identity, personal profile, and course membership; keep authorization enforceable independently of React; support incomplete onboarding and reliable retries.

**Non-Goals:** Password login, production OCR deployment, real student directory/discovery, recommendation algorithms, university enrollment verification, semester history, account deletion UI, and redesigning crowd reports or course evaluations. Saved classes are self-reported and do not prove official registration.

## Decisions

### Supabase Auth and a session-scoped client

Use Google OAuth through Supabase Auth, with a first successful login creating an account. Configure explicit local and production redirect allowlists and a callback path. Use the browser SDK's supported OAuth/session flow, subscribe to auth changes, and unsubscribe on unmount. A session provider owns unresolved, signed-out, ineligible, loading-workspace, ready, and error states. Profile and enrollment requests are keyed by authenticated user ID; clear them and invalidate request generations on auth changes. Never render personal sample defaults while resolving sessions.

The browser receives only the Supabase URL and publishable key through documented Vite environment variables. No service-role key or Google client secret enters client code. Missing configuration produces a setup message. Server credentials remain server-only. An Express proxy for every database operation would duplicate Supabase's authorization layer, so ordinary profile/enrollment operations use the authenticated Supabase client directly.

The README requires verified Stony Brook email. Treat the exact lowercase domain `stonybrook.edu` as the initial eligible domain. Google domain hints improve account selection but do not enforce access. Database/storage policies use a narrowly scoped eligibility helper reading trusted Auth identity/email confirmation, not editable profile or user metadata. Require a verified Google identity and verified matching email, with no suffix matching. Restrict helper execution, fix its search path, and expose only a boolean for the current authenticated user. UI denial also signs out ineligible sessions; policies remain authoritative if the UI is bypassed. Configure Google as the sole enabled sign-in method for this application. Revisit other university domains only through an explicit requirement change.

### Minimal account-owned relational data

Add versioned Supabase SQL migrations rather than adopting an unconfigured ORM.

| Relation | Key and data | Constraints |
| --- | --- | --- |
| `profiles` | `id` UUID references `auth.users`; name, nullable major/year/residence status, interests text array, nullable avatar object path; created/updated timestamps | Primary key is Auth user ID; field constraints mirror student-profile; account deletion cascades row deletion |
| `user_courses` | UUID ID, `user_id`, normalized `course_code`, timestamps | Owner foreign key; unique `(user_id, course_code)`; indexed by owner |
| `user_course_sections` | `user_course_id`, nonempty section string | Unique `(user_course_id, section)`; cascade from membership |

A course membership with no section rows represents a course with unknown sections. Adding a missing-section row to an existing course does not erase known sections. Course codes group independently of sections, matching the current UI's `Course.sections` model. Do not maintain a second authoritative `courseIds` array inside profiles. Use a transaction-backed, security-invoker RPC for batch confirmation: derive owner from the authenticated identity, validate the complete bounded batch, upsert courses/sections, and return canonical saved memberships. Use at most 100 rows per batch. Never accept an arbitrary owner as authority. RLS also protects all direct table operations; child policies validate ownership through the parent membership. Repeated requests and concurrent saves are deduplicated by constraints.

Create the profile idempotently from trusted account creation data through an Auth trigger; use an explicit safe placeholder if Google supplies no display name. Provide an idempotent initialization path for preexisting eligible Auth accounts with no profile, without overwriting existing edits. This avoids a profile row being duplicated on repeated login. Optional fields start empty; no sample classes are seeded. Use a normalized enrollment adapter for display, not the fictional Student identity type.

A shared course catalog and term-specific offerings would support future discovery/history but require facts absent from the current course/section inputs. Store the student's current self-reported memberships now; defer shared offerings and semester modeling. Enrollment removal is deferred, while avatar removal is included.

### Private profiles and avatar storage

Profiles and memberships are owner-only under RLS, including reads. Policies require both eligibility and `auth.uid()` ownership for SELECT/INSERT/UPDATE/DELETE, including update checks preventing reassignment. The boolean eligibility helper must not expose other Auth records. Fictional classmates remain sourced from `sampleData.ts`, clearly labeled, and never joined to private profiles.

Use a private avatar bucket with immutable object names under `<user-id>/<random-id>`. Uploads pass through a bounded Express endpoint that validates the bearer token against Supabase, verifies eligibility, decodes and re-encodes JPEG/PNG using a maintained image library, enforces the 5-MiB input limit and a decoded pixel bound, and uploads under the user's validated identity. The endpoint uses the user's scoped Supabase token, not a broad service credential. Storage insert/read/delete policies enforce eligibility and matching path owner; bucket restrictions enforce MIME/size as an additional boundary. Treat stored image bytes as untrusted even if a direct client upload bypasses decoding: permit only image formats in this private image context, and do not serve arbitrary content as an application document.

Upload a new object first, persist its path second, then remove the old object. If the profile write fails, retain the old picture and delete the newly uploaded orphan; cleanup failures are retryable and must not convert a committed save into a false failure. Remove the profile reference before deleting a removed picture. Generate short-lived signed read URLs only after owner authorization, refresh expired URLs, and use initials on missing data. Never persist signed URLs as identity. Initialization uses Google display name only; Google picture URLs are not stored as the canonical avatar, avoiding public external-image dependencies.

### Asynchronous editing and confirmation

Refactor profile Save and import confirmation to await persistence. Keep drafts open until successful confirmation, disable duplicate submissions while pending, retain drafts on error, and reconcile successful responses into session-owned state. Cancel remains local. Interests normalize before save; validate authoritative constraints in SQL as well as UI.

Provide manual course/section entry independently of the OCR service so hosted accounts can save classes while OCR remains development-only. Reuse the reviewed-row editor/validation where practical. Extraction remains a temporary draft; only confirmation invokes the persistence RPC. Persist course/section values only, never screenshots or raw OCR output. Clear preview after save must not clear persisted classes. Update reset-on-reload messaging and the import callback contract. Handle empty course lists with nullable selection and deterministic initial ordering by normalized course code.

### Compatibility with existing specifications

The prototype-dashboard delta replaces root anonymous access, fixed personal identity/courses, and reset-on-reload behavior while retaining fictional classmates and existing responsive requirements. Requirement titles remain unchanged to target existing blocks during spec sync.

`schedule-upload-preview` is still an unarchived change, not a main capability. Do not invent a MODIFIED delta targeting a nonexistent main spec. During apply, revise that change's existing preview-only assertions coherently before archiving either change: extraction and draft edits remain nonpersistent; explicit confirmation can persist enrollment under user-enrollments. Preserve its production-disabled OCR contract. Its existing tests contain both preview-only behavior and later local confirmation; update those expectations specifically rather than dropping OCR lifecycle coverage.

## Risks / Trade-offs

- [OAuth and project configuration vary by environment] → Document exact callback/redirect setup and run a real eligible-account smoke test before release; mocks cannot validate provider configuration.
- [Email eligibility or ownership checks implemented only in UI] → Verify anonymous, ineligible, owner, and second-user access directly against database and Storage policies.
- [Partial avatar/database failure] → Immutable paths, explicit commit sequencing, best-effort orphan cleanup, and initials fallback.
- [Two devices edit the same profile] → Last successful write wins for this version; no collaborative profile editing.
- [Current course data lacks semester information] → Describe this as a current course list and do not imply historical enrollment correctness.
- [Demo classmates beside real account data] → Label the roster explicitly; never infer real enrollment or publish private fields.

## Migration Plan

1. Add migrations, policies, helper/RPC tests, private bucket configuration, environment examples, and setup documentation. Do not copy the existing local Supabase env file or its secrets into artifacts.
2. Apply to local/test Supabase and test with two eligible users, an ineligible user, and anonymous requests. Configure Google provider and redirects in a test project.
3. Deliver session gate, persistent profile/avatar flow, enrollment confirmation/loading, manual entry, and empty/error states. Reconcile related planning assertions and tests.
4. Apply reviewed migrations to the target project before deploying the client/server; configure keys and allowed redirects, then smoke-test Google account creation, sign-out/relogin, profile/picture save, and course restoration.
5. Roll back by reverting the client/server release and disabling new entry points while retaining stored rows and bucket objects. Do not drop personal data as a routine rollback. The older client only shows sample data and does not modify the new data model.
