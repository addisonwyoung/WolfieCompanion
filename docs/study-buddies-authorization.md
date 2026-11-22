# Stage 3B: Study Buddies privacy and authorization

Prepared locally for owner review. No hosted database connection, migration execution, deployment, commit or push by the agent.

## Migration and prerequisites

Apply only `supabase/migrations/202611210002_study_buddies_authorization.sql` after separate approval. SHA-256: `6d69850746fd465215643280663488ff8ce3d8f731fe13a5161e0287f5ad44dc`.

Prerequisites: the supplied audited Study tables and installed Stage 1, 2A, 2B and corrected Stage 3A. Do not replay repository history. Installation rejects missing required helpers/Stage 3A RPC, a disabled Study admission guard or direct client Study-table access; it also checks effective new helper/RPC and retired-function grants. Unexpected existing new objects/overloads require review, not automatic dropping. This is a one-time transactional migration with a five-second lock timeout, not an idempotent script.

The migration adds four nullable group fields for professor/semester/integer academic_year and three nullable membership fields for actual inviter, invitation generation and database issuance time. It adds one private, RLS-enabled request-receipt table. Receipts do not cascade with invitations or groups: old retries must not recreate deleted groups or extend expired invitations. They are private operation deduplication metadata, not a membership ledger or academic archive. The existing composite membership key, status constraint and availability cascades remain.

No calendar/enrollment data or helpers, existing profile preferences, DM/group-chat authorization or Stage 1-3A migration files are changed. Existing Study rows receive null new context/provenance; no existing data is inferred, reassigned, deleted or granted a new seven-day window. Existing account-deletion foreign-key behavior is unchanged; this stage covers voluntary departure through the supported RPCs.

## Inventory preservation and legacy policy

The owner's pre-3B CSVs report one CSE 416 group (`c61b70c9-3db6-498b-831f-8f6cbea3964c`), four accepted memberships, zero pending invitations, one task and eight availability rows, with a valid accepted owner and no nonaccepted availability. Its section is null. Preserve its group, accepted members, task and availability, and keep new admissions closed until explicit separately reviewed reconciliation supplies confirmed offering context. Do not copy the current owner's mutable enrollment or guess historical fields. Accepted collaboration continues without requiring reconciliation or current course enrollment.

If new unverifiable legacy invitations appear before cutover, they remain dismissible but non-acceptable and non-reserving. A new eligible invitation may replace an expired/unverifiable pending row only after all current issuance checks, with a new generation. Recheck inventory at cutover; investigate orphaned owners, nonaccepted availability or over-capacity accepted memberships before installation.

## Authorization and lifecycle

- Creation and additional invitations use exact verified course/section/professor/current semester/existing integer academic_year. Group context is stable across ownership changes. Use the existing semester_calendar and term resolver without modifications or new year infrastructure.
- Any eligible accepted member in the offering may issue invitations. Public classmates need no friendship; private targets require the actual inviter's accepted friendship. Copied UUIDs cannot bypass this. Check bilateral blocks only between actual inviter and target, not against all co-members. `allow_group_additions` and DM preferences do not gate Study participation.
- Verified issuance is contextual consent. Later privacy/friendship changes, inviter departure or inviter ineligibility alone do not invalidate acceptance. Acceptance still checks recipient/session, group, generation, account, exact current offering, original-inviter blocks, deadline and capacity. It creates no friendship, DM authority or general discovery access.
- Each new invitation expires exactly 168 hours after a trusted database timestamp. At or after the deadline it is non-acceptable and non-reserving. Time is checked after group/pair/profile waits. No cron, client timer or cleanup is needed for correctness. Existing accepted memberships never expire.
- Capacity is accepted members plus verified unexpired pending invitations, at most eight. Expired/unverifiable pending rows remain until dismissal or authorized fresh replacement. Blocking/ineligibility alone does not release an active reservation or disclose a block through capacity counts.
- Accept/decline identify the recipient's current generation. A null generation permits only guarded dismissal of an unverifiable legacy row. Old accept/decline requests cannot affect a replacement; request replay cannot renew deadlines, replace the inviter, undo a decline, leave a later membership or resurrect a deleted group. Invalid batches roll back entirely.
- Pending/expired recipients get safe invitation metadata, no current owner, roster, availability or tasks. Accepted members get accepted identities and active pending counts. Minimal outgoing invitation identity is limited to the accepted actual inviter; its projection has no block-dependent names/status flags. This contextual record does not authorize full profiles or general lookup.
- Accepted members retain shared tasks/notes, availability and common meeting-time calculations despite privacy or co-member blocks. Resource mutations take the same group lock and recheck accepted membership after waiting; existing author/owner safeguards remain. Voluntary leave removes active membership/availability, preserves remaining data and transfers ownership deterministically. Final accepted-member departure deletes the Study group and invalidates pending invitations.
- Group-unavailable responses are generic. Durable unavailable notifications, block warnings, notification-bell integration and Block/Unblock UI remain Stage 3C. There is no Study group messaging, historical membership tracking or contribution recovery.

## Client cutover and manual deployment order

1. Review this migration, inventory and local evidence. Verify a fresh application-schema backup/restore listing. Repeat the read-only schema/count preflight below against the intended project; stop on unexpected drift.
2. Build the matching React/Express application, but stop the running local app and close all existing tabs before SQL execution. Express shutdown alone does not stop browser Supabase RPCs. The new client uses `study_create`, `study_invite`, `study_respond`, `study_leave` and `study_invitation_candidates`. The old section-only create/group-id-only response/leave RPCs are intentionally retired; old clients must refresh.
3. After approval, the owner executes the entire new migration once in Supabase SQL Editor, preserving its transaction. Never run the fixtures, baseline builder or runtime scripts against hosted Supabase. On lock timeout or any failure, confirm rollback and investigate active clients; do not remove safeguards or partially apply statements.
4. Run postflight catalog and inventory checks. Confirm the legacy group/data/context are unchanged. Do not populate missing offering/provenance as part of this deployment.
5. Restart the matching local application and hard-refresh clients. With consenting accounts, verify the hosted checks below. Installation success alone is not managed-service authorization verification.

The ALTER TABLE/constraint/trigger/function work takes transactional locks on Study tables. Nullable columns avoid a data backfill, but table locks and constraint validation still require a controlled window. A failed transaction rolls back; after successful deployment, do not restore old permissive RPCs or drop fields with new invitations present. Use a reviewed forward correction or coordinated backup restore.

## Read-only owner checks

Preflight: confirm new fields are absent before first installation; existing fields/constraints match the supplied four CSVs. Existing direct anon/authenticated Study-table privileges must all be false. The Study admission guard must be enabled.

```sql
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('study_groups','study_group_members','study_group_tasks','study_group_availability')
order by table_name,ordinal_position;
select tgname,tgenabled,pg_get_triggerdef(oid)
from pg_trigger where tgrelid='public.study_group_members'::regclass and not tgisinternal;
select r as role_name,t as table_name,
 has_any_column_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE') as can_access_columns,
 has_table_privilege(r,'public.'||t,'DELETE') as can_delete
from unnest(array['anon','authenticated']) r
cross join unnest(array['study_groups','study_group_members','study_group_tasks','study_group_availability']) t;
select
 (select count(*) from public.study_groups) as groups,
 (select count(*) from public.study_group_members where status='accepted') as accepted_memberships,
 (select count(*) from public.study_group_members where status='pending') as pending_rows,
 (select count(*) from public.study_group_tasks) as tasks,
 (select count(*) from public.study_group_availability) as availability_rows;
```

Postflight: repeat the direct-access/count/trigger checks above. Expect seven new nullable fields, the expanded Study admission trigger enabled, no direct client access, and the supplied 1/4/0/1/8 totals if no authorized intervening activity occurred. Check the existing group's section and new context remain null. New private receipt-table client grants must be absent and RLS enabled.

```sql
select id,course_section,professor_first_name,professor_last_name,semester,academic_year
from public.study_groups where id='c61b70c9-3db6-498b-831f-8f6cbea3964c';
select signature,r as role_name,has_function_privilege(r,signature,'EXECUTE') as can_execute,
 p.prosecdef,p.proconfig
from unnest(array[
 'public.study_create(text,text,text,text,text,uuid[],uuid)',
 'public.study_invite(uuid,uuid[],uuid)','public.study_respond(uuid,uuid,boolean,uuid)',
 'public.study_leave(uuid,uuid)','public.study_invitation_candidates(text,text,text,text,uuid,text)',
 'public.create_study_group(text,text,text,uuid[])','public.respond_to_study_group_invite(uuid,boolean)',
 'public.leave_study_group(uuid)','private.study_issue(uuid,uuid[])'
]) signature cross join unnest(array['anon','authenticated','service_role']) r
join pg_proc p on p.oid=to_regprocedure(signature);
select relrowsecurity from pg_class where oid='private.study_requests'::regclass;
select r as role_name,has_any_column_privilege(r,'private.study_requests','SELECT,INSERT,UPDATE') as can_access,
 has_table_privilege(r,'private.study_requests','DELETE') as can_delete
from unnest(array['anon','authenticated','service_role']) r;
```

Expected new public RPCs: authenticated-only EXECUTE, SECURITY DEFINER, empty search_path. Retired public RPCs and private helper deny all three client roles. The unchanged resource/list RPCs retain their reviewed ACLs and derive the caller from the session. Compare installed function bodies to the reviewed migration, not signatures alone.

## Local verification and hosted limits

The focused runner creates a NEW verified loopback PostgreSQL 17.12 cluster from the supplied audited baseline, installs the explicit Stage 1-3A prerequisites and this migration, and stops it in finally. It accepts no production connection strings and strips inherited libpq environment overrides. Temporary databases/logs/binaries stay under ignored `supabase/.temp`.

```powershell
python supabase/tests/study_buddies_runtime.py --audit-directory C:/Users/night/Downloads --postgres-bin C:/Users/night/WebDevProjects/WolfieCompanion/supabase/.temp/postgresql-17.12-extracted/pgsql/bin
```

The preservation gate recreates the supplied 1-group/4-accepted/1-task/8-availability shape with synthetic identities/content. It compares all original public/private table rows, projecting out only new columns, before and after installation and rolled-back fixtures. It also compares existing DM/group/block/term-helper definitions. It does not claim to restore or inspect actual hosted student data.

Final database evidence: `supabase/.temp/privacy-runtime/20261121T200216301375Z/results.json`, PostgreSQL 17.12, PASS, server stopped, migration hash above. Installation, disabled-guard/direct-access rejection rollback, original data preservation, unchanged Stage 1-3A function definitions and fixture rollback passed. Fixtures cover private creators/friends, private UUID denial, exact offering mismatches, pending enrollment, ineligible accounts, both block directions/third-party acceptance, privacy/unfriend after issuance, departed/ineligible inviter, scope-safe projections, expiration, old generations/receipts after decline/reissue/deletion, non-reserving legacy invitations, shared resources and retired/anonymous access.

All eight observed-lock concurrency cases passed: final capacity place; member departure before invitation; original-inviter block before acceptance; expiry during a group-lock wait; departure before task completion; last accepted owner leaving before acceptance; inviter departure with remaining accepted members; reissue before a stale decline. An earlier fixture incorrectly attempted a direct authenticated table read; that was correctly denied and the lock-holder was corrected to use the authorized availability RPC.

Client evidence: 58 focused Study/group/direct-messaging tests passed. Client TypeScript/production build and lint passed, retaining the existing large-chunk build warning. Strict OpenSpec validation and final diff checks are recorded in the review. No native browser or hosted Auth/PostgREST/Storage/Realtime verification is claimed for this stage.

Owner-hosted acceptance requires consenting accounts: private friend/non-friend, public classmate, wrong offering/unverified enrollment, actual inviter, blocked pair and independent inviter. Check safe pending/expired views, no peer pending identities, direct-UUID denial, both block directions, legitimate acceptance after privacy/unfriend/inviter departure, generic failures, eight-place capacity, stale tabs/replacement generations, retry/account isolation, preserved academic work, voluntary leave/succession and unavailable final groups. Inspect desktop/mobile layouts and managed authorization behavior. Stage 3C warning/notification acceptance remains separately pending.

## Hosted deployment record — November 21, 2026

The following outcomes were verified by the owner/team and reported to the agent; the agent did not execute hosted SQL:

- `202611210002_study_buddies_authorization.sql` was successfully executed in hosted Supabase SQL Editor.
- A pre-deployment backup was created and its PostgreSQL custom archive listing verified. This confirms archive listing verification, not a full backup restore test.
- Hosted preflight and postflight checks passed, including preservation of existing Study Buddies data, expected RPC permissions, RLS and restricted direct table access.
- Manual browser smoke testing created a new CSE 416 Study Buddies group with two invitations. Hosted database queries confirmed one accepted member and two active pending invitations, each with valid provenance and a 168-hour expiration.
- The frontend displayed both pending invitations and their expiration dates correctly.

Recipient-side acceptance, declining and privacy behavior remain untested pending access to consenting student accounts. These deployment and smoke-test outcomes do not constitute complete end-to-end verification. Earlier local verification and hosted-limit statements above describe the evidence available at preparation time; this dated record adds the subsequently reported hosted results.
