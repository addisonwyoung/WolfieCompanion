-- Owner-reviewed manual deployment only. Enables searching eligible students
-- outside the caller's courses while preserving profile visibility choices.
begin;

create or replace function public.friend_directory()
returns table (
  student_id uuid,
  name text,
  major text,
  year text,
  interests text[],
  residence_status text,
  has_shared_avatar boolean,
  relationship text
)
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode = '42501';
  end if;
  return query
  select p.id, p.name, p.major,
    case when p.share_year then p.year else null end,
    case when p.share_interests then p.interests else null end,
    case when p.share_residence_status then p.residence_status else null end,
    p.share_avatar and p.avatar_path is not null,
    coalesce(latest.relationship, 'none')
  from public.profiles p
  join auth.users u on u.id = p.id
  join auth.identities i on i.user_id = u.id
  left join lateral (
    select case
      when r.status = 'pending' and r.sender_id = caller then 'outgoing_pending'
      when r.status = 'pending' and r.recipient_id = caller then 'incoming_pending'
      when r.status = 'declined' then 'declined'
      else 'none'
    end as relationship
    from public.friend_requests r
    where least(r.sender_id, r.recipient_id) = least(caller, p.id)
      and greatest(r.sender_id, r.recipient_id) = greatest(caller, p.id)
    order by r.created_at desc, r.id desc
    limit 1
  ) latest on true
  where p.id <> caller
    and u.email_confirmed_at is not null
    and lower(split_part(u.email, '@', 2)) = 'stonybrook.edu'
    and u.email ~ '^[^@]+@[^@]+$'
    and i.provider = 'google'
    and i.identity_data->>'email_verified' = 'true'
    and lower(i.identity_data->>'email') = lower(u.email)
    and not exists (
      select 1 from public.friendships f
      where f.user_id = least(caller, p.id)
        and f.friend_id = greatest(caller, p.id)
    )
  order by p.name, p.id;
end;
$$;
revoke all on function public.friend_directory() from public, anon, authenticated;
grant execute on function public.friend_directory() to authenticated;

create or replace function public.send_friend_request_to_student(p_student_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); request_id uuid;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode = '42501';
  end if;
  if p_student_id is null or p_student_id = caller or not exists (
    select 1 from auth.users u join auth.identities i on i.user_id = u.id
    where u.id = p_student_id and u.email_confirmed_at is not null
      and lower(split_part(u.email, '@', 2)) = 'stonybrook.edu'
      and u.email ~ '^[^@]+@[^@]+$'
      and i.provider = 'google'
      and i.identity_data->>'email_verified' = 'true'
      and lower(i.identity_data->>'email') = lower(u.email)
  ) then
    raise exception 'Eligible student not found' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.friendships f
    where f.user_id = least(caller, p_student_id)
      and f.friend_id = greatest(caller, p_student_id)
  ) then
    raise exception 'Students are already friends' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.friend_requests r
    where r.status = 'pending'
      and least(r.sender_id, r.recipient_id) = least(caller, p_student_id)
      and greatest(r.sender_id, r.recipient_id) = greatest(caller, p_student_id)
  ) then
    raise exception 'A pending request already exists for this student pair' using errcode = '23505';
  end if;
  insert into public.friend_requests(sender_id, recipient_id)
  values (caller, p_student_id) returning id into request_id;
  return request_id;
exception when unique_violation then
  raise exception 'A pending request already exists for this student pair' using errcode = '23505';
end;
$$;
revoke all on function public.send_friend_request_to_student(uuid) from public, anon, authenticated;
grant execute on function public.send_friend_request_to_student(uuid) to authenticated;

create or replace function public.get_discoverable_profile(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := auth.uid(); result jsonb;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode = '42501';
  end if;
  if p_student_id is null or p_student_id = caller or not exists (
    select 1 from auth.users u join auth.identities i on i.user_id = u.id
    where u.id = p_student_id and u.email_confirmed_at is not null
      and lower(split_part(u.email, '@', 2)) = 'stonybrook.edu'
      and u.email ~ '^[^@]+@[^@]+$'
      and i.provider = 'google'
      and i.identity_data->>'email_verified' = 'true'
      and lower(i.identity_data->>'email') = lower(u.email)
  ) then return null; end if;
  select jsonb_build_object('student_id', p.id, 'name', p.name, 'major', p.major,
    'has_shared_avatar', p.share_avatar and p.avatar_path is not null)
    || case when p.share_year then jsonb_build_object('year', p.year) else '{}'::jsonb end
    || case when p.share_interests then jsonb_build_object('interests', p.interests) else '{}'::jsonb end
    || case when p.share_residence_status then jsonb_build_object('residence_status', p.residence_status) else '{}'::jsonb end
  into result from public.profiles p where p.id = p_student_id;
  return result;
end;
$$;
revoke all on function public.get_discoverable_profile(uuid) from public, anon, authenticated;
grant execute on function public.get_discoverable_profile(uuid) to authenticated;

-- The server calls this with the verified caller ID. Avatar paths remain hidden
-- unless the profile owner opted in to sharing their avatar.
create or replace function public.resolve_friend_avatar(p_caller_id uuid, p_student_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.avatar_path from public.profiles p
  where p.id = p_student_id and p.share_avatar and p.avatar_path is not null
    and p_caller_id is not null and p_caller_id <> p_student_id
    and exists (select 1 from auth.users u join auth.identities i on i.user_id = u.id
      where u.id = p_caller_id and u.email_confirmed_at is not null
        and lower(split_part(u.email, '@', 2)) = 'stonybrook.edu'
        and u.email ~ '^[^@]+@[^@]+$' and i.provider = 'google'
        and i.identity_data->>'email_verified' = 'true' and lower(i.identity_data->>'email') = lower(u.email))
    and exists (select 1 from auth.users u join auth.identities i on i.user_id = u.id
      where u.id = p.id and u.email_confirmed_at is not null
        and lower(split_part(u.email, '@', 2)) = 'stonybrook.edu'
        and u.email ~ '^[^@]+@[^@]+$' and i.provider = 'google'
        and i.identity_data->>'email_verified' = 'true' and lower(i.identity_data->>'email') = lower(u.email));
$$;
revoke all on function public.resolve_friend_avatar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_friend_avatar(uuid, uuid) to service_role;

commit;
