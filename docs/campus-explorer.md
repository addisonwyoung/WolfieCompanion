# Campus Explorer data foundation

Only database authorization and typed data access are implemented in this phase. There is no map, navigation entry or editor interface yet. No map dependencies, provider account, key or style are needed to develop/test this foundation. The crowd meter and its JSON storage remain separate.

## Owner review and hosted setup (not performed)

Review [202610230001_campus_locations.sql](../supabase/migrations/202610230001_campus_locations.sql) before manually applying it once through the project's normal migration history/SQL Editor. It depends only on the accounts migration (`202610160001_accounts.sql`), including the private schema, `private.is_eligible()` and `private.touch_updated_at()`. Confirm those are deployed first. The app never applies migrations. Missing tables or the capability RPC produce an actionable setup error rather than synthetic fallback data.

No hosted SQL, grants or content writes are authorized by implementing this foundation. After separate owner authorization, the trusted owner can manage membership by an actual eligible Auth user UUID using the SQL Editor:

```sql
-- Replace the placeholder with the intended auth.users.id, not an email/profile ID.
insert into private.campus_location_editors(user_id)
values ('REPLACE_WITH_AUTH_USER_UUID') on conflict do nothing;

-- Revoke that member when necessary.
delete from private.campus_location_editors
where user_id = 'REPLACE_WITH_AUTH_USER_UUID';
```

These are alternative owner operations, not a script to run together. The placeholder is deliberately not a valid UUID. An editor must also pass the existing verified Stony Brook Google eligibility check. Application credentials cannot read/write the allowlist or appoint editors. Revocation affects subsequent database requests without waiting for a JWT role refresh (already-running transactions follow PostgreSQL transaction rules).

Students can select published records only; eligible editors can select drafts and published records and insert/update/delete. Anonymous/ineligible users have no resource access. RLS applies to direct API calls, independently of frontend flags. The no-argument `campus_locations_can_manage` RPC returns only the caller's boolean. Use the existing publishable client and caller session; no service-role credential is needed in the browser or a new server route.

## Resource contract

Each row is one resource, even when another record has the same coordinates, category or building. Coordinates have global finite ranges, with no academic-campus geofence. Generated IDs are UUIDs; created_at/updated_at and revision are database-controlled. Client insert/update grants exclude these fields. Revision starts at 1 and increments on each edit; an ordinary edit leaves verified_at unchanged.

| Field | Validation |
| --- | --- |
| name | Required trimmed text, 1-160 characters |
| category | microwave, outdoor_lounge, study_spot, printer, drinking_water |
| latitude / longitude | Required finite numbers in -90..90 / -180..180 |
| directions | Required trimmed text, 1-1000 characters |
| building / floor | Optional, 160 / 40 characters |
| description | Optional, 2000 characters; blank client input becomes null |
| access_note | Optional, 500 characters; access restrictions, not operating schedules |
| source_url / source_note | Optional HTTPS URL up to 2000 characters / provenance note up to 1000 characters |
| verified_at | Optional finite timestamp for drafts; explicit verification, not live availability |
| status | draft (database default) or published |

Optional text is trimmed and blank values normalized to null by the client. Direct database optional text must be null or nonblank and within its limit. Publication requires a source URL or source note and verified_at; description remains optional. Source URLs must use HTTPS without whitespace/embedded credentials. Database checks reject unsafe schemes and missing hosts; client URL parsing additionally rejects malformed URLs. There are no hours, schedules, occupancy, availability or editor-identity columns. Render all text as text and validate source links again when UI is implemented.

The typed API in `client/src/campusLocations.ts` provides load, canManage, save and remove. It strips generated fields from writes. Updates require `{id, revision}` and deletes require both arguments. Conditional writes return affected rows; zero-row results are conflicts/possible permission loss, never success. Callers keep their draft on failure and reload before retrying conflicts. The database still enforces permissions if someone bypasses the typed API. Generated revision supports API compare-and-swap; it does not grant write access.

The column-level grants intentionally omit generated columns: a table-wide INSERT/UPDATE grant would defeat that protection. The revision trigger stays security-invoker and does not need direct client EXECUTE permission; it only assigns NEW.revision, while the existing timestamp trigger assigns NEW.updated_at. Both run on authorized edits. The migration owner must retain permission to attach the triggers. Under PostgreSQL READ COMMITTED, a conditional write waiting for another writer rechecks its revision predicate against the committed row, so a stale update/delete affects zero rows. This protects callers that supply the revision condition; an authorized editor using unconditional SQL can still overwrite/delete a row. RLS remains the authorization boundary, not the revision counter.

`useCampusLocations(api, userId, active)` is unmounted or supplied null when signed out/ineligible, and should receive a memoized API. It clears old-account data, suppresses late requests, refreshes on entry/reactivation/foreground/explicit retry and exposes separate load/capability errors. Failed refreshes retain data marked stale; failed capability checks disable editing and hide drafts. Mutations never automatically retry, prevent duplicates, reconcile authoritative results and recheck capability on permission/conflict errors. Draft ownership stays with the future editor, outside the hook; a false result means keep it, while account teardown must discard it. There is no polling, per-marker subscription or map movement dependency.

## Disposable local SQL checks

Never run bootstrap or SQL fixtures against hosted Supabase. They create synthetic Auth/Storage stand-ins. Use a fresh local PostgreSQL 15+ cluster with an unused port and explicit loopback parameters, not an environment-provided database URL. In PowerShell from the repository root (adjust the installed PostgreSQL path):

```powershell
$pgBin = 'C:/Program Files/PostgreSQL/18/bin'
$campusTestCluster = Join-Path $env:TEMP ('wolfie-campus-' + [guid]::NewGuid())
& "$pgBin/initdb.exe" -D $campusTestCluster -A trust --no-locale -E UTF8
if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
& "$pgBin/pg_ctl.exe" -D $campusTestCluster -l "$campusTestCluster.log" -o '-p 55453 -h 127.0.0.1' start
if ($LASTEXITCODE -ne 0) { throw 'local server startup failed' }
try {
  & "$pgBin/psql.exe" -h 127.0.0.1 -p 55453 -U $env:USERNAME -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql -f supabase/migrations/202610160001_accounts.sql -f supabase/migrations/202610230001_campus_locations.sql -f supabase/tests/campus_locations.sql -f supabase/tests/accounts.sql
  if ($LASTEXITCODE -ne 0) { throw 'SQL checks failed' }
} finally {
  & "$pgBin/pg_ctl.exe" -D $campusTestCluster stop
}
```

The campus SQL fixture rolls back its synthetic users/records after verifying insert/read/update/delete, publication, constraints, duplicate/residential points, optional descriptions, RLS, generated-column privileges, revocation and stale revisions. It is accompanied by existing account regressions. This checks PostgreSQL behavior, not hosted Google OAuth/PostgREST or cross-device acceptance. Run focused client checks with `npm test -- --run test/campusLocations.test.ts test/useCampusLocations.test.ts` in `client/`; use the existing full suite, lint and build for regressions. No additional test infrastructure is needed.

Privilege review on October 23, 2026: the focused SQL/account tests also passed in disposable PostgreSQL 18 with deliberately broad default anon/authenticated table and function grants before the campus migration, confirming its explicit revocations narrow those defaults. Expanded checks confirm timestamp/revision triggers execute for editors without writable generated columns or direct revision-trigger EXECUTE. A two-connection local READ COMMITTED check confirmed both a waiting stale update and a waiting stale delete affect zero rows after the winning update commits; its revision and contents remain intact. All eight focused client tests passed. No functional privilege/RLS change was required; migration comments and regression coverage were strengthened. Hosted Supabase was not accessed.

Rollback is data-preserving: leave the additive tables in place, disable any future Explorer entry and optionally revoke editor membership through the owner. Do not drop curated records or alter crowd storage as routine rollback. Before later map phases, separately resolve license review before dependency installation, MapTiler account/key/style/attribution, visual campus quality, feedback destination and manual curation. Hosted acceptance remains pending until separately authorized.
