# Stage 3C-1: private contextual warning database foundation

**Current status: owner-confirmed hosted migration deployment and read-only postflight PASS; hosted authenticated multi-user authorization testing remains pending.**

The owner reports successful manual execution of
`202611210003_shared_group_privacy_warnings.sql` in hosted Supabase and successful
read-only postflight covering schema/constraints, RLS and direct access, function
definitions/security/effective grants, publication safety and eight preservation
counts. The migration checksum below is unchanged. These are owner-supplied hosted
results; this documentation/commit preparation performs no hosted database operations
and does not authorize replaying the migration.

The final frontend gate passed 321 client tests across 31 files, TypeScript,
production build, lint and diff checks. The owner reports successful single-user
manual UI testing. Consenting-account hosted authenticated multi-user authorization
testing remains required, including outgoing-blocker warning isolation, pending
invitee exclusion, dismissal persistence and new-episode behavior through managed
Auth/PostgREST/Realtime. Read-only postflight and single-user checks do not establish
complete end-to-end or multi-user verification.

Earlier disposable verification checkpoint (historical): the PostgreSQL 17.12 runtime
gate passed before hosted deployment. No hosted SQL was executed during that local
verification. The initial sandbox startup restriction was resolved by owner-approved
execution outside the sandbox. The final fresh cluster passed installation,
preservation, authorization, rollback, regression and concurrency checks and was
stopped successfully. Its local result alone did not authorize hosted deployment.
The remaining procedural sections preserve the reviewed deployment and rollback
instructions; they are not instructions to rerun an already-applied migration.

## Reviewed scope and compatibility

Migration: `supabase/migrations/202611210003_shared_group_privacy_warnings.sql`.
SHA-256: `ca13cfbf472f6e2eecbbebc920bbd2f1f4794f23bea0141f19a685ee2ddd1b8a`.

- Add nullable `student_blocks.blocked_name_snapshot`. Existing blocks remain
  unchanged with NULL snapshots; never infer/backfill historical identity.
- Replace only the body of `block_student(uuid)`, preserving its signature,
  eligibility, canonical pair lock, friendship removal and pending-request cleanup.
  After pair locking, lock the target profile and test existing profile visibility
  before inserting a snapshot. Hidden non-friends and reverse-blocked targets have
  no snapshot. Private accepted friends can have authorized snapshots. Duplicate
  blocks preserve the original snapshot and episode. The unblock body is unchanged;
  its ACL is normalized alongside block to authenticated-only EXECUTE.
- Add `private.shared_group_warning_state`, with RLS and **no direct client or
  service-role table privileges/policies**. It references the outgoing block and
  both memberships with five composite `ON DELETE CASCADE` FKs. Exactly one context
  must be set. Nullable contexts use MATCH SIMPLE. Partial unique indexes retain
  one current state per directed block/context; supporting indexes cover cascades.
- Membership deletion or outgoing unblock deletes associated state. Rejoining or
  reblocking gets a fresh UUID on the next authorized fetch, without timestamps,
  episode columns, membership history, cleanup jobs or notification infrastructure.
- Study pending/accepted rows share a key; **both statuses must be accepted** in
  each RPC check. Expiry/reissue does not qualify pending rows. Ownership transfer
  does not reset episodes. Accepted legacy offering-unresolved groups remain usable.
- No existing memberships, message histories, sequences, read positions, Study
  resources, settings or calendar data are changed. Stage 1-3B sources are untouched.

The existing owner-only `student_blocks` SELECT policy also covers its new nullable
snapshot field. Future Blocked Students UI may select that saved field; NULL/blank
means use a generic **Blocked student** label (optionally a short identifier), never
look up the target's current hidden profile. Existing API callers selecting only
IDs/timestamps continue to work. No React/API integration is included here.

## Hosted ACL finding and scoped correction

The owner supplied a nine-function inventory and supplemental read-only ACL results:
block/unblock are owned by postgres, both have explicit service_role EXECUTE, and
postgres public-schema default function privileges grant EXECUTE to postgres, anon,
authenticated and service_role. The membership result contains only service_role
itself (BYPASSRLS true), with no additional inherited roles. This is consistent with
Stage 2A retaining direct service grants: its block/unblock ACL reset omitted
service_role. BYPASSRLS is not itself an EXECUTE grant; current defaults do not prove
historical origin, but the observed explicit grants require no inheritance explanation.

The Stage 3C correction adds only unblock to the existing explicit ACL reset,
authenticated grant and effective-permission assertion. Both block/unblock end with
authenticated execution enabled and anon/service execution disabled. No function
signature or unblock body changes; no global/schema default privileges or role
memberships are altered. Existing clients use authenticated session-derived RPCs.

The disposable runner seeds the confirmed explicit service grants on both functions,
asserts their presence and postgres ownership before migration, verifies effective
permissions afterward, and actually attempts service-role calls with an eligible
user claim to distinguish EXECUTE denial from application eligibility denial.
Unblock definition, unrelated definitions/ACLs, default privileges and memberships
are compared before/after. It reproduces the observed ACL state directly, without
changing even local default privileges or membership. Hosted preflight should accept
these documented pre-existing direct service grants; unexpected PUBLIC/anon or
inherited access still requires review. The migration fails closed if service access
survives its narrow reset. Postflight now checks unblock as well as block.

## RPC contract

`shared_group_warnings(p_context text, p_group_id uuid)` is a volatile, mutating
**POST RPC**; context is exactly `messaging` or `study`. It derives the viewer from
Auth, checks eligibility and locks the parent group before canonical pair locks
in deterministic target order. It rechecks current co-membership/outgoing blocks,
then lazily inserts state without resetting an existing ID or dismissal. Returns
only undismissed `(warning_id, blocked_student_id, name)` for that context. The name
is existing authorized group identity, not unrelated profile data or the management
snapshot. Unauthorized, invalid or absent contexts fail generically (42501).

`dismiss_shared_group_warning(p_warning_id uuid)` derives the owner/context from
an owned row, then follows group -> pair -> warning-row locking and post-lock
authorization. Missing/foreign/stale UUIDs return the same void/no-op outcome;
ineligible callers fail 42501. A previous episode's UUID cannot dismiss a replacement.
Only `dismissed_at` changes, using trusted database time, and repeat dismissal does
not refresh it. Both public warning RPCs and both block/unblock RPCs are authenticated-only after installation; the
new private helper has no client or service-role EXECUTE. All use fixed search paths.

Warning reads/dismissals produce no shared metadata update, bell item, unread count,
peer event or membership/block change. Only outgoing blockers can retrieve them.
Existing message/academic notifications and Stage 1-3B authorization remain separate.

## Disposable verification

The new runner reuses `Disposable` and its audit-derived baseline. It does not accept
database URLs, .env, production credentials or existing clusters. All psql calls
are explicit `127.0.0.1`, random new port, postgres user/database, `-X -w`, with libpq
environment overrides removed. All generated data/logs stay under ignored
`supabase/.temp/privacy-runtime/`; PostgreSQL is stopped in `finally`.

After permission to start local PostgreSQL is available, run from the repository:

```powershell
$env:TEMP='C:\Users\night\WebDevProjects\WolfieCompanion\supabase\.temp\stage3c-process-temp'
$env:TMP=$env:TEMP
python -B supabase/tests/shared_group_warning_runtime.py --audit-directory C:/Users/night/WebDevProjects/WolfieCompanion/supabase/.temp/stage3c-audit-inputs --postgres-bin C:/Users/night/WebDevProjects/WolfieCompanion/supabase/.temp/postgresql-17.12-extracted/pgsql/bin
```

The runner restores only the reviewed scoped audited baseline plus explicit Stage
1-3B prerequisites, not arbitrary historical migrations. It seeds synthetic existing
data before applying them. This is not a backup restore or complete hosted clone.

Checks completed in the final passing run:

- Installation on the populated baseline; exact existing-row preservation and
  no legacy label backfill; unchanged unrelated function definitions/ACLs and
  prerequisite migration hashes. Original DM/group histories and Study resources
  are included in the before/after snapshots.
- Six rejection/rollback cases: disabled Study guard, direct client block writes,
  all-table publication, private-schema publication, block-table publication and
  attempted reapplication. Reapplication must not erase dismissal or partial state.
- Public/private-friend/hidden/reverse-direction identity and block cleanup;
  outgoing-only context projection; foreign/stale IDs; new-session dismissal;
  both participants' departure/rejoining; independent shared contexts; pending,
  expired, reissued and accepted Study memberships; ownership succession; final
  group deletion; legacy NULL-offering accepted access; no direct table/helper
  access; anonymous/ineligible denial; unchanged group activity/read state.
- Twelve actual overlapping two-session cases: initialization, dismissal/fetch,
  unblock/fetch in both orders, target leave/dismiss, target rejoin/stale dismiss,
  viewer leave/fetch, reblock/stale dismiss, Study acceptance/fetch, owner transfer,
  target departure and final deletion. Eleven require an observed lock wait; the
  absent-old-ID rejoin case requires safe immediate completion during overlap.
- Existing `mutual_dm_authorization.sql`, `group_membership_authorization.sql` and
  `study_buddies_authorization.sql` regressions, each verified to roll back its data.

### Runtime results and resolved harness failures

Final corrected-migration report: `supabase/.temp/privacy-runtime/20261122T044044792782Z/results.json`.
The earlier pre-correction passing report remains at `supabase/.temp/privacy-runtime/20261122T040659371654Z/results.json` for traceability; it does not verify the corrected migration hash.
The UTC directory timestamp corresponds to November 21, 2026 in New York.
PostgreSQL was **17.12**, host **127.0.0.1**, random port **57002**; verified
postmaster/data-directory identity and `server_stopped=true`, with no remaining
postmaster PID file. No runtime cases were skipped in the final run.

- **8 hosted-ACL reproduction/correction checks PASS**, including explicit service
  grants before migration, authenticated-only effective execution afterward, actual
  service calls denied at the EXECUTE boundary, unchanged unblock body and unchanged
  default privileges/memberships.
- **63 warning assertions PASS**, including authorization, identity snapshots,
  persisted dismissal/new sessions, accepted/pending/expired/reissued Study states,
  owner transfer, both participants' leave/rejoin, same-floor rejoining, stale IDs,
  private access, preserved history and post-concurrency invariants.
- **6 rejection/rollback cases PASS** and **12 concurrency cases PASS** (11 observed
  lock waits; one deliberately immediate missing-ID dismissal during observed
  overlapping rejoining).
- **3 existing regression suites PASS**: mutual DM, group membership and Study
  Buddies. Their synthetic changes were verified rolled back. Do not confuse the
  stored static assertion-call-site counts with dynamically executed test totals.
- **Installation and existing-data preservation PASS**, including synthetic CSE 416
  NULL-section accepted memberships, task and availability; existing block labels
  remain NULL, with no inferred provenance or identity backfill. Unrelated function
  definitions/ACLs and all prerequisite migration hashes remain unchanged.

Failure history is retained, not erased: the sandbox again rejected startup with
restricted-token error 87/start error 3. Permission for the same scoped outside-
sandbox run was then granted. The first executable run stopped on the historical
Stage 2B consent-disclosing picker assertion; the next stopped because that fixture
caught P0001 rather than the current generic 42501 admission denial. Both clusters
were stopped. These were obsolete fixture expectations, not migration installation
failures. The Stage 3C runner now replaces exactly those expectations in its generated
temporary fixture, asserting Stage 3A's stronger non-disclosure contract and 42501
consent denial. The historical fixture files are unchanged. The legacy block seed
was also isolated from IDs used by the historical DM fixture. That complete initial
run passed without a migration change. The subsequent owner-approved ACL correction
adds unblock to the Stage 3C grant reset/assertions; the new complete run above passed
against the corrected hash. Prior Stage 1-3B migrations and production code remain unchanged.

Nine original structural audit CSV inputs were copied and hash-verified into
`supabase/.temp/stage3c-audit-inputs/`; test execution reads those copies, not Downloads.
Create `supabase/.temp/stage3c-process-temp/` before the command above; TEMP/TMP are
set there for subprocess temporary files. All run SQL, data, reports and logs are
under ignored `supabase/.temp/`. No credentials, .env or hosted connections are used.
The runner source corrections are permanent test compatibility fixes, not placeholders
or skipped assertions. Python syntax checks, strict OpenSpec validation and
`git diff --check` are separate local checks; no React changes require a client build.

## Owner-reviewed hosted preflight (READ ONLY)

First require a passing local results.json with `outcome=PASS`, all twelve races,
all preservation/rollback/regression checks and `server_stopped=true`. Record the
final migration hash again after any correction. Obtain a fresh application-schema
backup using the team's existing procedure; distinguish listing verification from
an actual restore test. Never run synthetic test fixtures in hosted SQL Editor.

Run these inspection blocks manually in the correct project. Stop on any mismatch,
missing prerequisite, extra overload or unexpectedly broad policy/grant/publication.
Do not assume repository migration history proves a hosted object is installed.

```sql
-- 1. Server and installed contract. Expected PostgreSQL major 17, all true,
--    and all proposed object/column flags false before initial installation.
select current_setting('server_version') as server_version,
 to_regprocedure('private.student_pair_lock(uuid,uuid)') is not null as pair_lock,
 to_regprocedure('private.student_visible(uuid,uuid,boolean)') is not null as visibility,
 to_regprocedure('public.group_leave(uuid,uuid)') is not null as stage3a,
 to_regprocedure('public.study_respond(uuid,uuid,boolean,uuid)') is not null as stage3b,
 to_regclass('private.shared_group_warning_state') is not null as warning_table_exists,
 exists(select 1 from information_schema.columns where table_schema='public'
  and table_name='student_blocks' and column_name='blocked_name_snapshot') as snapshot_exists;

-- 2. Keys/cleanup and Study status guard. Expect composite PKs, group/member
--    CASCADE references and enabled (O) Stage 3B accepted-status protection.
select conrelid::regclass as relation,conname,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in('public.student_blocks'::regclass,
 'public.group_members'::regclass,'public.study_group_members'::regclass)
order by 1,2;
select tgname,tgenabled,pg_get_functiondef(tgfoid) as body
from pg_trigger where tgrelid='public.study_group_members'::regclass
 and tgname='study_admission_block_guard';

-- 3. Current signatures/security. New warning names/helper must be absent.
--    block/unblock must each have only the existing uuid -> void signature,
--    authenticated EXECUTE true, anon false, SECURITY DEFINER and empty search_path.
--    Known hosted explicit service_role EXECUTE on block/unblock is expected here;
--    this migration removes it from BOTH functions. Postflight service_execute must be false.
--    Save the existing block definition for review/forward recovery.
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
 pg_get_function_result(p.oid) as result,p.prosecdef,p.provolatile,p.proconfig,
 pg_get_userbyid(p.proowner) as owner,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
 pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in('public','private') and p.proname in
 ('block_student','unblock_student','shared_group_warnings',
  'dismiss_shared_group_warning','warning_co_members') order by 1,2,3;

-- 4. Existing block ACL/RLS. Expected RLS true, SELECT only for authenticated,
--    no anon privileges; sole SELECT policy restricts blocker_id to auth.uid()
--    and eligible account. Stop if another policy broadens its audience.
select relrowsecurity from pg_class where oid='public.student_blocks'::regclass;
select * from pg_policies where schemaname='public' and tablename='student_blocks';
select r,
 has_any_column_privilege(r,'public.student_blocks','SELECT') as can_select,
 has_any_column_privilege(r,'public.student_blocks','INSERT,UPDATE') as can_write,
 has_table_privilege(r,'public.student_blocks','DELETE') as can_delete
from unnest(array['anon','authenticated']) r;

-- 5. Expected zero rows in all three results. Do not silently alter publications
--    to get past this gate; obtain an owner-reviewed publication correction.
select pubname from pg_publication where puballtables;
select p.pubname,n.nspname from pg_publication_namespace pn
 join pg_publication p on p.oid=pn.pnpubid join pg_namespace n on n.oid=pn.pnnspid
 where n.nspname='private';
select * from pg_publication_tables where schemaname='public' and tablename='student_blocks';

-- 6. Record preservation baselines. Existing NULL-offering Study collaboration
--    is not reconciled or disabled by this migration.
select 'blocks' as relation,count(*) from public.student_blocks
union all select 'group_members',count(*) from public.group_members
union all select 'group_messages',count(*) from public.group_messages
union all select 'dm_messages',count(*) from public.dm_messages
union all select 'study_groups',count(*) from public.study_groups
union all select 'study_members',count(*) from public.study_group_members
union all select 'study_tasks',count(*) from public.study_group_tasks
union all select 'study_availability',count(*) from public.study_group_availability;
```

## Manual deployment order

1. Complete/review the disposable runtime gate and resolve any failures; obtain
   explicit hosted deployment approval. Verify backup, preflight and exact hash.
2. Coordinate a short quiet window because ALTER TABLE takes an exclusive lock
   on `student_blocks`. The nullable/no-default column needs no row backfill or
   rewrite, but new FKs/indexes and function installation still acquire locks.
3. Paste **only the complete migration file** into Supabase SQL Editor once as
   the trusted database owner. It is one transaction with a five-second lock
   timeout. On error, stop; no partial installation is intended. Do not execute
   historical migrations or the Python/SQL fixtures in hosted Supabase.
4. Run read-only postflight below. Existing React/Express can remain running:
   existing signatures and projections remain supported. This pass enables no
   UI; a later separately reviewed client pass will consume the new RPCs/snapshot.
5. Later verify with consenting accounts through hosted Auth/PostgREST and the
   actual contextual UI once available. Do not claim complete end-to-end coverage.

## Read-only hosted postflight

```sql
-- Snapshot must be nullable text with no default; existing rows NULL.
select data_type,is_nullable,column_default from information_schema.columns
where table_schema='public' and table_name='student_blocks' and column_name='blocked_name_snapshot';
select count(*) as blocks,count(*) filter(where blocked_name_snapshot is not null) as saved_labels
from public.student_blocks;

-- Expected seven constraints: PK, one context check and five CASCADE/MATCH SIMPLE FKs.
select conname,pg_get_constraintdef(oid) from pg_constraint
where conrelid='private.shared_group_warning_state'::regclass order by conname;
select relrowsecurity from pg_class where oid='private.shared_group_warning_state'::regclass;
select * from pg_policies where schemaname='private' and tablename='shared_group_warning_state';
-- Expected zero policies and no direct access for any role below.
select r,has_any_column_privilege(r,'private.shared_group_warning_state','SELECT,INSERT,UPDATE') as column_access,
 has_table_privilege(r,'private.shared_group_warning_state','DELETE') as delete_access
from unnest(array['anon','authenticated','service_role']) r;

-- Only authenticated executes public RPCs; no listed role executes the helper.
-- Public RPCs are definer/volatile; helper is definer/stable. All search paths empty.
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,p.provolatile,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in('public','private') and p.proname in
 ('block_student','unblock_student','shared_group_warnings','dismiss_shared_group_warning','warning_co_members');

-- Expected zero rows. Repeat the all-table/private-schema publication preflight.
select * from pg_publication_tables where (schemaname='private' and tablename='shared_group_warning_state')
 or (schemaname='public' and tablename='student_blocks');
-- Initially zero, except any deliberately authorized post-deployment RPC usage.
select count(*) as warning_states from private.shared_group_warning_state;
```

Repeat preservation counts and inspect the existing CSE 416 workspace/tasks/
availability against preflight/backup. Quiet-window counts should match; concurrent
legitimate activity may require a keyed comparison. These inspections are not a
substitute for cross-account authorization tests. Never call mutating warning RPCs
from SQL Editor while treating them as read-only inspection queries.

## Failure and rollback

On a transaction/preflight/lock failure, stop and inspect; do not relax guards,
disable RLS/triggers or repeat modified fragments. A failed whole-file transaction
should leave the pre-deployment schema intact. On a post-deployment issue, keep new
warning UI disabled and prefer a forward fix. A trusted owner may revoke EXECUTE
on the two new warning RPCs as a separately approved containment action while
retaining block enforcement, snapshots, memberships and persisted dismissals.
Do not drop parent data, restore permissive block functions, republish private state,
or delete warning state as routine rollback (that would rearm dismissed episodes).
No automatic/destructive down migration is supplied. Any emergency rollback SQL
requires separate review; none is executed by this work.

Remaining hosted limits: real Auth eligibility, PostgREST volatile/POST behavior,
effective inherited grants/default ACLs, managed publication/subscription behavior,
production lock duration/volume, and consenting-account privacy tests. The local runtime gate now passes; it does not establish hosted service behavior or authorize deployment.
