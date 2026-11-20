# Stage 2A disposable database runtime verification

Initial PostgreSQL 18 verification: 2026-11-19. PostgreSQL 17.12 follow-up: 2026-11-20, America/New_York. Run artifacts use UTC dates.

**Result: the complete scoped runtime suite passed on PostgreSQL 17.12 and 18.0.** No live Supabase connection, live credentials, SQL Editor execution, deployment, commit or push occurred. No Stage 2B work was performed. Runtime tests required no correction to the reviewed Stage 2A migration.

## PostgreSQL 17.12 compatibility gate - 2026-11-20

**Verdict: PASS for the reviewed Stage 2A migration on PostgreSQL 17.12.** The complete suite produced the same checked outcomes as PostgreSQL 18.0. No migration or application-code correction was required. This closes the requested same-major PostgreSQL 17 runtime gate; it is not an exact hosted 17.11/Linux ARM64 or managed Supabase integration test.

The owner-provided live preflight identifies PostgreSQL **17.11 on Linux ARM64**, with blocks 2-7 passing. These are live metadata checks performed by the owner. The agent made no live connection and used no production credentials. The SQL migration remains fingerprinted as `019dc1a7cdb553f3606fcf6047bd9794eb20588216149124b689537d0467785f`.

### Binary acquisition and integrity

Only PostgreSQL 18 was installed originally. The earlier installer extraction launch was blocked by Windows elevation and its approval request was declined; no installer was run. The subsequent, explicitly authorized ZIP approach succeeded without administrator privileges or installation changes.

- Downloaded [the official EDB PostgreSQL 17.12 Windows x64 binary ZIP](https://get.enterprisedb.com/postgresql/postgresql-17.12-2-windows-x64-binaries.zip) using standard Windows HTTPS certificate validation with TLS 1.2 and no certificate-validation bypass. The process explicitly rejected an administrator token. Size: **386,262,342 bytes**.
- Confirmed the Windows 17.12 link published on [EDB's binary archives page](https://www.enterprisedb.com/download-postgresql-binaries), `https://sbp.enterprisedb.com/getfile.jsp?fileid=1260728`, redirects to that exact ZIP URL with HTTP 200 and `application/zip`.
- The vendor page stated **checksum unavailable**. The HTTP response supplied no `Content-MD5`, `Digest` or `x-amz-checksum-sha256`. No official checksum match is claimed. Recorded local SHA-256: `520c8c6f19abb3b31fa83ec5e486e2f769eedd7593d94e60a7cda8a5bfb4df91`.
- Inspected **all 22,221 entries** before creating the extraction root. Validated resolved destination containment and Windows path rules; rejected absolute/drive/traversal/alternate-stream/reserved names, case collisions, file/directory conflicts, encrypted entries, links/reparse points and special files. No unsafe entries were found. All entry CRCs passed a complete decompression/read **before extraction**; extraction also read each member through the ZIP CRC validator.
- Extracted **1,007,692,593 expanded bytes** into `supabase/.temp/postgresql-17.12-extracted/`, as ordinary files/directories with archive link/permission metadata unapplied. Extraction explicitly required a non-administrator token. No registry, service, PATH or runtime installation was performed.
- The extracted `postgres.exe` has a **Valid Authenticode signature**, publisher **EnterpriseDB Corporation**. All four selected tools (`postgres`, `initdb`, `pg_ctl`, `psql`) reported **17.12**. The existing PostgreSQL 18 tool-binary hashes were unchanged afterward; the only registered PostgreSQL installation remains `postgresql-x64-18`.

A recorded SHA-256 and ZIP CRCs provide reproducibility/corruption checks, not an independent publisher checksum. The official HTTPS origin and the verified server executable signature provide additional provenance. The package checksum remains unavailable from the checked vendor sources.

### Executed comparison

The fresh cluster was verified as PostgreSQL **17.12 on x86_64-windows, MSVC 19.44.35230**, listening only at `127.0.0.1:50168`. It used a new workspace data directory and the same credential-free test harness/baseline. It was stopped in `finally`; no test postmaster PID files remain.

| Verification | PostgreSQL 18.0 | PostgreSQL 17.12 |
|---|---|---|
| Baseline reconstruction and function revalidation | Passed | Passed; identical nine audit hashes and scoped coverage |
| Migration installation and dependencies | Passed | Passed; identical Stage 2A migration hash |
| SQL authorization fixture | 43 assertions plus denial checks passed | Passed; fixture source bytes identical |
| Existing data preservation and fixture rollback | Passed | Passed; both preservation flags true |
| Six unsafe-state rejection/rollback cases | Passed | Passed; matching expected errors/exit codes |
| Ten observed-lock concurrency schedules | Passed | Passed; matching outcomes and observed-wait flags |
| Owner profile composite-return compatibility | Passed | Passed |
| Cluster shutdown | Passed | Passed |

Compared the complete `baseline`, `tests`, `stage2a_sha256`, `populated_upgrade_rows_unchanged`, `fixture_rollback_verified`, `concurrency`, `outcome` and `server_stopped` manifest fields: **all match**. Test Python assertions were enabled. No PostgreSQL 18 rerun was substituted for 17 testing.

The six rejection cases remain: missing Stage 1, missing/public avatar bucket, unsafe inherited avatar grant, unsafe inherited retired-RPC grant and an unaudited avatar overload. The concurrency cases remain the ten scenarios documented below, including block/send in both orders, block/friend acceptance in both orders, block/group admission in both orders, blocked pending Study accepts, Study acceptance/owner departure and private mode/first contact. No tested race deadlocked.

### Reproduction and retained evidence

```powershell
python supabase/tests/run_privacy_runtime.py --audit-directory C:/Users/night/Downloads --postgres-bin "C:/Users/night/WebDevProjects/WolfieCompanion/supabase/.temp/postgresql-17.12-extracted/pgsql/bin" --expected-major 17
```

The harness requires all four tools to match the expected major before `initdb` and verifies the actual disposable server major after startup. Every invocation creates a new local cluster; never substitute a production URL, credentials or existing data directory.

- PostgreSQL 17 run: `supabase/.temp/privacy-runtime/20261120T140818111677Z/results.json`, generated SQL, stdout/stderr logs and server log.
- PostgreSQL 18 comparison run: `supabase/.temp/privacy-runtime/20261120T042357212718Z/results.json`.
- Comparison result: `supabase/.temp/postgresql17-versus18-comparison.json`.
- ZIP provenance, containment, CRC and signature record: `supabase/.temp/postgresql17-zip-verification.json`.
- Saved official page: `supabase/.temp/postgresql17-edb-binaries-page.html`.
- Retained archive inspector/extractor: `supabase/.temp/inspect_extract_postgresql17.py`. It refuses an existing target; do not rerun it to overwrite the extracted distribution.

### Remaining limits and deployment verdict

**The PostgreSQL 17 compatibility hold is cleared for this scoped suite. Stage 2A is ready for operator review and controlled manual deployment using the documented frontend-first order.** No deployment was performed or authorized by these tests.

The hosted server is 17.11/Linux ARM64; the tested server is 17.12/Windows x64 with UTF-8/C locale. Exact hosted locale/collation configuration is not cloned. This is same-major compatibility evidence with a patch/OS/CPU difference, not proof for that exact hosted build. The baseline is a scoped audit reconstruction with Auth/Storage stand-ins, not a complete live clone. Hosted Auth/JWT, PostgREST/schema-cache, Storage HTTP delivery and Realtime/cache behavior still require operator smoke checks. The ten deterministic schedules do not prove exhaustive deadlock/load behavior. Previously deferred Stage 2B/group/Study/UI requirements remain deferred.

No live connection, production migration execution, production credential use, commit, push, installer execution or Stage 2B work occurred.

## Environment and isolation

The installed Windows PostgreSQL 18 distribution provides `initdb.exe`, `pg_ctl.exe`, `postgres.exe` and `psql.exe` under `C:/Program Files/PostgreSQL/18/bin`. The tools are not on the shell PATH. For the original 18.0 run, no Docker, Supabase CLI, package download, Windows service changes or existing database were needed. The 17.12 run used the official ZIP described above, without installation or service changes.

`supabase/tests/run_privacy_runtime.py` initializes a unique new cluster beneath the git-ignored `supabase/.temp/privacy-runtime/` directory. Each run chooses an unused loopback port, sets `listen_addresses=127.0.0.1`, and verifies the new postmaster's PID file, directory and port before SQL. A SQL check then confirms `data_directory` equals that exact new directory. All connections specify host, port, user and database explicitly. The dedicated cluster's initially empty `postgres` database is the only database used.

Child processes receive an OS-only environment whitelist, not application or libpq credentials/configuration. `psql -X -w` skips startup scripts and password prompts; `PGPASSFILE` points at a nonexistent file inside the disposable run directory. No `.env`, database URL, service entry, default database connection or existing cluster data directory is used. Trust authentication is restricted to this loopback-only synthetic test cluster. No production records are copied.

Windows requires startup/shutdown outside the tool sandbox. The runner uses hidden subprocesses, never registers a service, and stops its own cluster in `finally`. Logs and generated SQL remain available for review; servers are stopped, not left listening. Do not start these test clusters as persistent shared services.

## Baseline provenance and scope

This is a scoped authorization baseline, **not a complete live database clone**. The builder does not replay historical migrations.

| Source | Used for |
|---|---|
| Owner's first column inspection | 100 exported columns across 15 social/enrollment/profile tables, including private mutation receipts. |
| Owner's three continuation rows | `study_groups.created_by`, `created_at`, `course_section`. |
| RPC audit | 71 exact current function definitions and their effective anon/authenticated/service execution grants. SQL function bodies are installed in dependency-staging mode, then all selected definitions are revalidated with `check_function_bodies=on`. The Stage 2A migration runs with checking enabled. |
| Constraints/indexes/triggers exports | 126 constraints, relevant independent indexes, and relevant audited triggers, including Auth profile initialization and enrollment uniqueness. |
| RLS/table/column privilege exports | Applicable RLS state, policies, table grants and modeled-column grants. |
| Reviewed repository DDL only | Supporting column shapes absent from the export: `user_courses`, `user_course_sections`, `course_offerings`, `verify_courses`, `semester_calendar`. Constraints and permissions on these tables still come from the audit. |
| Minimal test bootstrap | Auth/Storage schemas, `auth.uid()`, test roles and private object policy support. These stand in for managed services. |

The supporting columns were reviewed in the accounts, course-review and semester-aware enrollment migrations. The prototype's newer audited constraints take precedence over older repository definitions. Semester boundary rows use repository test values. The private `avatars` bucket row is a deliberate test assumption; its real hosted flag still needs operator inspection.

The Storage stand-in models only `objects.id`, `bucket_id` and `name`. Column grants on 12 unmodeled managed Storage fields are explicitly omitted and listed in each run manifest; no application-table column grants were omitted. The verify-course approval trigger and its catalog/moderation dependencies, unrelated academic/reminder tables and unrelated functions are outside this subset. Those omissions do not participate in the tested Stage 2A paths, but prevent claiming complete platform/regression parity.

## Executed tests

The original empty-baseline and populated-upgrade runs passed on PostgreSQL **18.0, Windows x86-64**. The complete populated-upgrade suite subsequently also passed on **17.12**, as recorded above. The final populated run used `127.0.0.1:51824`; its server was stopped afterward.

| Check | Result |
|---|---|
| Baseline reconstruction and selected function revalidation | Passed. |
| Stage 1 installation into disposable baseline | Passed; existing false/true legacy DM values map correctly, group additions independently remain true, profiles remain public and new account defaults are retained. Stage 1 was not rerun on live Supabase. |
| Stage 2A installation | Passed, including new functions, trigger creation, dependencies, grants, preconditions and effective-privilege assertions. |
| Populated upgrade preservation | All modeled public/private table rows, IDs and field values were identical before and after Stage 2A. Seed data included profiles, friendship, pending request, DM messages/read positions, group memberships/messages, Study memberships/tasks and minute-precision availability. |
| Stage 2A SQL fixtures | Passed: 43 explicit assertions plus exception-based denial checks. The fixture transaction rolled back, leaving the seeded baseline unchanged. |
| Existing owner profile RPC | `ensure_profile()` retained its composite return compatibility after the new profile columns were added. |
| Cleanup | Final runner recorded `server_stopped=true`; no test-cluster postmaster PID files remained after testing. |

The SQL fixtures exercise public/private discovery, current verified professor-aware discovery, pending/rejected enrollment exclusion, private accepted friends, bilateral blocks, friendship deletion, pending-request invalidation, stale acceptance, owner-only raw profile/block reads, denied direct writes, eligible/ineligible/anonymous callers, DM sending restrictions and non-writing committed replay. They also test service-only caller-ID resolver access, legitimate private-friend resolution versus private-nonfriend denial, group-context identity/picture resolution, outsiders/departed members, historical attribution, Study creation/admission/decline and preserved accepted participation/departure.

The migration was also deliberately rejected in six unsafe states:

1. Missing Stage 1 foundation.
2. Public avatars bucket.
3. Missing avatars bucket.
4. An inherited grant allowing authenticated callers to execute a supported avatar resolver.
5. An inherited grant retaining authenticated execution of a retired legacy RPC.
6. An unaudited avatar resolver overload.

Each rejection returned the expected error. The migration transaction rolled back; new block functions were absent afterward. The test-only unsafe role/overload and bucket changes were restored before the successful run. These are executed privilege/inheritance tests, not just comparisons of ACL strings.

## Concurrent transactions

All ten cases passed. For each case, the harness observed the first session sleeping **inside its transaction after the authorized operation**, then observed the second session waiting with `wait_event_type='Lock'` before the first transaction committed. Each case uses separate `psql` connections and bounded statement/lock timeouts. No tested case produced a deadlock.

| Transaction order | Observed outcome |
|---|---|
| Block, then send on an existing DM | Send waited and was denied; prior message/sequence remained. |
| Block, then attempt a new DM | Send waited and was denied; no empty conversation was created. |
| Block, then accept a pending friend request | Acceptance waited and was denied; request became declined and friendship stayed absent. |
| Block by another current member, then group admission | Admission waited and was rejected atomically; group membership count stayed unchanged. |
| Group admission, then block by a co-member | Block waited; the earlier admitted membership remained as an existing shared context. Contextual identity remained available. |
| DM insertion, then block | Block waited; earlier message/history remained and a subsequent fresh send was denied. |
| Friendship acceptance, then block | Block waited, then removed the newly accepted friendship. |
| Two blocked pending Study invitees accepting | Group-row serialization allowed one acceptance; the second waited and was denied against the now-active blocked peer. Decline remained possible. |
| Study acceptance, then owner departure | Departure waited, then preserved the accepted successor and original ownership-transfer behavior. The final member could leave and delete the group. |
| Private-mode update, then first contact | First contact waited on the profile update and was denied; no empty conversation remained. |

An unrelated safe group addition also succeeded around existing blocked co-members. This confirms that existing blocked pairings do not by themselves freeze otherwise safe collaboration. These are deterministic schedules, not exhaustive deadlock or load testing.

## Reproduction and evidence

Run from the workspace root, supplying the original structural audit CSV directory:

```powershell
python supabase/tests/run_privacy_runtime.py --audit-directory C:/Users/night/Downloads --postgres-bin "C:/Program Files/PostgreSQL/18/bin" --expected-major 18
```

This creates another new cluster and stops it afterward. Never substitute a production connection string or run the generated baseline in Supabase SQL Editor. Do not point historical concurrency scripts at a live database; the new runner owns all connection settings.

Retained local evidence:

- Empty-baseline success: `supabase/.temp/privacy-runtime/20261120T041437223001Z/`.
- First complete populated/concurrency success: `supabase/.temp/privacy-runtime/20261120T042001279741Z/`.
- Final populated/concurrency success: `supabase/.temp/privacy-runtime/20261120T042357212718Z/`.

Each folder contains generated SQL and stdout/stderr logs. `results.json` records outcomes, PostgreSQL version, connection isolation details, SHA-256 hashes of the nine audit inputs, baseline coverage and shutdown status. The final manifest additionally fingerprints the Stage 2A migration. Tested migration SHA-256: `019dc1a7cdb553f3606fcf6047bd9794eb20588216149124b689537d0467785f`.

Initial harness bring-up encountered the Windows sandbox restricted-token error, inherited output-pipe handles delaying `pg_ctl`, and a grant on an unmodeled managed Storage column. The runner was corrected, its temporary server was stopped, and omitted managed-column coverage was made explicit. These were environment/baseline harness issues; neither the Stage 2A migration nor its authorization fixture required a behavioral fix.

## Deployment assessment and remaining limits

**The scoped PostgreSQL 17.12 and 18.0 runtime gates passed; the owner completed live preflight blocks 2-7.** Stage 2A can proceed to operator review for controlled manual deployment in frontend-first order after confirming the preflight is current. This report does not authorize or perform deployment.

Still unverified here:

- Exact hosted 17.11/Linux ARM64 behavior: local testing passed on 17.12/Windows x64. The owner supplied passing metadata preflight, including `avatars.public=false`; this does not prove full platform/default-privilege parity or prevent subsequent drift.
- Managed Supabase Auth/JWT issuance, PostgREST role propagation/schema cache/exposed schemas, HTTP Storage byte delivery and Realtime publication/subscription/cache behavior. Local role switching and managed-schema stand-ins do not replace hosted integration checks.
- Full-database migration parity, unrelated academic/moderation/reminder regressions, arbitrary administrative transaction orders, long-running load and all possible concurrent schedules.
- Previously documented later-stage limitations: full mutual DM preferences, independent group-consent runtime cutover, messaging membership redesign, Study pending-content isolation/privacy-aware selection, full settings/block UI and cache invalidation are not implemented by this stage.

Correct live deployment order remains:

1. Review the completed PostgreSQL 17.12/18.0 runtime evidence and confirm the owner-supplied passing preflight remains current. Do not infer deployment state from repository filenames.
2. Deploy the compatible frontend first and refresh existing tabs. The older parser rejects the `accepted` relationship now returned for public friends by the directory.
3. Pause/drain social writes. Manually execute only `202611190002_student_privacy_authorization.sql` as one complete SQL Editor submission. Stage 1 is already live; do not replay it or historical migrations.
4. Run read-only post-deployment catalog verification and the normal PostgREST schema-cache refresh procedure if needed.
5. Deploy/enable the compatible backend, resume writes, and perform hosted eligible-session/Auth/Storage/Realtime smoke checks. The unused group-picture route may be predeployed dormant and fails closed until its database functions exist.

Stop at Stage 2A. No Stage 2B implementation or broader privacy-release completion is implied by these results.
