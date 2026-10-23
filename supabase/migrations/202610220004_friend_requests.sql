-- Owner review and manual application only. Requires accounts, classmate profile
-- visibility, and course recommendation migrations. Never apply from the app.
begin;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_distinct_users check (sender_id <> recipient_id),
  constraint friend_requests_response_time check ((status = 'pending' and responded_at is null) or (status <> 'pending' and responded_at is not null))
);
create unique index if not exists friend_requests_one_pending_pair
  on public.friend_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status = 'pending';
create index if not exists friend_requests_incoming_pending
  on public.friend_requests (recipient_id, created_at desc) where status = 'pending';
create index if not exists friend_requests_pair_history
  on public.friend_requests (sender_id, recipient_id, created_at desc);

create table if not exists public.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friendships_canonical_pair check (user_id < friend_id)
);
create index if not exists friendships_friend_user on public.friendships (friend_id, user_id);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
drop policy if exists friend_requests_participant_read on public.friend_requests;
create policy friend_requests_participant_read on public.friend_requests for select to authenticated
  using ((sender_id = (select auth.uid()) or recipient_id = (select auth.uid())) and (select private.is_eligible()));
drop policy if exists friendships_participant_read on public.friendships;
create policy friendships_participant_read on public.friendships for select to authenticated
  using ((user_id = (select auth.uid()) or friend_id = (select auth.uid())) and (select private.is_eligible()));
revoke all on public.friend_requests, public.friendships from anon, authenticated;
grant select on public.friend_requests, public.friendships to authenticated;

create or replace function public.send_friend_request(p_course_code text, p_student_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); code text := upper(btrim(p_course_code)); request_id uuid;
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode = '42501'; end if;
  if code is null or code !~ '^[A-Z]{2,4}\s*[0-9]{3}$' then raise exception 'Invalid course code' using errcode = '22023'; end if;
  code := regexp_replace(code, '^([A-Z]{2,4})\s*([0-9]{3})$', '\1 \2');
  if p_student_id is null or p_student_id = caller or not private.can_view_classmate(caller, p_student_id, code) then
    raise exception 'Student must be an eligible classmate in this course' using errcode = '42501';
  end if;
  if exists (select 1 from public.friendships f where f.user_id = least(caller,p_student_id) and f.friend_id = greatest(caller,p_student_id)) then
    raise exception 'Students are already friends' using errcode = '23505';
  end if;
  if exists (select 1 from public.friend_requests r where r.status = 'pending' and least(r.sender_id,r.recipient_id) = least(caller,p_student_id) and greatest(r.sender_id,r.recipient_id) = greatest(caller,p_student_id)) then
    raise exception 'A pending request already exists for this student pair' using errcode = '23505';
  end if;
  insert into public.friend_requests(sender_id,recipient_id) values (caller,p_student_id) returning id into request_id;
  return request_id;
exception when unique_violation then
  raise exception 'A pending request already exists for this student pair' using errcode = '23505';
end;
$$;
revoke all on function public.send_friend_request(text,uuid) from public, anon, authenticated;
grant execute on function public.send_friend_request(text,uuid) to authenticated;

create or replace function public.respond_to_friend_request(p_request_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); req public.friend_requests;
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept','decline') then raise exception 'Action must be accept or decline' using errcode = '22023'; end if;
  select * into req from public.friend_requests where id = p_request_id for update;
  if not found or req.recipient_id <> caller or req.status <> 'pending' then raise exception 'Pending incoming request not found' using errcode = '42501'; end if;
  update public.friend_requests set status = case when p_action = 'accept' then 'accepted' else 'declined' end,
    updated_at = now(), responded_at = now() where id = req.id;
  if p_action = 'accept' then
    insert into public.friendships(user_id,friend_id) values (least(req.sender_id,req.recipient_id),greatest(req.sender_id,req.recipient_id)) on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.respond_to_friend_request(uuid,text) from public, anon, authenticated;
grant execute on function public.respond_to_friend_request(uuid,text) to authenticated;

create or replace function public.friend_request_inbox()
returns table (request_id uuid, sender_id uuid, sender_name text, sender_major text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode = '42501'; end if;
  return query select r.id,p.id,p.name,p.major,r.created_at from public.friend_requests r
    join public.profiles p on p.id = r.sender_id
    where r.recipient_id = auth.uid() and r.status = 'pending'
      and exists (select 1 from auth.users u join auth.identities i on i.user_id=u.id where u.id=p.id and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))='stonybrook.edu' and u.email ~ '^[^@]+@[^@]+$' and i.provider='google' and i.identity_data->>'email_verified'='true' and lower(i.identity_data->>'email')=lower(u.email))
    order by r.created_at, r.id;
end;
$$;
revoke all on function public.friend_request_inbox() from public, anon, authenticated;
grant execute on function public.friend_request_inbox() to authenticated;

create or replace function public.course_friend_relationships(p_course_code text)
returns table (student_id uuid, relationship text, request_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := auth.uid(); code text := upper(btrim(p_course_code));
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode = '42501'; end if;
  if code is null or code !~ '^[A-Z]{2,4}\s*[0-9]{3}$' then raise exception 'Invalid course code' using errcode = '22023'; end if;
  code := regexp_replace(code, '^([A-Z]{2,4})\s*([0-9]{3})$', '\1 \2');
  if not exists(select 1 from public.user_courses where user_id=caller and course_code=code) then raise exception 'Saved course membership required' using errcode = '42501'; end if;
  return query
  with peers as (
    select distinct c.user_id as peer_id from public.user_courses c join public.profiles p on p.id=c.user_id
    where c.course_code=code and c.user_id<>caller and private.can_view_classmate(caller,c.user_id,code)
  )
  select peers.peer_id,
    case when f.user_id is not null then 'accepted'
         when pending.sender_id=caller then 'outgoing_pending'
         when pending.recipient_id=caller then 'incoming_pending'
         when latest.status='declined' then 'declined' else 'none' end,
    coalesce(pending.id,latest.id)
  from peers
  left join public.friendships f on f.user_id=least(caller,peers.peer_id) and f.friend_id=greatest(caller,peers.peer_id)
  left join lateral (select r.* from public.friend_requests r where r.status='pending' and least(r.sender_id,r.recipient_id)=least(caller,peers.peer_id) and greatest(r.sender_id,r.recipient_id)=greatest(caller,peers.peer_id) order by r.created_at desc limit 1) pending on true
  left join lateral (select r.* from public.friend_requests r where r.status<>'pending' and least(r.sender_id,r.recipient_id)=least(caller,peers.peer_id) and greatest(r.sender_id,r.recipient_id)=greatest(caller,peers.peer_id) order by r.created_at desc limit 1) latest on true;
end;
$$;
revoke all on function public.course_friend_relationships(text) from public, anon, authenticated;
grant execute on function public.course_friend_relationships(text) to authenticated;

create or replace function public.friends_in_course(p_course_code text)
returns table (student_id uuid, name text, major text, year text, interests text[], residence_status text, has_shared_avatar boolean)
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := auth.uid(); code text := upper(btrim(p_course_code));
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode = '42501'; end if;
  if code is null or code !~ '^[A-Z]{2,4}\s*[0-9]{3}$' then raise exception 'Invalid course code' using errcode = '22023'; end if;
  code := regexp_replace(code, '^([A-Z]{2,4})\s*([0-9]{3})$', '\1 \2');
  if not exists(select 1 from public.user_courses where user_id=caller and course_code=code) then raise exception 'Saved course membership required' using errcode = '42501'; end if;
  return query select p.id,p.name,p.major,case when p.share_year then p.year else null end,
    case when p.share_interests then p.interests else null end,
    case when p.share_residence_status then p.residence_status else null end,
    p.share_avatar and p.avatar_path is not null
  from public.friendships f join public.profiles p on p.id=case when f.user_id=caller then f.friend_id else f.user_id end
  join public.user_courses c on c.user_id=p.id and c.course_code=code
  where caller in (f.user_id,f.friend_id) and private.can_view_classmate(caller,p.id,code)
  order by p.name,p.id;
end;
$$;
revoke all on function public.friends_in_course(text) from public, anon, authenticated;
grant execute on function public.friends_in_course(text) to authenticated;

create or replace function public.get_friend_profile(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := auth.uid(); result jsonb;
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if p_student_id is null or p_student_id=caller or not exists(
    select 1 from public.friend_requests r where r.status='pending' and caller in (r.sender_id,r.recipient_id) and p_student_id in (r.sender_id,r.recipient_id)
    union all select 1 from public.friendships f where caller in (f.user_id,f.friend_id) and p_student_id in (f.user_id,f.friend_id)
  ) then return null; end if;
  select jsonb_build_object('student_id',id,'name',name,'major',major,'has_shared_avatar',share_avatar and avatar_path is not null)
    || case when share_year then jsonb_build_object('year',year) else '{}'::jsonb end
    || case when share_interests then jsonb_build_object('interests',interests) else '{}'::jsonb end
    || case when share_residence_status then jsonb_build_object('residence_status',residence_status) else '{}'::jsonb end
  into result from public.profiles where id=p_student_id;
  return result;
end;
$$;
revoke all on function public.get_friend_profile(uuid) from public, anon, authenticated;
grant execute on function public.get_friend_profile(uuid) to authenticated;

create or replace function public.resolve_friend_avatar(p_caller_id uuid, p_student_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.avatar_path from public.profiles p
  where p.id=p_student_id and p.share_avatar and p.avatar_path is not null
    and p_caller_id is not null and p_caller_id <> p_student_id
    and (exists (select 1 from public.friend_requests r where r.status='pending'
        and p_caller_id in (r.sender_id,r.recipient_id) and p_student_id in (r.sender_id,r.recipient_id))
      or exists (select 1 from public.friendships f where p_caller_id in (f.user_id,f.friend_id)
        and p_student_id in (f.user_id,f.friend_id)));
$$;
revoke all on function public.resolve_friend_avatar(uuid,uuid) from public,anon,authenticated;
grant execute on function public.resolve_friend_avatar(uuid,uuid) to service_role;

-- Update only course recommendations. The legacy find_classmates RPC is untouched.
create or replace function public.course_recommendation_profiles(p_course_code text)
returns table (student_id uuid, name text, major text, year text, interests text[], residence_status text)
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := auth.uid(); code text := upper(btrim(p_course_code));
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode = '42501'; end if;
  if code is null or code !~ '^[A-Z]{2,4}\s*[0-9]{3}$' then raise exception 'Invalid course code' using errcode = '22023'; end if;
  code := regexp_replace(code, '^([A-Z]{2,4})\s*([0-9]{3})$', '\1 \2');
  if not exists (select 1 from public.user_courses c where c.user_id = caller and c.course_code = code) then raise exception 'Saved course membership required' using errcode = '42501'; end if;
  return query
  select distinct on (p.id) p.id,p.name,p.major,
    case when p.share_year then p.year else null end,
    case when p.share_interests then p.interests else null end,
    case when p.share_residence_status then p.residence_status else null end
  from public.user_courses c join public.profiles p on p.id=c.user_id
  left join public.user_course_sections s on s.user_course_id=c.id
  where c.course_code=code and c.user_id<>caller and private.can_view_classmate(caller,p.id,code)
    and not exists (select 1 from public.friendships f where f.user_id=least(caller,p.id) and f.friend_id=greatest(caller,p.id))
  order by p.id,s.section nulls first;
end;
$$;
revoke all on function public.course_recommendation_profiles(text) from public,anon,authenticated;
grant execute on function public.course_recommendation_profiles(text) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='friend_requests') then alter publication supabase_realtime add table public.friend_requests; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='friendships') then alter publication supabase_realtime add table public.friendships; end if;
  end if;
end $$;

commit;
