-- Stage 3C-1 only. Owner-reviewed whole-file SQL Editor execution after Stage 1-3B.
-- No frontend, membership model, message, notification or calendar changes.
begin;
set local lock_timeout = '5s';

do $$
declare signature text;
begin
 foreach signature in array array[
  'private.is_eligible()', 'private.dm_eligible(uuid)', 'private.student_visible(uuid,uuid,boolean)',
  'private.student_pair_lock(uuid,uuid)', 'public.block_student(uuid)',
  'public.unblock_student(uuid)', 'public.group_leave(uuid,uuid)',
  'public.study_leave(uuid,uuid)', 'public.study_respond(uuid,uuid,boolean,uuid)'
 ] loop
  if to_regprocedure(signature) is null then raise exception 'Verified Stage 1-3B prerequisite required: %',signature; end if;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='public' and p.proname in('shared_group_warnings','dismiss_shared_group_warning'))
   or (n.nspname='private' and p.proname='warning_co_members')) then
  raise exception 'Warning RPC name already exists; review catalog drift before installation';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('block_student','unblock_student')
  and p.oid not in('public.block_student(uuid)'::regprocedure,'public.unblock_student(uuid)'::regprocedure)) then
  raise exception 'Unexpected block overload; owner review required';
 end if;
 if not exists(select 1 from pg_class where oid='public.student_blocks'::regclass and relrowsecurity)
 or not exists(select 1 from pg_trigger where tgrelid='public.study_group_members'::regclass
   and tgname='study_admission_block_guard' and tgenabled='O') then
  raise exception 'Verified block RLS and Study status guard required';
 end if;
 if exists(select 1 from unnest(array['anon','authenticated']) r
  where has_any_column_privilege(r,'public.student_blocks','INSERT,UPDATE')
   or has_table_privilege(r,'public.student_blocks','DELETE')) then
  raise exception 'Unexpected direct client block writes';
 end if;
 -- A private schema is not an exemption from all-table/schema publications.
 if exists(select 1 from pg_publication where puballtables)
 or exists(select 1 from pg_publication_namespace pn join pg_namespace n on n.oid=pn.pnnspid where n.nspname='private')
 or exists(select 1 from pg_publication_tables where schemaname='public' and tablename='student_blocks') then
  raise exception 'Privacy state must not be published; owner publication review required';
 end if;
end; $$;

-- No historical identity lookup/backfill. Existing records retain a safe null fallback.
alter table public.student_blocks add column blocked_name_snapshot text;

create table private.shared_group_warning_state (
 id uuid primary key default gen_random_uuid(),
 viewer_id uuid not null,
 blocked_student_id uuid not null,
 messaging_group_id uuid,
 study_group_id uuid,
 dismissed_at timestamptz,
 constraint warning_one_context check ((messaging_group_id is null) <> (study_group_id is null)),
 constraint warning_outgoing_block foreign key(viewer_id,blocked_student_id)
  references public.student_blocks(blocker_id,blocked_id) on delete cascade,
 -- MATCH SIMPLE intentionally ignores the unused context's null group ID.
 constraint warning_chat_viewer foreign key(messaging_group_id,viewer_id)
  references public.group_members(group_id,user_id) on delete cascade,
 constraint warning_chat_target foreign key(messaging_group_id,blocked_student_id)
  references public.group_members(group_id,user_id) on delete cascade,
 constraint warning_study_viewer foreign key(study_group_id,viewer_id)
  references public.study_group_members(group_id,user_id) on delete cascade,
 constraint warning_study_target foreign key(study_group_id,blocked_student_id)
  references public.study_group_members(group_id,user_id) on delete cascade
);
create unique index warning_current_chat on private.shared_group_warning_state(viewer_id,blocked_student_id,messaging_group_id) where messaging_group_id is not null;
create unique index warning_current_study on private.shared_group_warning_state(viewer_id,blocked_student_id,study_group_id) where study_group_id is not null;
-- Parent deletes must find the child without scanning all private warning state.
create index warning_block_cleanup on private.shared_group_warning_state(viewer_id,blocked_student_id);
create index warning_chat_viewer_cleanup on private.shared_group_warning_state(messaging_group_id,viewer_id) where messaging_group_id is not null;
create index warning_chat_target_cleanup on private.shared_group_warning_state(messaging_group_id,blocked_student_id) where messaging_group_id is not null;
create index warning_study_viewer_cleanup on private.shared_group_warning_state(study_group_id,viewer_id) where study_group_id is not null;
create index warning_study_target_cleanup on private.shared_group_warning_state(study_group_id,blocked_student_id) where study_group_id is not null;
alter table private.shared_group_warning_state enable row level security;
revoke all on private.shared_group_warning_state from public,anon,authenticated,service_role;

-- Keep the existing signature, caller eligibility, pair lock and atomic cleanup.
create or replace function public.block_student(p_student_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); saved_name text;
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_student_id is null or p_student_id=caller then raise exception 'Invalid student' using errcode='22023'; end if;
 perform private.student_pair_lock(caller,p_student_id);
 if not private.dm_eligible(p_student_id) then raise exception 'Student unavailable' using errcode='42501'; end if;
 -- Serialize with privacy edits; check visibility BEFORE insertion removes access.
 perform 1 from public.profiles where id=p_student_id for update;
 if private.student_visible(caller,p_student_id,true) then
  select nullif(btrim(p.name),'') into saved_name from public.profiles p where p.id=p_student_id;
 end if;
 insert into public.student_blocks(blocker_id,blocked_id,blocked_name_snapshot)
 values(caller,p_student_id,saved_name) on conflict do nothing;
 delete from public.friendships where user_id=least(caller,p_student_id) and friend_id=greatest(caller,p_student_id);
 update public.friend_requests set status='declined',responded_at=now(),updated_at=now()
 where status='pending' and least(sender_id,recipient_id)=least(caller,p_student_id) and greatest(sender_id,recipient_id)=greatest(caller,p_student_id);
end; $$;

-- Status is deliberately checked here, not inferred from a membership FK.
create function private.warning_co_members(p_context text,p_group_id uuid,p_viewer uuid,p_target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_viewer=auth.uid() and private.is_eligible() and p_viewer<>p_target and case p_context
 when 'messaging' then exists(select 1 from public.group_members a join public.group_members b using(group_id)
  where a.group_id=p_group_id and a.user_id=p_viewer and b.user_id=p_target)
 when 'study' then exists(select 1 from public.study_group_members a join public.study_group_members b using(group_id)
  where a.group_id=p_group_id and a.user_id=p_viewer and b.user_id=p_target and a.status='accepted' and b.status='accepted')
 else false end;
$$;

create function public.shared_group_warnings(p_context text,p_group_id uuid)
returns table(warning_id uuid,blocked_student_id uuid,name text)
language plpgsql volatile security definer set search_path='' as $$
declare caller uuid:=auth.uid(); target uuid;
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_context='messaging' then
  perform 1 from public.group_conversations where id=p_group_id for update;
  if not found or not exists(select 1 from public.group_members where group_id=p_group_id and user_id=caller) then
   raise exception 'Group unavailable' using errcode='42501'; end if;
 elsif p_context='study' then
  perform 1 from public.study_groups where id=p_group_id for update;
  if not found or not exists(select 1 from public.study_group_members where group_id=p_group_id and user_id=caller and status='accepted') then
   raise exception 'Group unavailable' using errcode='42501'; end if;
 else raise exception 'Group unavailable' using errcode='42501'; end if;
 -- Group -> canonical pair(s), in deterministic target order -> warning row.
 for target in select b.blocked_id from public.student_blocks b where b.blocker_id=caller
  and private.warning_co_members(p_context,p_group_id,caller,b.blocked_id) order by b.blocked_id loop
  perform private.student_pair_lock(caller,target);
  if private.warning_co_members(p_context,p_group_id,caller,target)
   and exists(select 1 from public.student_blocks where blocker_id=caller and blocked_id=target) then
   insert into private.shared_group_warning_state(viewer_id,blocked_student_id,messaging_group_id,study_group_id)
   values(caller,target,case when p_context='messaging' then p_group_id end,case when p_context='study' then p_group_id end)
   on conflict do nothing;
  end if;
 end loop;
 return query select w.id,w.blocked_student_id,coalesce(nullif(btrim(p.name),''),'Student')
 from private.shared_group_warning_state w join public.student_blocks b on b.blocker_id=w.viewer_id and b.blocked_id=w.blocked_student_id
 join public.profiles p on p.id=w.blocked_student_id
 where w.viewer_id=caller and w.dismissed_at is null
 and ((p_context='messaging' and w.messaging_group_id=p_group_id) or (p_context='study' and w.study_group_id=p_group_id))
 and private.warning_co_members(p_context,p_group_id,caller,w.blocked_student_id)
 order by w.blocked_student_id;
end; $$;

create function public.dismiss_shared_group_warning(p_warning_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare caller uuid:=auth.uid(); w private.shared_group_warning_state%rowtype; context text; group_id uuid;
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 -- No row lock before the context/pair locks; foreign/missing IDs are indistinguishable.
 select * into w from private.shared_group_warning_state where id=p_warning_id and viewer_id=caller;
 if not found then return; end if;
 if w.messaging_group_id is not null then
  context:='messaging'; group_id:=w.messaging_group_id;
  perform 1 from public.group_conversations where id=group_id for update;
 else
  context:='study'; group_id:=w.study_group_id;
  perform 1 from public.study_groups where id=group_id for update;
 end if;
 if not found then return; end if;
 perform private.student_pair_lock(caller,w.blocked_student_id);
 if private.warning_co_members(context,group_id,caller,w.blocked_student_id)
 and exists(select 1 from public.student_blocks where blocker_id=caller and blocked_id=w.blocked_student_id) then
  update private.shared_group_warning_state set dismissed_at=coalesce(dismissed_at,clock_timestamp())
  where id=p_warning_id and viewer_id=caller;
 end if;
end; $$;

revoke all on function private.warning_co_members(text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.block_student(uuid),public.unblock_student(uuid),public.shared_group_warnings(text,uuid),public.dismiss_shared_group_warning(uuid) from public,anon,authenticated,service_role;
grant execute on function public.block_student(uuid),public.unblock_student(uuid),public.shared_group_warnings(text,uuid),public.dismiss_shared_group_warning(uuid) to authenticated;

do $$
declare signature text;
begin
 if exists(select 1 from unnest(array['anon','authenticated','service_role']) r
  where has_any_column_privilege(r,'private.shared_group_warning_state','SELECT,INSERT,UPDATE')
  or has_table_privilege(r,'private.shared_group_warning_state','DELETE')) then raise exception 'Unsafe warning table privileges'; end if;
 foreach signature in array array['public.block_student(uuid)','public.unblock_student(uuid)','public.shared_group_warnings(text,uuid)','public.dismiss_shared_group_warning(uuid)'] loop
  if not has_function_privilege('authenticated',signature,'execute') or has_function_privilege('anon',signature,'execute')
  or has_function_privilege('service_role',signature,'execute') then raise exception 'Unsafe RPC privileges: %',signature; end if;
 end loop;
end; $$;
commit;
