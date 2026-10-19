# Restricted classmate discovery

The dashboard displays real users who saved the same normalized course code. It shows name and major only, across sections, excluding the signed-in user. An unset major displays “Major not added.” Empty results and lookup failures never fall back to fictional profiles.

## MVP visibility limitation

Your name and major are visible to eligible students sharing a saved course. Public/private settings and opt-out controls are not available in this MVP. Memberships are self-reported: any eligible student can save a valid course code, and matching does not verify official enrollment or semesters. Saved courses may be stale; enrollment removal is not yet provided. This is restricted peer discovery, not a public directory. Other profile fields, avatars, full course lists, and direct profile/enrollment access remain owner-only.

## Owner-reviewed setup

Requires `supabase/migrations/202610160001_accounts.sql` to have been applied. Course-review tables are not a dependency. The project owner must review `supabase/migrations/202610180001_classmate_discovery.sql` and manually apply it in the shared project's Supabase SQL Editor. Do not run it automatically from setup/deploy scripts or ask teammates to rerun it. No shared database migration was executed during implementation.

The migration adds only `public.find_classmates(p_course_code text)` and its execution permissions. The browser calls it with the existing authenticated Supabase client and a saved course code such as `CSE 310`; it never sends a caller ID. The function returns exactly `student_id`, `name`, and nullable `major`. The identifier is a rendering key, not a displayed profile field. Both caller and peers must satisfy existing trusted student eligibility criteria, and the caller must have saved the requested course. Anonymous/ineligible callers or missing membership are denied (`42501`); invalid/null codes are rejected (`22023`). Existing owner-only RLS and Storage policies are unchanged.

A missing migration, network failure, or denied lookup produces an error with Retry classmates. Deploy the client after manual migration application. Refresh/reselect a course to see subsequent profile changes; live subscriptions are not included.

## Isolated local database checks

Never run bootstrap or test SQL on shared Supabase. Start a **new empty local Postgres cluster**, bound to loopback on an unused port. Do not load environment connection strings. For an isolated local server on `127.0.0.1:55447`, from the repository root:

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/psql.exe' -h 127.0.0.1 -p 55447 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql -f supabase/migrations/202610160001_accounts.sql -f supabase/tests/accounts.sql -f supabase/tests/rerun.sql -f supabase/tests/classmate_discovery.sql
```

The discovery test snapshots existing policies/table ACLs, includes the discovery migration locally, then runs rollback-only synthetic account fixtures. It tests output minimization, normalization, eligibility, self exclusion, section independence, ordering, unauthorized lookups, unchanged policies, and denied direct peer access. Bootstrap creates test-only Auth/Storage stand-ins; it does not validate managed Supabase services or Google OAuth.

Run `npm test`, `npm run lint`, and `npm run build` in `client` for adapter/UI/lifecycle checks. Tests use synthetic responses and no real project credentials.

## Live acceptance and rollback

After owner deployment, use two eligible real accounts in the same project: save the same course, verify reciprocal name/major-only results and self exclusion, change a major and reload discovery, then test a course without shared membership. Verify direct peer profile/enrollment/section/avatar access is still denied. Check a missing-RPC test environment shows Retry classmates without fictional substitutes. Record live results separately from mocks/local SQL.

To roll back, revert the client release and have the owner revoke execution of `public.find_classmates(text)` from `authenticated` in the SQL Editor. Retain profiles, enrollments, and avatars; no user data deletion is needed.

For OpenSpec sync/archive, apply the accounts change before `real-classmate-discovery`; discovery supersedes its fictional-roster baseline. Neither change is archived by implementation.
