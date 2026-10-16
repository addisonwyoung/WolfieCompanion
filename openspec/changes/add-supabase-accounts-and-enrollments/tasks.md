# Tasks

## 1. Supabase schema and authorization

- [x] 1.1 Add versioned migrations for profiles, user_courses, and user_course_sections with owner foreign keys, timestamps, validation, and uniqueness; verify a fresh local/test database applies migrations successfully and rejects invalid profile/course/section values.
- [x] 1.2 Add trusted current-user Google/email eligibility checks, idempotent profile initialization, and RLS for all three relations; verify eligible owners can access their records, repeated initialization preserves edits, and anonymous/ineligible/other-user direct reads and writes fail, including owner reassignment and child-row access.
- [x] 1.3 Add a bounded transactional batch enrollment RPC deriving ownership from auth context; verify normalization, duplicate/concurrent saves, multiple sections, leading zeros, unknown sections, the 100-row limit, and rollback of invalid batches with database tests.
- [ ] 1.4 Configure a private avatar bucket and owner/eligibility policies; verify an owner can upload/read/delete allowed objects while anonymous and second-user clients cannot access objects or create signed URLs, and invalid MIME/size is rejected.
- [ ] 1.5 Document migration commands, policy test setup, data model, and non-destructive rollback in Supabase setup documentation; verify the instructions work against a fresh test project without committing credentials or touching untracked generated Prisma files.

## 2. Google authentication and workspace lifecycle

- [x] 2.1 Add the Supabase client dependency, typed configuration, and environment examples; verify client build succeeds, missing configuration produces an actionable error, and browser configuration contains no service-role key or Google secret.
- [x] 2.2 Implement Google sign-in/callback, exact-domain eligibility feedback, session restoration/refresh, sign-out, and subscription cleanup; verify mocked lifecycle tests cover first/returning login, cancellation, provider failure, ineligible email, session expiry, and sign-out.
- [x] 2.3 Add session-scoped profile/enrollment loading with stale-response invalidation and retry states; verify account A responses cannot populate account B after switching accounts, and pending/error states never show a sample or previous-user identity.
- [x] 2.4 Replace the root sample dashboard gate with branded sign-in and the authenticated workspace while preserving navigation to existing features; verify keyboard access, loading announcements, 375-pixel layout, and clearly separate fictional roster labels.
- [ ] 2.5 Document Google provider setup, exact eligibility policy, callback paths, local/production redirect allowlists, and session troubleshooting; verify configuration using a test project's Google round trip and record any external configuration prerequisite explicitly.

## 3. Persistent profile and picture editing

- [x] 3.1 Separate authenticated profile types from fictional Student data and implement async read/save adapters; verify missing optional fields initialize safely and saved edits survive re-fetch without modifying authentication identity.
- [x] 3.2 Extend Profile with name, major, optional year, normalized interests, and commuter/dormer/unset status; verify valid save, invalid input, cancel, draft retention on network failure, pending submission prevention, and persisted reload through component tests.
- [x] 3.3 Add an authenticated bounded avatar upload endpoint using user-scoped Supabase access and image decoding/re-encoding; verify valid images succeed, malformed/oversized images and invalid tokens fail, and uploaded paths cannot target another account.
- [x] 3.4 Implement avatar preview, commit, replacement/removal, short-lived authorized reads, initials fallback, and failure cleanup; verify upload/profile-write/delete failure cases preserve the appropriate saved reference and do not falsely report an unsuccessful committed save.
- [ ] 3.5 Document supported profile values, image limits, avatar endpoint configuration, and cleanup behavior; verify the documented edit/upload/remove flow against a test account and confirm accessible labels and keyboard focus.

## 4. Persistent class entry and restoration

- [x] 4.1 Replace sample enrollment initialization and redundant profile courseIds state with session-owned Supabase membership adapters; verify reload automatically groups all saved sections, sorts initial selection deterministically, and shows distinct empty/loading/retryable error states.
- [x] 4.2 Add manual course/section entry independent of OCR with the same confirmation and normalization contract; verify manual save works when OCR is disabled and rejects invalid rows without partial persistence.
- [x] 4.3 Make ScheduleImportPreview confirmation asynchronous, persist only reviewed course/section rows, retain drafts on failure, and disable duplicate confirmation while pending; verify extraction alone makes no enrollment write, repeated confirmation is idempotent, and clear after success preserves saved courses.
- [x] 4.4 Make CourseBrowser selection nullable for empty accounts, retain course sections, and remove reset-on-reload messaging; verify no undefined selected-course crash, accurate course counts, and fictional roster filtering/count/empty states without real-profile reads.
- [x] 4.5 Reconcile schedule-upload-preview planning artifacts with explicit persistent confirmation while preserving temporary extraction and development-only OCR restrictions; verify its artifacts and this change validate coherently and update existing schedule-import tests without removing stale-response/provider-failure coverage.
- [x] 4.6 Document self-reported current courses, absent semester history, manual entry, reviewed import, persistence, and retry behavior; verify the documented workflow restores classes after sign-out/relogin without another upload.

## 5. Integrated acceptance

- [ ] 5.1 Run client tests, lint and build, server tests and build, and database/Storage policy tests; verify all required checks pass and existing crowd, evaluation, and development OCR behaviors remain intact.
- [ ] 5.2 Smoke-test two eligible accounts and one ineligible Google account in a configured test environment: first login, partial profile, save/reload, picture replacement/removal, manual/imported course confirmation, cross-device restoration, and sign-out/account switching; record results and verify no cross-account data exposure.
- [x] 5.3 Validate keyboard-only use and 375-pixel layouts across sign-in, profile editing, class entry, empty/error states, and confirmation; verify labels, visible focus, status announcements, and absence of horizontal page overflow.
