# Student privacy: Stage 1 database foundation

Status: SQL generated for review only; not executed against any database.

## Scope and live baseline

The five owner-supplied live inspections establish existing owner-only `profiles` RLS, `allow_new_dms boolean NOT NULL DEFAULT true`, optional sharing controls, trusted `private.is_eligible()`, and existing friendship/DM/group/Study Buddy tables. They show no new privacy/permission/group-consent columns or block table. The live migration-history table is absent; repository filenames do not prove application. Existing message/friendship publications remain unchanged.

Only `supabase/migrations/202611190001_student_privacy_foundation.sql` is needed for this stage. Do not replay the historical account, prerequisite, messaging or group scripts. In particular, the campus prerequisite script creates a schema that already exists live.

## Changes

| Object | Initialization and protection |
|---|---|
| `profiles.is_private` | Boolean, non-null, false for existing and new accounts (public). |
| `profiles.dm_permission` | Non-null constrained text: `eligible_students`, `friends_only`, `no_one`. Existing true maps to eligible-students; false maps to no-one. New-account default: eligible-students. |
| `profiles.allow_group_additions` | Non-null boolean initialized true for every existing account and defaulting true for new accounts, independent of legacy DM consent. |
| `student_blocks` | Directed unique UUID pair with Auth-user foreign keys, self-block denial and creation timestamp; reverse index supports either-direction lookup. |
| Block access | RLS enabled; eligible callers can SELECT only blocks they themselves created. No direct client writes, no peer-readable reverse block list and no Realtime publication addition. |

The block table starts empty. No friendships, requests, conversations, messages, memberships, enrollments, optional sharing values or academic records are deleted or modified. The legacy preference remains unchanged. Existing profile update triggers can advance `profiles.updated_at` when the new fields are seeded; other saved profile values and IDs remain intact. Auth account deletion cascades its block rows; voluntary block/unblock is not implemented in this stage.

## Compatibility and stage boundary

This is storage preparation, not an enforceable privacy release. Existing RPCs continue using `allow_new_dms`; discovery does not yet honor `is_private`, and sends do not yet honor the new three-level values or blocks. The seed value `no_one` does not freeze existing chats until the later RPC authorization stage. Do not expose new settings or block controls as operational features yet.

The existing profile ownership policy and table grants also cover the new settings columns. Peer raw profile reads remain denied; no new settings are added to peer RPC projections. Existing owner profile loads may now receive the extra columns, but existing client updates still explicitly write the legacy field. No client schema integration is included.

Audit 2 confirms authenticated table-level SELECT/INSERT/UPDATE/DELETE on `profiles` and the sole `profile_owner` ALL policy with both USING and WITH CHECK requiring `id = auth.uid()` and `private.is_eligible()`. Those table grants extend to newly added columns. Eligible authenticated users can therefore read/update their own new settings through a direct authorized profile request, while the unchanged row policy denies other students' rows and ownership reassignment. No additional profile grants or policies are needed. This is a metadata-based conclusion; no impersonated-session SQL test was run. The current frontend does not yet provide controls or send updates for these fields.

The DM boolean mapping is a point-in-time snapshot. Legacy client changes to `allow_new_dms` after this migration do not synchronize `dm_permission`; before the later canonical-settings cutover, reconcile legacy DM changes and define the supported-client transition. `allow_group_additions` is intentionally independent: do not copy or synchronize the legacy flag into it, even for previous opt-outs. Do not blindly rerun this backfill over intentional new choices. No synchronization trigger or obsolete-write rejection is added here because that would change current application behavior beyond Stage 1.

Current frontend `accountApi.saveProfile` uses an explicit update allowlist that omits the new fields, so legacy profile saves do not overwrite them. Owner loads use `ensure_profile()` (the existing composite profile return type) and tolerate extra fields. Current backend picture authorization and social RPC signatures are unchanged. Existing group RPCs still consult `allow_new_dms`: a previous DM opt-out remains unable to receive new group additions under current runtime rules, despite the prepared independent flag being true. Only the later authorization cutover makes the independent setting operational. PostgREST schema-cache refresh may be needed if newly added columns are not immediately recognized; use the project's normal administrative refresh process if required, not a historical migration replay.

The block table deliberately has no browser mutation access. Later block/unblock RPCs must atomically remove friendship/invalidate pending requests and enforce the approved communication rules. Do not add permissive write policies merely to make a block button work. Existing service-role/table-owner privileges remain privileged and are not substitutes for those RPC checks.

## Prerequisites and manual execution order

1. Confirm the inspected project is the intended target and the live baseline still matches. `public.profiles`, its audited legacy flag/owner policy, `auth.users`, `auth.uid()` and executable `private.is_eligible()` must exist. Missing prerequisites fail the transaction; this script does not install historical migrations.
2. Review the single new migration. Ensure `is_private`, `dm_permission`, `allow_group_additions` and `public.student_blocks` have not since been added manually. This is a run-once versioned script: it intentionally fails on collisions rather than masking unexpected definitions or resetting saved choices.
3. Optionally record profile counts and legacy true/false distribution with the read-only query below. Retain the existing audit exports for comparison.
4. Manually execute the complete migration as one SQL Editor submission under the project owner. It contains its own transaction. Profile DDL locks serialize concurrent saves/signups; lock acquisition has a five-second timeout. A failure rolls back the transaction; after resolving contention, rerun the whole script only if it did not commit. Never run fragments or automatically replay all repository migrations.
5. Run the post-execution SELECT queries below. Record this full filename and the outcome in your team's manual deployment record because no migration ledger exists. Stop before the next stage.

Do not drop the new fields/table as routine rollback or recreate legacy tables. On error use transaction rollback and investigate; after successful execution, retaining dormant additive structures preserves any saved choices/data and leaves current RPC behavior unchanged.

## Read-only verification (manual only)

Before execution:

```sql
select count(*) as profiles,
       count(*) filter (where allow_new_dms) as legacy_open,
       count(*) filter (where not allow_new_dms) as legacy_closed
from public.profiles;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('allow_new_dms', 'is_private', 'dm_permission', 'allow_group_additions')
order by column_name;

select to_regclass('public.student_blocks') as existing_blocks_table;
```

Immediately after execution, before independent preference changes:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('allow_new_dms', 'is_private', 'dm_permission', 'allow_group_additions')
order by column_name;

select count(*) as profiles,
       count(*) filter (where is_private) as private_profiles,
       count(*) filter (
         where dm_permission is distinct from
           case when allow_new_dms then 'eligible_students' else 'no_one' end
       ) as dm_seed_mismatches,
       count(*) filter (
         where allow_group_additions is distinct from true
       ) as group_seed_mismatches
from public.profiles;

select count(*) as initial_blocks from public.student_blocks;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.profiles'::regclass, 'public.student_blocks'::regclass)
order by conrelid, conname;

select relname, relrowsecurity
from pg_class
where oid = 'public.student_blocks'::regclass;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('profiles', 'student_blocks')
order by tablename, policyname;

select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'student_blocks';

select role_name,
       has_table_privilege(role_name, 'public.student_blocks', 'SELECT') as can_select,
       has_table_privilege(role_name, 'public.student_blocks', 'INSERT') as can_insert,
       has_table_privilege(role_name, 'public.student_blocks', 'UPDATE') as can_update,
       has_table_privilege(role_name, 'public.student_blocks', 'DELETE') as can_delete
from (values ('anon'), ('authenticated')) as roles(role_name);

select role_name, setting_name,
       has_column_privilege(role_name, 'public.profiles', setting_name, 'SELECT') as can_select,
       has_column_privilege(role_name, 'public.profiles', setting_name, 'UPDATE') as can_update
from (values ('anon'), ('authenticated')) as roles(role_name)
cross join (values ('is_private'), ('dm_permission'), ('allow_group_additions')) as settings(setting_name);

select pubname, schemaname, tablename
from pg_publication_tables
where schemaname = 'public' and tablename = 'student_blocks';
```

Expected: non-null defaults false/eligible-students/true, zero initial private profiles and seed mismatches, zero blocks, validated-looking expected constraint definitions, RLS enabled, only owner SELECT policy, authenticated SELECT only and no anon table privileges, and no block publication rows. Concurrent signups can increase counts; later legacy preference edits can cause snapshot mismatch without implying the migration failed. The existing profile-owner policy must match the audit. SQL Editor owner queries do not demonstrate actual authenticated RLS isolation; isolated database fixtures and real-session checks remain pending.

For the profile-column privilege query, expect authenticated SELECT/UPDATE true and anon false; RLS still limits authenticated access to eligible owners. The five-second timeout limits lock acquisition waits, not total migration runtime or how long an acquired lock is held. The update touches every existing profile and invokes its update trigger; use a suitable maintenance window for table size/traffic. Auth foreign keys require the existing `auth.users(id)` key and the executing owner must have DDL privileges. This script is not rerunnable after success; a collision or lock failure must not be worked around by running fragments. After any failure confirm rollback before retrying.

## Local verification and task tracking

Only static checks are permitted for this review: inspect the SQL's statements, migration identifier uniqueness, snapshot mapping against the supplied audit metadata, transaction ordering, data-mutation scope and documentation consistency; run `git diff --check` and strict OpenSpec validation. No SQL execution, database test fixture, migration command or live change is part of this step.

OpenSpec task 1.1 is partially prepared, not complete: the migration is generated but fresh/upgrade/concurrent-signup fixture execution remains unperformed. Task 1.5 is also only partially documented; obsolete-setting-write rejection belongs to the later cutover. Do not check off those tasks or any unrelated task based on static verification alone.
