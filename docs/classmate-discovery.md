# Classmate profiles and sharing

Select a saved class, choose **View profile** on a classmate card, and close the profile dialog to return to the same roster. Name and major are always visible to eligible students sharing a saved course. An unset major displays “Major not added” and does not prevent access.

In **Edit profile**, choose independently whether to share year of study, interests, residence status, and picture. All optional sharing defaults off for existing and new accounts. Save persists values and sharing together; Cancel discards edits. Turning off sharing keeps the underlying profile value saved. Private fields do not appear in peer detail responses or the dialog. Shared but empty fields show an empty state. Pictures fall back to initials if unavailable.

Courses are self-reported; any eligible student can save a valid course code. Matching spans sections and does not verify official enrollment or semesters. Saved courses may be stale. This is restricted peer discovery, not a public directory. There is no full-profile opt-out: name and major are the minimum shared information. Full schedules, sections, emails, and timestamps remain private. Direct messaging is a future feature; the existing account UUID is preserved for that work.

## Contracts and authorization

- `find_classmates(p_course_code text)` retains exactly `student_id`, `name`, and nullable `major`. No optional fields are added to roster payloads.
- `get_classmate_profile(p_course_code text, p_student_id uuid)` derives caller identity from Auth. Both users must satisfy the existing verified Stony Brook Google identity rules and have saved the normalized selected course. Self is excluded. Missing/unrelated/ineligible peers return null; invalid input or caller eligibility fails with `22023`/`42501`. The client maps denied access to a generic unavailable state; transient errors allow Retry.
- Detail JSON always contains `student_id`, `name`, `major`, `has_shared_avatar`. `year`, `interests`, and `residence_status` keys exist only when shared; a shared empty value is null or an empty array. No picture path, email, other memberships, or owner settings are exposed.
- The four boolean columns on profiles are `share_year`, `share_interests`, `share_residence_status`, `share_avatar`, each non-null and default false. Existing owner RLS protects all edits and direct reads.
- `GET /api/classmate-picture?course=CSE310&student=<uuid>` requires a bearer token. The server verifies Auth, checks the caller-scoped detail RPC, then invokes `resolve_classmate_avatar(p_caller_id uuid, p_student_id uuid, p_course_code text)` with verified caller identity. That resolver independently checks current eligibility, memberships, sharing, and the current saved avatar; only `service_role` can execute it. The endpoint rejects extra query keys/arbitrary paths. It downloads the private object server-side and returns re-encoded PNG pixels with `Cache-Control: private, no-store` and `nosniff`. The browser receives no signed/public URL or path. Existing owner-only Storage policies are unchanged.

Profiles refetch on each opening. Account/course/view changes clear the dialog and abort old requests; late responses cannot restore previous peer data. There are no realtime subscriptions: changes appear on the next lookup. Subsequent picture requests fail after sharing revocation; previously delivered or in-flight bytes cannot be recalled.

## Owner-reviewed deployment

1. Apply accounts (`202610160001_accounts.sql`) and discovery (`202610180001_classmate_discovery.sql`) first if not already installed. Review and manually apply `supabase/migrations/202610220002_classmate_profiles.sql` in the shared project's SQL Editor. Do not run migrations automatically from setup/deploy or rerun them blindly.
2. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and **server-only** `SUPABASE_SERVICE_ROLE_KEY` in server deployment secrets. Never use a `VITE_` prefix for the service key, commit it, return it, or log it. The existing upload endpoint continues using caller credentials. Missing service configuration fails closed for peer pictures while text profiles work.
3. Deploy the server, then client. Old clients retain roster compatibility. A missing detail migration produces a retryable error without a fictional fallback.
4. Run the live checklist below. Local tests do not verify production Supabase Auth/Storage configuration.

Rollback: revert client/server releases and have the owner revoke authenticated execution of `public.get_classmate_profile(text,uuid)` and service-role execution of `public.resolve_classmate_avatar(uuid,uuid,text)`. Retain flags and all user data; do not make the bucket public or loosen owner policies.

## Isolated local database checks

Never run bootstrap/tests on shared Supabase or use environment connection strings. Start a new empty local Postgres cluster, listening on loopback at an unused port. Example on macOS with PostgreSQL 18 (use a fresh temporary directory):

```sh
initdb -D /tmp/wolfie-profile-check -A trust -U postgres --locale=C --encoding=UTF8
pg_ctl -D /tmp/wolfie-profile-check -l /tmp/wolfie-profile-check.log -o '-h 127.0.0.1 -p 55449 -k /tmp' start
psql -h 127.0.0.1 -p 55449 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql -f supabase/migrations/202610160001_accounts.sql -f supabase/tests/accounts.sql -f supabase/tests/rerun.sql -f supabase/tests/classmate_discovery.sql -f supabase/tests/classmate_profiles.sql
pg_ctl -D /tmp/wolfie-profile-check stop
```

Bootstrap creates test-only Auth/Storage stand-ins and a service role; it does not validate managed Supabase services. The profile test must run after discovery tests in this sequence because it reuses the session's assertion helper. Fixtures roll back; migration schema changes persist in this disposable cluster. Run `npm test`, `npm run lint`, `npm run build` in `client`; run `npm test` and `npm run build` in `server`. For native modal and responsive checks with Node 22+ and installed Chrome, run `node client/test/classmate-browser.mjs` from the root (`CHROME_PATH` can override its macOS default). This browser fixture uses synthetic local data only.

## Owner-run live acceptance (pending deployment)

- Use eligible real accounts A and B sharing a saved class, plus an unrelated account C. Verify reciprocal roster discovery, self exclusion, and baseline-only profile details with all flags off.
- As B, enable each optional field independently and save/reload. As A, reopen B's profile to verify only chosen fields. Verify shared empty values, major unset, and profile name changes retaining the same UUID.
- Disable a field and confirm A's next lookup excludes it without deleting B's saved value. Test failed saves retain a draft and do not claim success.
- Share a picture, open it as A, then disable sharing, replace it, and remove it. Verify new requests cannot fetch disabled/old pictures; unavailable pictures fall back to initials while text remains usable.
- Confirm C cannot retrieve B's details/picture using a copied UUID, anonymous/ineligible calls fail, direct peer table reads/writes and Storage reads remain denied, and service-only resolver execution is denied from an authenticated browser client.
- Open a profile with keyboard, verify modal focus/Tab/Escape/close and return to the same roster, switch courses/views, and sign out during a request. Verify no previous peer details or picture return.
- Record actual live results here after owner deployment. **No live acceptance or shared migration has been performed as part of implementation.**

## Implementation validation — October 22, 2026

- Client: 78 tests passed; lint and production build passed. Build reports a non-blocking bundle size warning.
- Server: 23 tests passed and production build passed, including verified identity forwarding, service-only path resolution, private byte responses, revoked/replaced pictures, invalid input, and safe missing-configuration behavior.
- Isolated PostgreSQL 18 on loopback port 55449: accounts, account rerun, discovery, and profile SQL suites passed. Includes owner flag updates, default-private populated profiles, independent fields, preserved policies, restricted function grants, and denied/revoked membership access.
- Native Chrome: 1280px and 375px flows passed for keyboard open/close, focus containment/restoration, private defaults, saved sharing after reload, and revocation. React tests additionally cover delayed responses, account/view/course changes, unavailable details, and picture resource cleanup.
- Shared Supabase migration, deployed secret configuration, and real-account live acceptance remain pending owner deployment.
