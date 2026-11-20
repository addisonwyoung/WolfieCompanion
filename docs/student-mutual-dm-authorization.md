# Stage 2B: mutual DM authorization

Prepared for owner review only. No live connection or production SQL execution by the agent.
Stage 1 and Stage 2A are prerequisites, not scripts to replay. The owner reports both deployed
and Stage 2A catalog/application checks passed. Live cross-account managed-service testing remains pending.

## Scope and behavior

Execute only `supabase/migrations/202611200001_mutual_dm_authorization.sql` after review.
No new tables, message/conversation IDs, membership changes, history deletion, or read-position changes.
No Stage 3 or Study Buddy changes. Stage 2A discovery/avatar/block policies and retired ACLs remain intact.

Every genuinely new DM requires both eligible accounts, no bilateral block, an authorized contact
basis and both canonical preferences. `no_one` closes sending in both directions. `friends_only`
requires current accepted friendship. `eligible_students` accepts established conversations,
accepted friends, pending-request contacts, or verified current course/section/professor classmates.
General search, copied IDs and group membership alone are not contact authority.

New private recipients require accepted friendship or a pending request **they initiated** to the
caller. This is a DM-only disclosure exception: no private profile/avatar/discovery permission is
created. A private sender can intentionally contact an otherwise authorized public student.
Established conversations remain a basis after course/friendship loss, but never bypass settings,
eligibility or blocks. Empty conversation rows do not manufacture established-contact authority.

The unchanged public DM signatures derive offering context from verified enrollment records;
clients cannot assert section/professor authority. The optional course hint narrows matching.
DM course normalization now supports the same subject/number grammar as enrollment/discovery.

History, inbox, unread and read-position authorization remain participant-based. Restrictions do
not erase retained messages or mark them read. Denied writes create no message, empty thread,
activity update, unread increment or message event. Exact participant-owned committed retries
acknowledge the original row; body/recipient nonce mismatches fail. Never replay drafts automatically.

## Canonical settings and reconciliation

`dm_permission` is canonical. The migration **does not backfill or synchronize settings again**.
It emits an aggregate legacy mismatch count and preserves every existing canonical choice,
private flag and group consent value. A mismatch can be an intentional canonical change or an
old client changing the legacy boolean after Stage 1; the audit has no per-setting provenance.
Inferring intent from `updated_at` or copying the boolean would overwrite valid choices.

Run the aggregate preflight below. Review discrepancies before cutover, retain a secure owner-run
settings export if required, and let students explicitly review/save the canonical settings in
the new UI. Do not infer permission from the stale boolean. Any exceptional correction requires
separate owner review; no correction SQL is generated here.

The legacy column remains for composite profile-return compatibility, but all UPDATE statements
that mention `allow_new_dms`, even unchanged values, fail with SQLSTATE `PDM01` and a refresh
instruction. The current account adapter never submits it. New profile defaults remain public,
eligible-students DM preference and enabled independent group consent.

The existing group mutation and friend-candidate RPCs now read `allow_group_additions` instead
of the legacy DM boolean. Existing creator-only/friend-only authority, group size limits, retry
receipts, admission/block guards and membership/history mechanics remain until Stage 3. This
does not implement public non-friend group additions, self-leave or peer-removal retirement.

## Authorization and locking

The installed `dm_block_guard` trigger remains in place and now uses the common mutual predicate;
privileged backend insertions must pass it too. Normal backend writes must use the send RPC,
not lock conversation rows and insert manually. No client table writes are granted. Helpers have
empty search paths and no anonymous/client/service-role EXECUTE; public RPCs use session identity.

Normal DM sends: canonical pair advisory lock, exact committed-retry check, both profile rows in
UUID order, then conversation row and insertion. Profile setting updates take their existing
owner-row lock; no profile trigger acquires pair locks. `unfriend` joins the existing pair-lock
protocol. Friend request send/response and block/unblock already use that protocol. Existing
group mutation order remains group/receipt lock, ordered pair locks, then recipient profile rows.
No new lock is taken after a profile update to try to lock all of that student's relationships.

Earlier-authorized sends may commit before a waiting restriction; later new sends must fail.
External administrative eligibility/enrollment edits, unsupported privileged multi-row write
transactions and arbitrary isolation levels are not an exhaustive concurrency guarantee. Their
deployment/administration procedures must avoid concurrent social changes or be reviewed separately.

## Manual deployment order — not yet authorized

1. Confirm the reviewed migration hash and current catalog; retain the verified pre-Stage 2A backup
   and create/review an appropriate current backup before this separate cutover. Do not use live
   credentials with the test harness. Inspect all preflight results below and resolve drift.
2. Schedule a short maintenance window for social/settings writes, drain in-flight old calls,
   deploy the compatible client and refresh old tabs. New fields already exist, but before SQL
   cutover the old sender still ignores canonical changes; do not advertise completed enforcement
   or allow a prolonged mixed-version settings window. Both UI and SQL must be released together.
3. Owner submits the entire Stage 2B SQL file once in SQL Editor. It contains its own transaction
   and five-second lock timeout. No CLI replay, fragments, old fixtures or historical migrations.
   On failure, verify rollback, resolve the cause and retry only the whole unapplied file.
4. Run the read-only postflight. Use the normal PostgREST schema-cache refresh procedure if needed.
   Resume writes with the new client, confirm settings/history/screens, then perform consented
   multi-account hosted tests. Do not borrow teammates' accounts or treat catalog checks as RLS tests.
5. Roll back a failed installation by its transaction. After successful cutover prefer a reviewed
   forward fix/maintenance mode; restoring old permissive RPCs would remove mutual consent.
   Never restore friendships, reset settings, delete messages or replay Stage 1 as rollback.

## Read-only preflight (owner runs manually)

```sql
select version(); -- Same-major runtime tested: PostgreSQL 17.12; hosted 17.11 previously verified.

select dm_permission, allow_new_dms, allow_group_additions, count(*)
from public.profiles group by 1,2,3 order by 1,2,3;
-- Differences are reviewed, not overwritten. Canonical values always win.

select column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name='profiles'
and column_name in ('is_private','dm_permission','allow_group_additions','allow_new_dms');

select p.oid::regprocedure signature,p.prosecdef,p.proconfig,
has_function_privilege('anon',p.oid,'execute') anon_execute,
has_function_privilege('authenticated',p.oid,'execute') client_execute,
has_function_privilege('service_role',p.oid,'execute') service_execute,
pg_get_functiondef(p.oid) definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('dm_send_message','dm_contact_state','unfriend','group_friend_candidates'))
or (n.nspname='private' and p.proname in ('group_mutate','dm_contact','dm_code','dm_block_guard','student_pair_lock','is_current_course_professor_member'))
order by 1;
-- Compare with supplied audit plus installed Stage 2A. Stop on unexpected overloads/body drift.

select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid
where not t.tgisinternal and t.tgrelid in ('public.profiles'::regclass,'public.dm_messages'::regclass)
order by 1,2;
-- Stage 2A dm_block_guard must be enabled; existing profile timestamp trigger remains.

select role_name,
has_any_column_privilege(role_name,'public.dm_messages','INSERT,UPDATE') message_write,
has_table_privilege(role_name,'public.dm_messages','DELETE') message_delete,
has_any_column_privilege(role_name,'public.dm_conversations','INSERT,UPDATE') conversation_write,
has_table_privilege(role_name,'public.dm_conversations','DELETE') conversation_delete
from (values('anon'),('authenticated')) roles(role_name);
-- All false. Preserve participant SELECT RLS and owner-only profile settings policies.

select to_regprocedure('private.dm_send_reason(uuid,uuid,text)') new_reason,
to_regprocedure('private.dm_verified_classmates(uuid,uuid,text)') new_offering,
to_regprocedure('private.reject_legacy_dm_setting()') new_legacy_guard;
-- All null BEFORE first installation. Stop if this migration may already be installed.
```

## Read-only postflight

Repeat the preflight settings aggregate (must match), role/trigger/RPC checks, and verify:

```sql
select p.oid::regprocedure signature,p.prosecdef,p.proconfig,
has_function_privilege('anon',p.oid,'execute') anon_execute,
has_function_privilege('authenticated',p.oid,'execute') client_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private' and p.proname in
('dm_send_reason','dm_verified_classmates','dm_contact','reject_legacy_dm_setting') order by 1;
-- Four helpers; anon/client execution false, fixed empty search_path.
-- reject_legacy_dm_setting is intentionally NOT security definer; the other three are.

select policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('profiles','dm_conversations','dm_messages','student_blocks')
order by tablename,policyname;
-- Compare preserved owner/participant policies. No peer profile/settings publication is introduced.
```

Do not run `supabase/tests/mutual_dm_authorization.sql` in live Supabase. It writes synthetic
Auth data and switches roles. Production checks are catalog SELECTs plus consented normal sessions.

## Local verification and remaining managed checks

Reproduction uses the existing safe runner and structural audit CSVs stored outside Git:

```powershell
python supabase/tests/run_privacy_runtime.py --audit-directory C:/Users/night/Downloads --postgres-bin "C:/Users/night/WebDevProjects/WolfieCompanion/supabase/.temp/postgresql-17.12-extracted/pgsql/bin" --expected-major 17 --stage2b
```

The runner verifies a NEW loopback-only postmaster, uses no `.env`/pgpass/database URLs, replays
only the scoped audit reconstruction plus Stage 1/2A, runs unchanged Stage 2A tests first, then
installs Stage 2B and checks data preservation/fixture rollback. All cluster data/logs stay ignored
under `supabase/.temp/`; `finally` stops the test server. Results are recorded below after execution.

### Executed results — 2026-11-20

**PASS on PostgreSQL 17.12, Windows x64.** Final run:
`supabase/.temp/privacy-runtime/20261120T185504164997Z/results.json`.
Stage 2B migration SHA-256: `d9a3b21d5c62da695b45887b76d4e60cc2b6ed41b0a131304fec1129ebc5cdfa`.
Generated fixture SQL in that run matches the checked-in fixture. Raw evidence is ignored local
data; this summary and the harness are retained for review/reproduction with the separate audit CSVs.

| Check | Result |
|---|---|
| Unchanged Stage 2A suite | Installation, 43 assertions plus denial checks, six rejection cases, ten observed-lock races passed |
| Stage 2B installation | Dependencies, signatures, trigger replacement, grants and definer behavior passed |
| Canonical data preservation | Entire pre-existing public/private table snapshots unchanged, including deliberately divergent settings |
| SQL permission matrix | 108 direction/preference/context/visibility cases passed: all nine settings pairs, friends/classmates/established relationships, public/private pairs, both directions |
| Other authorization cases | Wrong section/professor/term, pending/rejected enrollment, copied ID, private intentional-request direction, ineligibility, both block directions, exact retry/mismatch, history, direct/helper/anonymous denial passed |
| Backend insertion boundary | Privileged INSERT denied for both blocking and no-one consent; normal authenticated direct INSERT denied |
| Group consent | Disabled consent denies admission, existing membership retained, no-one DMs do not prevent group admission; populated legacy-false accounts use canonical consent in picker and mutation |
| Denial effects | No new messages/empty threads, sequence/activity/read-position changes or unread-projection changes |
| Migration rejection/rollback | Disabled Stage 2A guard, unexpected DM overload, direct write grant and inherited helper grant all rejected with transaction rollback |
| Nine new concurrency schedules | Observed lock waits; expected outcomes, no deadlocks |
| Fixture rollback / shutdown | Original snapshots restored; all started test servers stopped |

New concurrency schedules: recipient no-one before first send; sender no-one before existing send;
send before preference revocation; unfriend before send; send before unfriend; block before send;
group consent disabled before creation; opposite-direction sends; and pending-request decline
before first private DM. Combined with Stage 2A, 19 observed-lock schedules passed.

Application checks: full client suite **265 tests/28 files** passed; after final consent-copy/refresh
test changes, focused DM/group suite **43 tests/2 files** passed. Client lint and production build
(including TypeScript) passed after those changes; only the existing large-chunk warning remains.
All **29 server tests** and server production build passed. Python compilation passed. Native Chrome
synthetic DM and group regression scripts both passed at **1280px and 375px**, covering focus,
settings, read-only saved history, retries, scrolling/paging, unread, unchanged group management,
and account teardown. Screenshots are local temporary artifacts outside Git:
`wolfie-messaging-AJgpkO` and `wolfie-group-messaging-hmWjPG` under the Windows temporary directory.
Supabase URL/key environment overrides were explicitly blank during browser runs.

Initial fixture corrections respected the audited enrollment constraint and protected membership
tables; browser harness corrections removed obsolete enabled-composer/history expectations.
No production SQL was run. Stage 1 SHA-256 remains
`fae8f11b91bb5dc6e9c82752af9e0d45b0a67e493b0f1f53ffc29dac5a47f8ae`;
Stage 2A remains `019dc1a7cdb553f3606fcf6047bd9794eb20588216149124b689537d0467785f`.
Strict OpenSpec validation and whitespace review passed. Only tasks 4.1-4.5 were newly checked;
broad later-stage and hosted acceptance tasks remain pending.

Hosted Auth/JWT, PostgREST schema cache, Realtime filtering/reconnect and notification delivery
remain owner-run gates. Use consenting accounts to test both directions under all preferences,
unfriend/block changes while chats are open, retained history/read/unread, private outgoing pending
requests without general discovery, independent group consent and unrelated-user history denial.
No peer-readable settings/block publication is required: visible polling, focus/reconnect and
local successful-save invalidation refresh permissions. Authoritative SQL rejects writes during
any brief stale-UI interval. Shared-group notifications/participation remain independent.
