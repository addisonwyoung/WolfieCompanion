# Student accounts and saved classes

For restricted real classmate visibility, the manual discovery migration, and MVP limitations, see [classmate discovery](classmate-discovery.md). Name and major are visible to eligible peers sharing a saved course; other profile data and direct access remain owner-only.

Google sign-in creates an account on first use. Only a verified Google identity with an email whose domain is exactly `stonybrook.edu` can access personal data. A domain hint in the Google picker is convenience; SQL policies verify trusted Auth records independently of the browser. Display-name/profile edits cannot change eligibility.

## Configure a test project

1. Create/select a Supabase test project. Apply `supabase/migrations/202610160001_accounts.sql` in its SQL editor, or run `psql "$WOLFIE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202610160001_accounts.sql` with its database connection URL. This migration supports a fresh schema or rerunning against the same account schema: functions are replaced, named triggers/policies are recreated transactionally, and the private bucket settings are reconciled without deleting rows or files. Existing tables are retained; this is not a migration from unrelated or older table layouts. Use migration history for normal deployments. If the SQL editor reports an aborted transaction after an earlier failed attempt, run `ROLLBACK;` first, then run the entire file from `begin;` through `commit;`. Do not run the test bootstrap on Supabase.
2. In Google Cloud create a Web OAuth client, enable the consent screen for the intended test users, and add the Supabase Google callback shown in the Supabase Auth provider settings as a Google authorized redirect URI. For a hosted project it has the form `https://PROJECT_REF.supabase.co/auth/v1/callback`. Configure the Google client ID and secret **only in Supabase Auth's Google provider settings**. Enable Google and disable other sign-in providers for this app.
3. In Supabase Auth URL configuration, set the site's canonical URL and allow exact frontend callback URLs: `http://localhost:5173/auth/callback` for development and `https://YOUR_APP_HOST/auth/callback` for production. If using `127.0.0.1` or another port, add its exact callback too. Production hosting must serve the SPA for `/auth/callback`. Avoid wildcard production redirects. The browser SDK handles the PKCE callback and session refresh.
4. Copy `client/.env.example` to `client/.env.local`; fill the project URL and publishable key. Only these public values belong in Vite variables. Never add a service-role key or Google secret.
5. Copy `server/.env.example` to `server/.env.local` with the same project URL and publishable key. These are used by `/api/avatar` with each caller's verified bearer token. Owner picture uploads need no service-role key. Shared classmate pictures additionally require a server-only `SUPABASE_SERVICE_ROLE_KEY`; see [classmate profile deployment](classmate-discovery.md). Start the API with `node --env-file=.env.local --import tsx src/index.ts` from `server/`. Start the frontend with `npm run dev` from `client/`; Vite proxies `/api` to port 3000. For production route `/api/avatar` and `/api/classmate-picture` to the API on the same origin and supply server environment variables through your deployment configuration.
6. Use an eligible Google account to sign in. An ineligible Google sign-in can create a Supabase Auth identity, but cannot access personal application data and is signed out of the app. New students start with empty classes and optional profile details.

The existing local `server/.env.supabase` is not automatically loaded or copied. Local env files are ignored. SDK configuration errors or absent migrations should be fixed explicitly; there is no sample-account fallback.

Official setup references: [Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), and [Storage access policies](https://supabase.com/docs/guides/storage/security/access-control).

## Database and access

- `profiles`: one row keyed by Auth user ID; trimmed name (1–100 characters), optional major (up to 120), optional study year, up to 20 case-insensitively unique interests (50 characters each), commuter/dormer/unset status, private avatar object path, timestamps.
- `user_courses`: unique owner/course code, e.g. `CSE 310`.
- `user_course_sections`: distinct string sections per course. `01` remains `01`. A course with no section rows has an unknown section; later saves add known sections without erasing existing ones.
- `ensure_profile()` initializes a missing profile without resetting saved details. `save_enrollments(rows)` validates and commits 1–100 rows atomically. Duplicate and concurrent saves use database uniqueness; all saved memberships are returned in course-code order.
- RLS protects all direct reads/writes. Child-section access checks parent ownership. Eligibility reads trusted Auth users/Google identities via a restricted helper. Editable metadata is never authority. Direct profile access remains owner-only; the restricted discovery RPC exposes only name and major to eligible peers sharing a saved course. Fictional fixtures remain separate from live results.

## Profile and classes

Use Edit profile, Save, or Cancel. Name and major are always visible to eligible classmates; independently opt in to sharing year, interests, residence status, or picture. All optional sharing defaults private. Optional fields can remain empty. The next login/reload restores saved values. The profile picture accepts decodable PNG/JPEG up to 5 MiB and 20 million source pixels; the server re-encodes it as PNG at up to 1024×1024. Avatar objects are private, under an immutable account-owned path. Signed read links last five minutes and refresh while the profile is mounted; unavailable pictures show initials.

Picture uploads commit the profile reference before deleting the previous object. Failure before commit preserves the previous picture. Failed cleanup exposes Retry picture cleanup for unused objects during the current session. If the browser closes before cleanup or an upload response is lost, an orphan may remain; operators can compare profile references to private bucket objects and remove only unreferenced objects. Never delete referenced pictures as cleanup. Signed URLs already issued remain usable until expiry even after sign-out.

Enter classes manually without enabling OCR, or use the development-only schedule preview and confirm Add to Your courses. Course codes accept 2–4 department letters and three digits; sections accept up to 20 letters, digits, or hyphens, or blank. Extraction, edits, Clear, and Close never save by themselves. Explicit confirmation saves only course/section values; images and raw OCR text are not persisted. Save errors retain drafts for retry. Saved classes restore automatically on another login/device without re-uploading. These are self-reported current classes; semester history, official registration verification, and class removal UI are outside this change.

Existing crowd and evaluation demonstrations remain separate from this account model. Production OCR remains disabled; refer to server/README.md for its local opt-in and Google Vision requirements.

## Course evaluations

Course-review persistence is defined by `supabase/migrations/202610170001_course_reviews.sql`. It additively creates `course_offerings` with class, professor, semester, and academic-year metadata, plus `course_reviews` with exactly seven columns: generated ID, offering ID, session-derived user ID, weekly hours, individual difficulty, review text, and generated creation time. The catalog offering ID is the review foreign key and uniquely identifies the full offering. A unique `(user_id, offering_id)` constraint allows one review per student per offering.

The migration file is prepared for owner review only. **Do not execute or apply it from the application setup or deploy workflow.** The project owner must inspect the SQL and run it manually in the Supabase SQL Editor. It does not change existing authentication, account, profile, or enrollment tables/policies. Review reads use an explicit projection that omits reviewer identity; insert ownership is set from the authenticated Supabase session.

For local database checks only, run the existing test bootstrap and account migration, then the course-review migration and `supabase/tests/course_reviews.sql` against an isolated local Postgres database. Never run the bootstrap or SQL tests against Supabase. The project owner separately reviews and applies the migration in the SQL Editor when ready.

## Course evaluations

Course-review persistence is defined by `supabase/migrations/202610170001_course_reviews.sql`. It additively creates `course_offerings` with class, professor, semester, and academic-year metadata, plus `course_reviews` with exactly seven columns: generated ID, offering ID, session-derived user ID, weekly hours, individual difficulty, review text, and generated creation time. The catalog offering ID is the review foreign key and uniquely identifies the full offering. A unique `(user_id, offering_id)` constraint allows one review per student per offering.

The migration file is prepared for review only. **Do not execute it from the application setup or test workflow.** The project owner must inspect the SQL and run it manually in the Supabase SQL Editor. It does not change the existing authentication, account, profile, or enrollment tables/policies. Review reads are available to eligible authenticated students through an allowlisted projection that omits reviewer identity; insert ownership is set from the authenticated Supabase session.

For local database checks only, run the existing test bootstrap and account migration, then apply the course-review migration and run `supabase/tests/course_reviews.sql` against that isolated local Postgres database. Never run the bootstrap or test script against the shared Supabase project. The owner separately reviews and applies the migration in the SQL Editor when ready.

## Repeatable checks

Run `npm test`, `npm run build`, and `npm run lint` in `client/`; run `npm test` and `npm run build` in `server/`. Endpoint tests bind temporary local ports but make no paid OCR or Google Auth calls.

For isolated Postgres verification (PostgreSQL 15+):

```sh
initdb -D /tmp/wolfie-accounts-test -A trust --no-locale -E UTF8
pg_ctl -D /tmp/wolfie-accounts-test -l /tmp/wolfie-accounts-test.log -o '-k /tmp -p 55439 -h 127.0.0.1' start
psql -h /tmp -p 55439 -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql -f supabase/migrations/202610160001_accounts.sql -f supabase/tests/accounts.sql -f supabase/tests/rerun.sql
pg_ctl -D /tmp/wolfie-accounts-test stop
```

Use a new empty test directory and unused port. `bootstrap.sql` provides test-only Auth/Storage schema stand-ins; it must never run against a real Supabase project. The SQL suite tests real Postgres constraints/RLS/RPC transactions, not the managed Auth or Storage HTTP services. On a dedicated Supabase test project, validate the managed services with real sign-in tokens: owner avatar upload/read/delete/signed-link creation, second-user and anonymous denial, invalid MIME/oversized uploads, profile/child-row reassignment denial, and account eligibility. Real Google accounts and project configuration are required for that acceptance step.

## Release and rollback

Apply migrations and configure Google/redirects before deploying the new client/API. Perform the two-eligible-account plus one-ineligible-account acceptance checklist in the change verification record. Do not deploy with unverified provider/policy configuration. Roll back application binaries/configuration if needed and retain personal tables/bucket objects; routine rollback must not drop student data. The previous application shows fixtures and does not write these tables.

Troubleshooting: missing configuration shows a setup screen; an OAuth redirect mismatch requires matching both Google→Supabase and Supabase→frontend redirects; callback failure requires a fresh sign-in from the same browser that started PKCE. A retryable workspace error can indicate missing migrations or policies. Avatar 503 can indicate missing server variables; never log bearer tokens, signed URLs, private profile values, or provider error payloads.

## Direct messaging availability

The additive `202610230001_direct_messaging.sql` migration adds the owner-only `allow_new_dms` preference, default true for existing and new users. Edit profile → Allow new direct messages supports Save/Cancel and retry after failure. Off prevents only new incoming conversations; it does not block existing chats. Authorized friends, pending-request participants, and shared-course classmates can launch Message from profiles, with participant-only persistent text history in Messages. Review [direct messaging deployment, contracts, and acceptance](direct-messaging.md) before the owner manually applies SQL. Messaging uses current caller sessions and public configuration; no new service-role key or messaging service is required.
