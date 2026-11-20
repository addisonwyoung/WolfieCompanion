# Student privacy: Stage 2A authorization

Status: Stage 2A passed the complete scoped disposable suite on PostgreSQL 17.12 and 18.0. The owner supplied PostgreSQL 17.11 live preflight with blocks 2-7 passing. The same-major PostgreSQL 17 hold is cleared; exact hosted patch/platform and managed-service integration remain limitations. No live connection, live credentials or production SQL execution occurred. See [runtime evidence](student-privacy-runtime-verification.md).

## Baseline and scope

Use the five supplied live Supabase audit exports and the subsequent Stage 1 verification, not repository migration history, as the deployment baseline. The live project already has owner-only profile RLS, authenticated profile table grants, trusted Google/SBU eligibility helpers, canonical friendships, pending friend requests, professor-aware discovery, DM participants/messages, active messaging memberships with sequence floors, and course-section Study Buddies. Stage 1 added the three settings and the directed block table. No migration ledger was found.

This stage adds one ordered, run-once migration: `supabase/migrations/202611190002_student_privacy_authorization.sql`. It does not add columns, backfill settings, recreate tables, alter publications, or introduce membership history. It replaces audited function signatures in place. Existing ACLs are preserved except for explicit retirement of six legacy overloads and explicit service-only avatar resolver ACL resets; new RPCs have explicit grants and fixed security-definer search paths. The migration fails on missing checked prerequisites, unexpected overloads in the checked discovery/avatar families, or conflicting new object names.

## Security behavior

| Boundary | Stage 2A behavior |
|---|---|
| University-wide `friend_directory` | Eligible public peers across majors/courses, including accepted public friends; excludes all private targets, self and either-direction blocks. Existing Add friend UI still omits accepted friends. |
| General profile and picture lookups | Eligible unblocked public target or accepted private friend. Explicit profile projections retain optional per-field sharing; no email, detailed schedule, permission settings or storage path is exposed. |
| Current offering discovery/recommendations | Existing verified current-semester course/section/professor check plus public-target and bilateral-block filtering. Private callers may discover public classmates. |
| Friendship-scoped profiles/relationships | Private accepted friends remain authorized; a pending request or shared chat alone does not grant a private full-profile lookup. Inbox retains the minimal identity of someone who intentionally sent a request, subject to eligibility and blocks. |
| Legacy section-only discovery | Six unused section-only RPCs/resolvers become non-executable by client/service roles. Their owner can still administer them. Current application APIs use professor-aware alternatives. |
| Raw tables/storage | Existing owner-only profile policies, participant relationship reads, storage policies and denied direct social writes are unchanged. New helpers do not make raw peer profiles readable. |
| Block/unblock | Session-derived eligible caller only; self/null target denied; directed insertion idempotent. Blocking atomically deletes canonical friendship and marks either-direction pending requests declined. Unblocking deletes only the caller's row, without restoring relationships. Existing Stage 1 owner-only block listing remains. |
| Existing/new DM writes | Bilateral block check at message insertion, serialized with blocking. New contact also checks target discoverability before creating a thread. Histories and committed retry results remain. Three-level mutual preference enforcement is deferred to Stage 2B. |
| Existing shared groups | Blocking does not remove members, hide authorized contextual identity, or stop shared-group messages/collaboration. It does not grant general profile or DM access. |
| New blocked-pair admissions | Narrow block-only guards reject new messaging blocked pairings. Study creation checks all selected pairs; Study acceptance checks accepted members, not other pending invitees. Unchanged accepted Study membership is not revalidated by the guard. Existing roles, consent, eligibility and retention behavior otherwise stays in place. |
| Group identity and pictures | `group_member_identity(group,student)` returns only ID/name/picture availability for eligible active co-members. `/api/group-picture` independently rechecks membership via service-only `resolve_group_avatar` and downloads only the current target-owned path. General avatar sharing and friendship are unnecessary inside that group, even for blocked existing co-members. |
| Former group authors | Existing group message projection retains name attribution subject to existing history authorization. Former members do not gain active group picture/profile access; historical attribution does not return unrelated private fields. |

The supplied live RPC audit reports explicit `{postgres, service_role}` execution on `resolve_friend_avatar(uuid,uuid)` and `resolve_classmate_avatar_by_professor(uuid,uuid,text,text,text,text)`, with effective anonymous/authenticated execution false. The retired section-only resolver has the same baseline. There is no client impersonation path in those audited grants. The migration now explicitly revokes PUBLIC/anon/authenticated/service grants on the two supported existing resolvers, grants back only service execution, and checks effective privileges (including inheritance) for those and the new group resolver before committing. An unexpected unsafe inherited grant aborts the transaction; effective denial is also asserted for all six retired functions. No client receives avatar paths. The existing private helper accepting `p_caller_id` is owner-only in the audit; new arbitrary-caller privacy helpers are likewise not client-executable.

The new group picture endpoint uses verified bearer identity, rejects extra/forged query parameters, validates/re-encodes image bytes and uses `private, no-store`. The general friend-picture route now uses the same `get_discoverable_profile` projection as the client; both caller and service-role stages enforce general visibility.

No block notification is created and the block table remains unpublished. Existing friendship/request change events may cause participants to refresh their own relationship state; relationship disappearance cannot be made undetectable. Errors do not identify the blocker. Existing participant-visible DM history/unread remains; rejected insertions create no message or new-message event. Hosted Realtime subscription revocation and client cache invalidation have not been exercised here.

## Concurrency and preservation

Blocking, friend sends/acceptance and DM insertion share the existing canonical DM advisory pair-lock key. Friend acceptance locks the pair before its request row and rereads pending status, preventing stale acceptance after blocking. New-contact writes lock the target profile so concurrent private-mode changes serialize. Messaging mutations acquire ordered participant-pair locks before existing friendship key-share locks; Study creation does likewise before membership inserts and rejects any newly introduced blocked pair.

Study invitation response and departure first check caller membership without a lock, then lock the existing Study group row **before membership rows** and recheck authorization. Unrelated callers cannot use these RPCs to lock arbitrary groups. Acceptance then rechecks current accepted peers under admission pair locks. This prevents two concurrently accepting blocked pending invitees from both becoming active, while allowing an otherwise safe acceptance when the blocked counterpart is still only pending. Decline still deletes its pending membership; leaving and existing ownership succession retain their original behavior. No new role, membership store or retention model is introduced.

| Path | Lock ordering |
|---|---|
| Block/unblock | Canonical pair, then block/friendship/request mutation. |
| Friend send | Canonical pair, target profile share lock, request insertion. |
| Friend response | Canonical pair, request row, friendship insertion. |
| DM send | Canonical pair, conversation row, target profile for first contact, message insertion guard. Exact committed replay returns its existing row. |
| Messaging admission | Request receipt advisory lock, existing group row, canonical ordered participant pairs, sorted selected profiles, friendship key-share, memberships. |
| Study creation | Canonical ordered selected pairs, new group and memberships. |
| Study response | Existing Study group row, caller's pending membership row, ordered active-peer pair locks on acceptance. |
| Study departure | Existing Study group row, membership/ownership updates or group deletion. |

No reviewed application path takes a pair lock and subsequently waits on an existing messaging/Study group row. Group operations take that row first; their locks serialize membership changes within the group. This source review identifies no remaining cycle among these supported paths, but is not proof of deadlock freedom. Direct administrative multi-operation transactions can take other orders and require their own review. Test actual PostgREST READ COMMITTED behavior, trigger snapshots after waits and statement timeouts in a disposable database.

The database owner still has privileged write access. Guards are defense in depth for application entry points, not a restriction on trusted administration. SQL installation, authorization fixtures, effective-grant rejection cases and ten deterministic concurrency schedules passed in scoped disposable PostgreSQL 17.12 and 18.0 baselines. This is not proof of deadlock freedom or hosted integration parity; local TypeScript tests alone do not establish database behavior.

All pre-existing records are preserved at deployment. Only a later intentional block call removes its friendship/invalidates pending requests. It never deletes conversations, messages, enrollments, memberships or Study data. No preference values/defaults are changed, and optional field-sharing flags remain authoritative outside the limited shared-group identity exception.

## Prerequisites and manual execution order

1. Review the [completed disposable runtime verification](student-privacy-runtime-verification.md), its audit hashes, scope and limitations. The local installation/fixture/concurrency gate passed. Repeat against updated audit inputs if the baseline or migration changes; verify hosted preconditions before live deployment.
2. Confirm Stage 1 is deployed once with the verified columns/defaults, block constraints/reverse index, owner-only block read RLS and no client block writes. **Do not rerun Stage 1 or historical migrations.** Compare the function/policy catalog if other changes occurred since the supplied audit. Verify the `avatars` bucket exists with `public=false`; the supplied schema/ACL exports do not establish its actual bucket-row configuration. The migration fails closed if it is missing/public and does not change storage data or configuration. Required dependencies include eligibility, professor/section, DM and group helpers, existing social tables and private mutation receipts. Existing function argument/return types must match the audit; unexpected checked overloads cause failure.
3. Deploy the **compatible client first** and refresh existing sessions/tabs. The widened directory parser works before the SQL, but the earlier deployed parser rejects the new `accepted` relationship value if it receives a public friend from `friend_directory`. The Add friend UI continues to suppress accepted friends. This rollout detail matters even though no retired RPC is called by current source. Confirm the deployed build is the reviewed one; source inspection cannot establish which build is running live.
4. Pause/drain active social writes for the migration window so calls already running old function bodies cannot cross the authorization cutover. With the project owner SQL Editor role, submit **the entire `202611190002_student_privacy_authorization.sql` file once**. It contains a transaction and five-second lock timeout. Function/trigger DDL can briefly block calls/writes. Failure rolls back the transaction; investigate before rerunning the whole file. Do not execute fragments, replay the migration directory, or drop existing tables/functions to force success.
5. Run the read-only catalog queries below and record the filename/outcome in the manual deployment record. The transaction's effective-avatar and retired-function grant assertions must succeed. Use the normal administrator PostgREST schema-cache refresh procedure if new signatures are not recognized.
6. Deploy the compatible server, resume social writes and perform hosted eligible-session smoke tests. Existing professor-aware signatures are retained. The group-picture route requires the existing publishable/service-role configuration and fails closed if SQL or configuration is missing. No active screen currently calls the new route, so it can also be predeployed dormant. No new settings UI is released here. Stop after Stage 2A.

This is not safely reversible by dropping the new helper functions: replaced RPCs depend on them. On migration failure, transaction rollback preserves the baseline. After successful deployment, prefer a reviewed forward fix; restoring old RPCs would reopen privacy/block bypasses. An application rollback alone can leave the stricter database rules intact. Do not restore friendships automatically or delete block/settings data as rollback.

## Read-only verification (owner runs manually)

These queries inspect catalog state only; they do not impersonate students, write fixtures, call mutation RPCs or prove RLS behavior for real sessions.

```sql
-- Run BEFORE migration too; compare the hosted major version with the tested PostgreSQL 18.
select version();

-- Expected: one avatars row with public=false.
select id, "public", file_size_limit, allowed_mime_types
from storage.buckets where id='avatars';

-- New public functions: fixed search paths, owner, definer status and ACLs.
select p.oid::regprocedure as signature, r.rolname as owner,
       p.prosecdef, p.proconfig, p.proacl
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
join pg_roles r on r.oid=p.proowner
where n.nspname='public'
  and p.proname in ('block_student','unblock_student',
                   'group_member_identity','resolve_group_avatar')
order by p.oid::regprocedure::text;

-- Every retained overload and grant in the affected families; compare audit.
select p.oid::regprocedure as signature,
       has_function_privilege('anon',p.oid,'execute') as anon_execute,
       has_function_privilege('authenticated',p.oid,'execute') as client_execute,
       has_function_privilege('service_role',p.oid,'execute') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
 'find_classmates','find_classmates_by_professor',
 'course_recommendation_profiles','course_recommendation_profiles_by_professor',
 'course_friend_relationships','course_friend_relationships_by_professor',
 'get_classmate_profile','get_classmate_profile_by_professor',
 'get_discoverable_profile','get_friend_profile','friend_directory',
 'send_friend_request','send_friend_request_to_student',
 'send_friend_request_to_classmate','respond_to_friend_request',
 'resolve_classmate_avatar','resolve_classmate_avatar_by_professor',
 'resolve_friend_avatar','block_student','unblock_student',
 'group_member_identity','resolve_group_avatar'
) order by p.oid::regprocedure::text;

-- Expected: three enabled block guards; retain existing triggers too.
select c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid
where not t.tgisinternal
  and t.tgrelid in ('public.dm_messages'::regclass,
                   'public.group_members'::regclass,
                   'public.study_group_members'::regclass)
order by c.relname,t.tgname;

-- Profile ownership and block listing policies should be unchanged from Stage 1.
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public'
  and tablename in ('profiles','student_blocks','friendships','friend_requests')
order by tablename,policyname;
select role_name,
       has_table_privilege(role_name,'public.student_blocks','select') as can_read,
       has_table_privilege(role_name,'public.student_blocks','insert') as can_insert,
       has_table_privilege(role_name,'public.student_blocks','update') as can_update,
       has_table_privilege(role_name,'public.student_blocks','delete') as can_delete
from (values ('anon'),('authenticated')) roles(role_name);

-- No public/client helper execution; existing group_floor/is_eligible differ by design.
select p.oid::regprocedure as signature,p.proconfig,
       has_function_privilege('anon',p.oid,'execute') as anon_execute,
       has_function_privilege('authenticated',p.oid,'execute') as client_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private' and p.proname in (
 'students_blocked','student_friend','student_visible','student_pair_lock',
 'dm_block_guard','group_admission_block_guard','study_admission_block_guard'
) order by p.oid::regprocedure::text;
```

Expected public grants: authenticated execution on block/unblock and group identity; service-role-only execution on `resolve_group_avatar`; no anonymous execution. All six section-only overloads listed in the migration should have no client/service execution. The two supported existing avatar resolvers and the new group resolver must be service-role-only; other current professor-aware RPC grants remain as audited. `student_blocks` remains authenticated SELECT only, subject to its owner RLS.

## Tests and release limitations

Database runtime checks now passed in disposable PostgreSQL 17.12 and 18.0 clusters: migration installation, populated-record preservation, 43 fixture assertions plus denial checks, six unsafe migration rejection cases, and ten observed-lock concurrency cases. The test server was stopped. Details and evidence are in [the runtime report](student-privacy-runtime-verification.md).

Previously completed application checks (production application code did not change during runtime verification):

- Client: 257 tests across 28 files passed with `npm test -- --maxWorkers=2`. The initial unrestricted-parallel run had eight timing/navigation failures; all passed on the reduced-worker rerun without application changes.
- Server: all 29 tests passed, including group picture request validation, caller-derived identity, separate service-client resolver arguments, revocation between caller lookup and path resolution, current-path re-resolution and denial after membership/configuration loss.
- Client ESLint and production build passed; Vite reports large output chunks. Server TypeScript `--noEmit` passed.
- Strict OpenSpec validation and `git diff --check` passed. A read-only source comparison confirmed replaced function signatures, return types, volatility, definer status and search-path settings match the owner's exported live definitions. This is not SQL parser/runtime validation.

`supabase/tests/student_privacy_authorization.sql` is a rollback-only synthetic **disposable-database** fixture, not a production SQL Editor verification script. It assumes the audited baseline plus Stage 1/2A are installed and uses the repository's minimal test Auth stand-ins. Do not run it against the live project. It covers public/private/friend/group lookup, exact sensitive-field exclusions, bilateral blocking, idempotence, stale acceptance, preserved history, self/ineligible/anonymous denial, legacy/helper/resolver ACLs, direct-write denial, active/former group identity boundaries, forged-caller resolver denial, service-role private-friend versus non-friend resolution, Study pending-to-active blocking, unchanged accepted collaboration, departure and committed DM replay after blocking.

The Stage 2A SQL fixture, installation and scoped concurrency checks have now run successfully on both disposable engine versions. Older SQL regressions that reinstall superseded definitions were not replayed. The baseline reconstructs audited social authorization objects and explicitly models missing supporting/Auth/Storage columns; it is not a complete live clone. Hosted Auth, PostgREST, Storage and Realtime still require separate operator smoke checks; no live connection was made.

Later-stage limits remain explicit: `dm_permission` and `allow_group_additions` are stored but are not the active runtime preference model yet; legacy `allow_new_dms` still governs the old admission checks. DM course-only eligibility remains until Stage 2B. Group creator authority, friend-only additions, peer removal, leave behavior and picker changes remain for Stage 3. Study candidate selection, pending-content isolation, privacy-aware admission and retention remain for Stage 4. The only Study/messaging admission changes here are bilateral block guards and supporting lock ordering, including Study response/departure group-row serialization. Existing UI privacy copy, cache-refresh/block controls and full group-picture rendering are not delivered by this API stage.


## Final review findings and runtime test gate

The review corrected implicit avatar ACL reliance, pending-as-active Study checks, unnecessary revalidation of unchanged accepted Study rows, and the client-first rollout requirement. It also added a private-avatar-bucket prerequisite, because schema/RLS exports cannot establish the bucket public flag. Current source uses `find_classmates_by_professor`, `course_recommendation_profiles_by_professor`, `course_friend_relationships_by_professor`, `get_classmate_profile_by_professor`, `send_friend_request_to_classmate`, and server-only `resolve_classmate_avatar_by_professor`. A source search found no calls to the six retired names in `client/src` or `server/src`; Study candidates reuse the professor-aware classmate adapter today. Its planned section-only picker/privacy changes remain Stage 4 work. Existing group and Study RPC signatures, member count limits, message/history reads and academic ownership policies remain intact.

**Readiness: the complete scoped PostgreSQL 17.12 and 18.0 suites passed.** The owner-supplied live metadata preflight also passed. Stage 2A is ready for operator review and controlled manual deployment after confirming the preflight remains current and deploying the compatible frontend first. This is not deployment authorization or a complete Supabase integration result. The following matrix describes executed schedules; exhaustive races and hosted integration remain unverified:

| Race / case | Expected result |
|---|---|
| Hold block pair lock, then attempt friend send/accept or new/existing DM send; commit block | Waiting operation observes block and fails; no friendship/message/empty thread is created. |
| Hold an authorized send transaction before block; commit send, then block | The earlier send remains historical; block completes; a fresh send fails. Exact committed retry remains non-writing. |
| Group admission versus block with another member | Pair locks determine order; block-first admission fails atomically, admission-first membership remains as an existing shared context. Test create/add and unrelated safe additions around existing blocked co-members. |
| Two pending Study peers block each other, then accept concurrently | Group-row serialization permits at most one acceptance; the second sees the newly active blocked peer. Neither request deadlocks. Decline remains available. |
| Study accept versus owner/ordinary departure | Same group row serializes operations; verify accepted memberships, original owner succession and final-group deletion preserve baseline behavior. |
| First contact/friend send versus private-mode update | Target profile locks determine order; private-first non-friend contact fails. Established conversation sending is unchanged except blocks until Stage 2B. |
| Avatar roles and private co-members | Anonymous/authenticated cannot call any caller-ID resolver, even supplying an authorized friend's UUID. Service resolution denies private non-friends and blocked general access; active group co-members retain only contextual identity/pictures. Removed caller/target membership denies current group identity/pictures, with authorized message attribution retained. |

Read-only catalog checks alone cannot establish row-policy behavior, function/trigger execution, deadlock absence, PostgREST role propagation, effective schema configuration, hosted Auth/Realtime delivery or cache behavior. Picture resolution authorizes at request time; data already delivered or already being downloaded cannot be recalled by blocking. `private, no-store` and fresh resolver checks protect subsequent requests. Keep the existing Stage 4 pending-Study-content exposure limitation explicit; this pass does not claim to complete that privacy release.
