# Verification — 2026-10-15

Branch: `codex/supabase-accounts-and-enrollments`.

## Local results

- Client: 21 tests pass. Coverage includes Google start/callback cancellation, eligibility denial, session restore/sign-out/expiry and account switching, stale response suppression, retryable workspace errors, profile normalization/validation/save/cancel/pending behavior, avatar commit/cleanup failure ordering, manual class save, and explicit asynchronous import confirmation. Existing OCR lifecycle tests still cover invalid images, replacement/layout/clear/close stale responses, empty/failure states, no automatic extraction, and object URL cleanup. TypeScript production build and ESLint pass.
- Server: 20 offline tests pass. New avatar tests verify token/eligibility denial, malformed/unsupported/oversized input, server-derived owner paths, successful PNG re-encoding, and safe upload errors. Existing crowd-report and OCR parser/service tests pass. Server TypeScript build passes.
- Fresh isolated PostgreSQL 18: initial migration applies successfully against test-only Supabase Auth/Storage schema stand-ins. SQL tests pass for profile initialization preserving edits, constraints, owner reassignment denial, private courses/sections/objects, direct foreign-row insertion denial, anonymous/ineligible access denial, confirmed Google identity eligibility, editable metadata not granting access, provider-unverified denial, normalized codes/leading zeros/distinct sections, idempotence, bounded batches, and atomic rollback. Two concurrent overlapping transactions succeed with exactly two unique course and section records afterward; synthetic rows were removed.
- Browser: headless Chrome with the actual Vite frontend at 1280 and 375 pixels, using intercepted fake Supabase/OCR responses. Profile edits save/cancel/reload correctly; manual course entry preserves section `01`; confirmed import adds another class; clearing a preview and reloading preserve saved memberships; sign-out removes personal data. Keyboard Tab moves between labeled profile and import inputs. No horizontal overflow or runtime errors was observed. These checks use mock services, not live Google OAuth or managed Storage.
- OpenSpec strict validation passes for this change and the reconciled schedule-upload-preview change. `git diff --check` passes.

## Pending external acceptance

No Supabase project was configured or modified during this run. The existing local env file contains database connection variable names only; its secrets were not read or copied into artifacts. Browser/API runtime values were synthetic for tests. The user requested a simple sign-in flow for now rather than providing a live acceptance project.

The following tasks remain unchecked because their full verification requires configured managed services or real accounts:

- 1.4: private bucket and policies are implemented and SQL-tested; managed Storage upload MIME/size enforcement and signed-link cross-account denial remain to be tested.
- 1.5: setup/model/migration/rollback documentation is delivered and fresh isolated-Postgres instructions were exercised; fresh Supabase project application remains pending.
- 2.5: Google provider and redirect documentation is delivered; a real Google round trip remains pending.
- 3.5: profile/image/cleanup documentation and local accessible UI checks are delivered; the documented upload/remove flow against a real account remains pending.
- 5.1: all local client/server/build/lint/SQL checks pass; managed Storage policy integration remains pending.
- 5.2: two eligible accounts and one ineligible Google account, cross-device restoration, and the live managed-service smoke test remain pending.

Use docs/supabase-accounts.md to configure a dedicated test project, apply the migration, and perform these checks. Keep the change unarchived until acceptance is completed. Stored classes are current self-reported memberships without semester history; real classmate data remains outside scope.
