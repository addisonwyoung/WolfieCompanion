-- Stage 1 only: reviewed manual SQL Editor deployment, never run by the app.
-- Baseline: live audit exports, not a replay of repository migrations.
-- Requires public.profiles.allow_new_dms boolean NOT NULL, auth.users(id),
-- auth.uid(), private.is_eligible(), and existing owner-only profile RLS.
-- Run once. Existing target objects cause an error and transaction rollback;
-- do not silently accept drift or rerun a backfill over later user choices.
-- No discovery, DM, friendship, group or Study Buddy RPC is changed here.
begin;
set local lock_timeout = '5s';

-- ALTER holds the profile table lock through backfill/default installation,
-- so concurrent signup/profile saves cannot see partially seeded settings.
alter table public.profiles
  add column is_private boolean not null default false,
  add column dm_permission text,
  add column allow_group_additions boolean;

-- Map legacy DM consent without deleting or changing the legacy flag.
-- Group additions start enabled for every account, independently of DM consent.
-- Existing profile update triggers may advance updated_at during this update.
update public.profiles
set dm_permission = case when allow_new_dms then 'eligible_students' else 'no_one' end,
    allow_group_additions = true;

alter table public.profiles
  alter column dm_permission set default 'eligible_students',
  alter column dm_permission set not null,
  alter column allow_group_additions set default true,
  alter column allow_group_additions set not null,
  add constraint profiles_dm_permission_check
    check (dm_permission in ('eligible_students', 'friends_only', 'no_one'));

-- Directed pairs: A blocking B does not create B blocking A.
-- Both directions may exist; later authorization must test either direction.
create table public.student_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint student_blocks_pkey primary key (blocker_id, blocked_id),
  constraint student_blocks_distinct_students check (blocker_id <> blocked_id)
);

-- The primary key covers blocker-first access; this supports reverse lookups
-- and account deletion through the blocked_id foreign key.
create index student_blocks_blocked_blocker
  on public.student_blocks (blocked_id, blocker_id);

alter table public.student_blocks enable row level security;
revoke all on public.student_blocks from public, anon, authenticated;
grant select on public.student_blocks to authenticated;

create policy student_blocks_owner_read on public.student_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()) and (select private.is_eligible()));

-- No client INSERT/UPDATE/DELETE policies or grants. Future narrowly scoped
-- block/unblock RPCs must perform relationship cleanup and authorization.
-- No publication changes: block direction must not be broadcast to peers.
-- Profile ownership policies/grants remain unchanged; no new peer projection.
commit;
