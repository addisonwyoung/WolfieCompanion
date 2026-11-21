# Stage 3A: group chat membership controls

Prepared for review, not deployed. The agent used only disposable, loopback PostgreSQL and synthetic browser accounts. No hosted Supabase verification or deployment is claimed.

## Incremental database change

Apply only `supabase/migrations/202611210001_group_membership_controls.sql` after approval. SHA-256: `653596876228b97d361ee3c196f14169475195c6691031babbeaaebfd15b1f16`.

Prerequisites are the audited group schema and already-installed Stage 1, 2A and 2B definitions, including canonical settings, private eligibility/visibility/pair-lock helpers, mutation receipts, sequence floors and the enabled group admission guard. Do not replay historical migrations. The installer rejects missing required routines, a disabled admission guard, direct anon/authenticated group writes or unsafe effective new-helper/RPC grants. Unexpected pre-existing new objects must be investigated rather than dropped.

Two group columns record addition permission and permanent creator departure. Existing groups become All Members; absent historical creators are marked departed. Existing IDs, membership floors, read positions, messages, canonical privacy preferences and Study data are preserved. All Members allows eligible active members to add; Creator Only permits the unrevoked active original creator. Only that creator can change the setting before first departure. Leaving switches to All Members and permanently revokes special rights, without changing creator attribution or transferring authority.

Every target is validated atomically against the actual adding actor: account eligibility, public visibility/private accepted friendship, bilateral blocks, independent group consent and capacity. Co-member/co-target blocks alone do not reject an independent third-party addition. Failures do not reveal the restriction category. There are no messaging invitations, peer removals or admission acceptance. Existing creation/addition RPC signatures remain compatible; configured creation, settings and self-leave have explicit authenticated-only RPCs. The legacy peer-removal RPC is denied, including to service_role.

Candidate discovery returns constant `can_add=true` and `reason=null` for every discoverable student. These fields indicate selection availability, not guaranteed admission. Candidate listing must not reveal `allow_group_additions`, including through disabled states or a consent-derived reason. Visibility/friendship/block/eligibility filtering is unchanged; consent is checked only during atomic creation/addition and failures remain generic. No frontend response-contract change is required.

Self-leave deletes only the caller's active membership. Re-addition gets a fresh existing sequence floor, so previous-tenure and absence messages are unavailable. Existing receipts prevent old retries from repeating admissions/settings/departures. Non-writing committed send retries remain valid only while the caller retains access to that message; genuinely new sends require three eligible active members. The insertion trigger also protects privileged inserts. Normal backend writes must use the supported RPCs, which maintain sequence and conversation metadata; direct service writes are not an alternative client API.

An empty group row and its messages remain, but without members there is no client authority to list, read, invite, send or self-rejoin. No new history ledger, ownership-transfer machinery, warning storage, Study implementation or lifecycle subsystem is introduced. Administrative account deletion/manual membership mutation is not a supported substitute for the self-leave RPC; existing account-deletion policies require separate review if that workflow is introduced.

## Manual deployment order (owner only, after review)

1. Confirm Stage 2B is installed and the scoped catalog matches the prerequisites below. Verify a fresh backup and its restore listing. Keep this migration and the matching React application together.
2. Stop the local React/Express application and close existing application tabs. Pausing Express alone does not stop direct browser RPCs. Build the matching client before cutover; it rejects old group-detail projections rather than guessing permissions.
3. In Supabase SQL Editor, execute this entire migration as one script, with its transaction intact. Do not run the fixture, baseline builder, previous migrations or runtime harness against Supabase. A five-second lock timeout fails safely; rollback and investigate active writers instead of removing guards or constraints.
4. Run the read-only postflight checks below. If installation fails, do not start the new application until the transaction result/catalog is understood. This is intentionally a one-time migration, not an idempotent script to rerun after success.
5. Restart the matching local React/Express application and hard-refresh all clients. Existing clients cannot manage new settings and may show obsolete removal/send controls; the database still rejects unauthorized actions. With consenting test accounts, verify the hosted checklist below before considering the feature deployed.

The migration takes ordinary ALTER TABLE locks on group_conversations, updates groups with absent creators, replaces functions and installs a message trigger in one transaction. PostgreSQL 17 constant defaults avoid a table rewrite, but lock acquisition can still block and DDL waits/transactions should be scheduled deliberately. No live timing or production-volume estimate is established here. Rollback before commit preserves the old catalog/data. After successful deployment, do not blindly drop columns or restore obsolete peer-removal/admission functions: subsequent departures and new permissions need a reviewed forward correction or a coordinated backup restore.

## Read-only preflight

Paste into SQL Editor only when the owner is preparing deployment. These SELECTs do not install anything.

```sql
select current_setting('server_version') as server_version;
select signature, to_regprocedure(signature) as installed
from unnest(array[
 'private.dm_send_reason(uuid,uuid,text)',
 'private.student_visible(uuid,uuid,boolean)',
 'private.student_pair_lock(uuid,uuid)',
 'private.group_mutate(uuid,uuid[],text,uuid)',
 'public.group_create(uuid[],uuid,text)',
 'public.group_add_members(uuid,uuid[],uuid)',
 'public.group_remove_member(uuid,uuid)',
 'public.group_send_message(uuid,text,uuid)',
 'public.group_friend_candidates(uuid,text,text,uuid,integer)'
]) signature;
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='group_conversations'
order by ordinal_position;
select tgname, tgenabled, pg_get_triggerdef(oid) as definition
from pg_trigger where tgrelid in ('public.group_members'::regclass,
 'public.group_messages'::regclass) and not tgisinternal;
select role_name, table_name,
 has_any_column_privilege(role_name,'public.'||table_name,'INSERT,UPDATE') as can_write_columns,
 has_table_privilege(role_name,'public.'||table_name,'DELETE') as can_delete
from unnest(array['anon','authenticated']) role_name
cross join unnest(array['group_conversations','group_members','group_messages']) table_name;
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in
 ('group_create_configured','group_set_addition_permission','group_leave'))
or (n.nspname='private' and p.proname in
 ('group_can_add','group_membership_mutate','group_send_guard'));
```

Expected: PostgreSQL 17-compatible baseline; all listed prerequisites present with reviewed definitions, enabled `group_admission_block_guard`, all direct client write flags false. Before first installation the two new columns, new functions and `group_send_guard` trigger must be absent. Stop on unexpected objects, overloads, disabled guards, direct write grants or unverified definitions. Presence of a signature alone does not establish a matching function body; retain the reviewed Stage 2B postflight evidence.

## Read-only postflight

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema='public'
and table_name='group_conversations'
and column_name in ('addition_permission','creator_departed');
select addition_permission, creator_departed, count(*)
from public.group_conversations group by 1,2 order by 1,2;
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid='public.group_conversations'::regclass
and contype='c';
select tgname, tgenabled, pg_get_triggerdef(oid)
from pg_trigger where not tgisinternal and
tgname in ('group_send_guard','group_admission_block_guard');
select signature, r as role_name,
 has_function_privilege(r,signature,'EXECUTE') as can_execute,
 p.prosecdef, p.proconfig
from unnest(array[
 'public.group_create_configured(uuid[],uuid,text,text)',
 'public.group_set_addition_permission(uuid,text,uuid)',
 'public.group_leave(uuid,uuid)',
 'public.group_remove_member(uuid,uuid)',
 'private.group_can_add(uuid,uuid)',
 'private.group_membership_mutate(uuid,uuid[],text,uuid,text)',
 'private.group_send_guard()'
]) signature cross join unnest(array['anon','authenticated','service_role']) r
join pg_proc p on p.oid=to_regprocedure(signature);
```

Expected: both columns NOT NULL, defaults `all_members`/false; initially all groups All Members and creator_departed true only for absent creators. Both relevant guards enabled. New public RPCs are SECURITY DEFINER with empty search_path and authenticated-only EXECUTE; the retired removal RPC and private helpers deny all three client roles. Repeat the preflight direct-write flags: all remain false. Compare original group/message/member/Study counts and trusted baseline snapshots where available; postflight catalog SELECTs alone do not prove data preservation or managed-service authorization.

## Verification and remaining hosted gate

The disposable harness reconstructs the supplied audited baseline rather than blindly replaying migrations. Run only locally:

```powershell
python supabase/tests/run_privacy_runtime.py --audit-directory C:/Users/night/Downloads --postgres-bin C:/Users/night/WebDevProjects/WolfieCompanion/supabase/.temp/postgresql-17.12-extracted/pgsql/bin --expected-major 17 --stage3a
```

It runs unchanged Stage 2A/2B gates first, then Stage 3A installation, original-row preservation, fixture rollback, three rejection/rollback cases (disabled guard, direct writes, inherited helper privilege) and seven observed-lock concurrency cases (settings versus addition, creator leave versus setting, admission after creator departure, two leave/send cases, direct block/add, last capacity place). SQL fixtures cover public non-friends/private friends, blocked-pair third-party admission, atomic failures, opt-out, ineligible accounts, legacy removal denial, fresh admission floors, stale leave/settings receipts, minimum eligible count, privileged insert denial and abandoned history. Local Auth identities/roles are stand-ins; this is not a Supabase hosted Auth/PostgREST/Storage/Realtime test.

Before hosted acceptance, use consenting creator/member/private-friend/blocked-pair/unrelated accounts. Check both modes, third-party versus direct blocked admission, self-leave at every size, creator return without privileges, preserved message attribution, read-only history/drafts below three and recovery after addition, no older history/picture/inbox/unread access after departure or re-addition, and account/reconnect isolation. Verify database changes notify/refetch the composer in the hosted transport. Blocker warnings, notification-bell changes, Study invitations and blocking UI are explicitly later work; their absence is not claimed as completed Stage 3 behavior.

## Recorded local results (2026-11-20)

- Prior complete PostgreSQL 17.12 run: `supabase/.temp/privacy-runtime/20261120T233952846361Z/results.json`, PASS; server stopped. That historical run verified pre-correction migration hash `95815cccd9d03a5ab2d8e30241b787dba880efa4d33cdd317102a7a00a00e65f`; the current candidate-only correction is verified separately below. Original-data projection and fixture rollback both verified. All seven Stage 3A observed-lock races passed, alongside the unchanged Stage 2A/2B gates. All three new rejection cases rolled back safely, including inherited helper EXECUTE privileges. Fixture coverage includes private-friend admission, nonfriend co-member identity and its revocation, actual messages during a creator's absence, non-writing retries below minimum, and old setting/leave receipts after creator re-addition.
- Client: all 23 group tests and 37 direct-message/unread/friendship tests passed. All 30 account tests passed in an isolated run. The combined five-file run reported 89/90 because the unchanged Campus Explorer lazy-import test exceeded its Testing Library wait while other suites ran; the complete account file then passed alone without code/test timeout changes. This timing sensitivity remains a local test limitation, not a claim that the combined invocation passed.
- Server picture authorization: 9/9 focused mocked tests passed. TypeScript/client production build, client lint, strict OpenSpec validation and `git diff --check` passed. Build retains the existing large-chunk warning; no bundling redesign was included.
- Synthetic desktop 1280px and mobile 375px Chrome flows passed: creation/retry, generic admission failure, any-member controls, sequence floors, unread/paging/scroll, self-leave, creator departure, small-group read-only/recovery, re-addition and account teardown. Screenshots are local-only in the operating-system temporary directory.
- Stage 1/2A/2B migration hashes are unchanged. Runtime databases, binary archives, logs and screenshots remain ignored or outside version control. No live database connection, production SQL, deployment, commit or push occurred.

## Focused candidate-privacy correction verification

The migration changes only the candidate response projection (plus its explanatory comment): consent-derived fields become constant true/null. Admission enforcement, filters, locks, grants and triggers are unchanged. The SQL regression now checks that a discoverable opted-out student remains selectable without revealing consent, and that toggling only consent leaves the complete candidate row identical in both creation and existing-group picker contexts.

Focused PostgreSQL 17.12 verification passed in the existing stopped disposable cluster, restarted only on loopback. Results: `supabase/.temp/candidate-consent-20261121T030057Z/results.json`. The test ran the directly affected fixture portions and replaced only the candidate function inside a rollback transaction. The new regression correctly rejected the old projection, then passed with the corrected definition. Private-friend visibility, private-nonfriend/block/ineligible exclusion, atomic whole-batch denials and generic consent failures during creation/addition all passed. Function/data rollback was verified and the server was stopped.

No full runtime harness, concurrency tests, browser tests, or hosted connections were run for this correction. Lint/build were unnecessary because frontend/application code and the response shape did not change. The full earlier runtime report remains historical evidence for unchanged behavior; its hash must not be mistaken for the corrected migration hash above. Use the current file/hash for manual deployment review, retaining the existing prerequisite, cutover and hosted acceptance steps.
