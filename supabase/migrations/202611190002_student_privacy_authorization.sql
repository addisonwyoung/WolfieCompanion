-- Stage 2A: manual SQL Editor execution after 202611190001.
-- Based on the supplied live RPC audit. No table/data rebuild or historical replay.
-- Mutual DM preferences and membership models are unchanged; block admission guards apply.
begin;
set local lock_timeout = '5s';

-- Fail closed on missing Stage 1/unsupported legacy overloads rather than silently
-- leaving an unaudited callable path. This migration targets the supplied live audit.
do $$
declare signature text;
begin
 if to_regclass('public.student_blocks') is null or not exists (
  select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_private' and data_type='boolean' and is_nullable='NO'
 ) then raise exception 'Verified Stage 1 foundation required'; end if;
 -- Storage rows were not included in the supplied schema/ACL audit. Do not
 -- deploy profile privacy over a public bucket or silently change its contents.
 if not exists(select 1 from storage.buckets b where b.id='avatars' and b."public"=false) then
  raise exception 'Private avatars bucket required; verify storage configuration';
 end if;
 foreach signature in array array[
  'private.dm_eligible(uuid)','private.is_eligible()',
  'private.group_floor(uuid)','private.can_view_classmate_with_professor(uuid,uuid,text,text,text,text)',
  'private.is_current_course_section_member(uuid,text,text)'
 ] loop
  if to_regprocedure(signature) is null then raise exception 'Missing audited prerequisite: %',signature; end if;
 end loop;
 if exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
   'find_classmates','course_recommendation_profiles','course_friend_relationships',
   'get_classmate_profile','send_friend_request','resolve_classmate_avatar',
   'resolve_friend_avatar','resolve_classmate_avatar_by_professor'
  ) and p.oid not in (
   'public.find_classmates(text,text)'::regprocedure,
   'public.course_recommendation_profiles(text,text)'::regprocedure,
   'public.course_friend_relationships(text,text)'::regprocedure,
   'public.get_classmate_profile(text,text,uuid)'::regprocedure,
   'public.send_friend_request(text,text,uuid)'::regprocedure,
   'public.resolve_classmate_avatar(uuid,uuid,text,text)'::regprocedure,
   'public.resolve_friend_avatar(uuid,uuid)'::regprocedure,
   'public.resolve_classmate_avatar_by_professor(uuid,uuid,text,text,text,text)'::regprocedure
  )
 ) then raise exception 'Unexpected discovery/avatar overload: re-audit before deployment'; end if;
end; $$;


create function private.students_blocked(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a));
$$;
create function private.student_friend(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.friendships where user_id=least(a,b) and friend_id=greatest(a,b));
$$;
create function private.student_visible(a uuid,b uuid,allow_friend boolean default true) returns boolean
language sql stable security definer set search_path='' as $$
 select a is not null and b is not null and a<>b and private.dm_eligible(a) and private.dm_eligible(b)
 and not private.students_blocked(a,b) and exists(select 1 from public.profiles p where p.id=b
 and (not p.is_private or (allow_friend and private.student_friend(a,b))));
$$;
-- Same canonical pair lock as the existing DM sender; never lock a request row first.
create function private.student_pair_lock(a uuid,b uuid) returns void
language sql volatile set search_path='' as $$
 select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(a,b)::text||greatest(a,b)::text,0));
$$;
revoke all on function private.students_blocked(uuid,uuid),private.student_friend(uuid,uuid),private.student_visible(uuid,uuid,boolean),private.student_pair_lock(uuid,uuid) from public,anon,authenticated;

create function public.block_student(p_student_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_student_id is null or p_student_id=caller then raise exception 'Invalid student' using errcode='22023'; end if;
 perform private.student_pair_lock(caller,p_student_id);
 if not private.dm_eligible(p_student_id) then raise exception 'Student unavailable' using errcode='42501'; end if;
 insert into public.student_blocks(blocker_id,blocked_id) values(caller,p_student_id) on conflict do nothing;
 delete from public.friendships where user_id=least(caller,p_student_id) and friend_id=greatest(caller,p_student_id);
 update public.friend_requests set status='declined',responded_at=now(),updated_at=now()
 where status='pending' and least(sender_id,recipient_id)=least(caller,p_student_id) and greatest(sender_id,recipient_id)=greatest(caller,p_student_id);
end; $$;
create function public.unblock_student(p_student_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_student_id is null or p_student_id=caller then raise exception 'Invalid student' using errcode='22023'; end if;
 perform private.student_pair_lock(caller,p_student_id);
 delete from public.student_blocks where blocker_id=caller and blocked_id=p_student_id;
end; $$;
revoke all on function public.block_student(uuid),public.unblock_student(uuid) from public,anon,authenticated;
grant execute on function public.block_student(uuid),public.unblock_student(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.friend_directory()
 RETURNS TABLE(student_id uuid, name text, major text, year text, interests text[], residence_status text, has_shared_avatar boolean, relationship text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    case when private.student_friend(caller,p.id) then 'accepted' else coalesce(latest.relationship, 'none') end
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
  where p.id <> caller and private.student_visible(caller,p.id,false)
    and u.email_confirmed_at is not null
    and lower(split_part(u.email, '@', 2)) = 'stonybrook.edu'
    and u.email ~ '^[^@]+@[^@]+$'
    and i.provider = 'google'
    and i.identity_data->>'email_verified' = 'true'
    and lower(i.identity_data->>'email') = lower(u.email)
  order by p.name, p.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_discoverable_profile(p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid := auth.uid(); result jsonb;
begin
 if not private.student_visible(auth.uid(),p_student_id,true) then return null; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_friend_profile(p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid := auth.uid(); result jsonb;
begin
 if not private.student_visible(auth.uid(),p_student_id,true) then return null; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.friend_request_inbox()
 RETURNS TABLE(request_id uuid, sender_id uuid, sender_name text, sender_major text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode = '42501'; end if;
  return query select r.id,p.id,p.name,p.major,r.created_at from public.friend_requests r
    join public.profiles p on p.id = r.sender_id
    where not private.students_blocked(auth.uid(),p.id) and r.recipient_id = auth.uid() and r.status = 'pending'
      and exists (select 1 from auth.users u join auth.identities i on i.user_id=u.id where u.id=p.id and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))='stonybrook.edu' and u.email ~ '^[^@]+@[^@]+$' and i.provider='google' and i.identity_data->>'email_verified'='true' and lower(i.identity_data->>'email')=lower(u.email))
    order by r.created_at, r.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.friends_in_course(p_course_code text)
 RETURNS TABLE(student_id uuid, name text, major text, year text, interests text[], residence_status text, has_shared_avatar boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' then raise exception 'Invalid course code' using errcode='22023'; end if;
  if not private.is_current_course_member(caller,code) then raise exception 'Current-semester course enrollment required' using errcode='42501'; end if;
  return query select p.id,p.name,p.major,case when p.share_year then p.year else null end,
    case when p.share_interests then p.interests else null end,
    case when p.share_residence_status then p.residence_status else null end,p.share_avatar and p.avatar_path is not null
  from public.friendships f join public.profiles p on p.id=case when f.user_id=caller then f.friend_id else f.user_id end
  where private.student_visible(caller,p.id,true) and caller in(f.user_id,f.friend_id) and private.can_view_classmate(caller,p.id,code)
  order by p.name,p.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.find_classmates(p_course_code text, p_section text)
 RETURNS TABLE(student_id uuid, name text, major text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section));
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' or section_value is null or section_value !~ '^[A-Z0-9-]{1,20}$' then
    raise exception 'Invalid course section' using errcode='22023';
  end if;
  if not private.is_current_course_section_member(caller,code,section_value) then raise exception 'Current-semester course section enrollment required' using errcode='42501'; end if;
  return query select distinct p.id,p.name,p.major from public.course_enrollments e
    join public.profiles p on p.id=e.user_id
    where e.course_code=split_part(code,' ',1) and e.course_number=split_part(code,' ',2)
      and e.section=section_value and e.user_id<>caller and private.student_visible(caller,e.user_id,false)
      and private.can_view_classmate_in_section(caller,e.user_id,code,section_value)
    order by p.name,p.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.find_classmates_by_professor(p_course_code text, p_section text, p_professor_first_name text, p_professor_last_name text)
 RETURNS TABLE(student_id uuid, name text, major text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section)); first_value text:=btrim(p_professor_first_name); last_value text:=btrim(p_professor_last_name);
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' or section_value is null or section_value !~ '^[A-Z0-9-]{1,20}$' or length(first_value) not between 1 and 80 or length(last_value) not between 1 and 80 then
    raise exception 'Invalid course offering' using errcode='22023';
  end if;
  if not private.is_current_course_professor_member(caller,code,section_value,first_value,last_value) then raise exception 'Current verified course offering enrollment required' using errcode='42501'; end if;
  return query select distinct p.id,p.name,p.major from public.course_enrollments e join public.profiles p on p.id=e.user_id
    where e.course_code=split_part(code,' ',1) and e.course_number=split_part(code,' ',2) and e.section=section_value
      and lower(btrim(e.professor_first_name))=lower(first_value) and lower(btrim(e.professor_last_name))=lower(last_value)
      and e.user_id<>caller and private.student_visible(caller,e.user_id,false) and private.can_view_classmate_with_professor(caller,e.user_id,code,section_value,first_value,last_value)
    order by p.name,p.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.course_recommendation_profiles(p_course_code text, p_section text)
 RETURNS TABLE(student_id uuid, name text, major text, year text, interests text[], residence_status text, shared_courses text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section));
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' or section_value is null or section_value !~ '^[A-Z0-9-]{1,20}$' then
    raise exception 'Invalid course section' using errcode='22023';
  end if;
  if not private.is_current_course_section_member(caller,code,section_value) then raise exception 'Current-semester course section enrollment required' using errcode='42501'; end if;
  return query
  select p.id,p.name,p.major,case when p.share_year then p.year else null end,
    case when p.share_interests then p.interests else null end,
    case when p.share_residence_status then p.residence_status else null end,
    coalesce((select array_agg(distinct mine.course_code||' '||mine.course_number order by mine.course_code||' '||mine.course_number)
      from public.course_enrollments mine join public.course_enrollments theirs
        on theirs.course_code=mine.course_code and theirs.course_number=mine.course_number and theirs.section=mine.section
      where mine.user_id=caller and theirs.user_id=p.id
        and private.is_current_course_section_member(caller,mine.course_code||' '||mine.course_number,mine.section)
        and private.is_current_course_section_member(p.id,mine.course_code||' '||mine.course_number,mine.section)),'{}'::text[])
  from public.course_enrollments e join public.profiles p on p.id=e.user_id
  where e.course_code=split_part(code,' ',1) and e.course_number=split_part(code,' ',2)
    and e.section=section_value and e.user_id<>caller and private.student_visible(caller,e.user_id,false)
    and private.can_view_classmate_in_section(caller,p.id,code,section_value)
    and not exists(select 1 from public.friendships f where f.user_id=least(caller,p.id) and f.friend_id=greatest(caller,p.id))
  group by p.id,p.name,p.major,p.share_year,p.year,p.share_interests,p.interests,p.share_residence_status,p.residence_status
  order by p.name,p.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.course_recommendation_profiles_by_professor(p_course_code text, p_section text, p_professor_first_name text, p_professor_last_name text)
 RETURNS TABLE(student_id uuid, name text, major text, year text, interests text[], residence_status text, shared_courses text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section)); first_value text:=btrim(p_professor_first_name); last_value text:=btrim(p_professor_last_name);
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' or section_value is null or section_value !~ '^[A-Z0-9-]{1,20}$' or length(first_value) not between 1 and 80 or length(last_value) not between 1 and 80 then
    raise exception 'Invalid course offering' using errcode='22023';
  end if;
  if not private.is_current_course_professor_member(caller,code,section_value,first_value,last_value) then raise exception 'Current verified course offering enrollment required' using errcode='42501'; end if;
  return query
  select p.id,p.name,p.major,case when p.share_year then p.year else null end,
    case when p.share_interests then p.interests else null end,
    case when p.share_residence_status then p.residence_status else null end,
    coalesce((select array_agg(distinct mine.course_code||' '||mine.course_number order by mine.course_code||' '||mine.course_number)
      from public.course_enrollments mine join public.course_enrollments theirs
        on theirs.course_code=mine.course_code and theirs.course_number=mine.course_number and theirs.section=mine.section
      where mine.user_id=caller and theirs.user_id=p.id
        and private.is_current_course_section_member(caller,mine.course_code||' '||mine.course_number,mine.section)
        and private.is_current_course_section_member(p.id,mine.course_code||' '||mine.course_number,mine.section)),'{}'::text[])
  from public.course_enrollments e join public.profiles p on p.id=e.user_id
  where e.course_code=split_part(code,' ',1) and e.course_number=split_part(code,' ',2) and e.section=section_value
    and lower(btrim(e.professor_first_name))=lower(first_value) and lower(btrim(e.professor_last_name))=lower(last_value)
    and e.user_id<>caller and private.student_visible(caller,e.user_id,false) and private.can_view_classmate_with_professor(caller,p.id,code,section_value,first_value,last_value)
    and not exists(select 1 from public.friendships f where f.user_id=least(caller,p.id) and f.friend_id=greatest(caller,p.id))
  group by p.id,p.name,p.major,p.share_year,p.year,p.share_interests,p.interests,p.share_residence_status,p.residence_status
  order by p.name,p.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.course_friend_relationships(p_course_code text, p_section text)
 RETURNS TABLE(student_id uuid, relationship text, request_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section));
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' or section_value is null or section_value !~ '^[A-Z0-9-]{1,20}$' then
    raise exception 'Invalid course section' using errcode='22023';
  end if;
  if not private.is_current_course_section_member(caller,code,section_value) then raise exception 'Current-semester course section enrollment required' using errcode='42501'; end if;
  return query with peers as (
    select distinct e.user_id peer_id from public.course_enrollments e
    where e.course_code=split_part(code,' ',1) and e.course_number=split_part(code,' ',2)
      and e.section=section_value and e.user_id<>caller and private.student_visible(caller,e.user_id,true)
      and private.can_view_classmate_in_section(caller,e.user_id,code,section_value)
  )
  select peers.peer_id,case when f.user_id is not null then 'accepted'
    when pending.sender_id=caller then 'outgoing_pending' when pending.recipient_id=caller then 'incoming_pending'
    when latest.status='declined' then 'declined' else 'none' end,coalesce(pending.id,latest.id)
  from peers
  left join public.friendships f on f.user_id=least(caller,peers.peer_id) and f.friend_id=greatest(caller,peers.peer_id)
  left join lateral(select r.* from public.friend_requests r where r.status='pending'
    and least(r.sender_id,r.recipient_id)=least(caller,peers.peer_id)
    and greatest(r.sender_id,r.recipient_id)=greatest(caller,peers.peer_id) order by r.created_at desc limit 1) pending on true
  left join lateral(select r.* from public.friend_requests r where r.status<>'pending'
    and least(r.sender_id,r.recipient_id)=least(caller,peers.peer_id)
    and greatest(r.sender_id,r.recipient_id)=greatest(caller,peers.peer_id) order by r.created_at desc limit 1) latest on true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.course_friend_relationships_by_professor(p_course_code text, p_section text, p_professor_first_name text, p_professor_last_name text)
 RETURNS TABLE(student_id uuid, relationship text, request_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section)); first_value text:=btrim(p_professor_first_name); last_value text:=btrim(p_professor_last_name);
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' or section_value is null or section_value !~ '^[A-Z0-9-]{1,20}$' or length(first_value) not between 1 and 80 or length(last_value) not between 1 and 80 then
    raise exception 'Invalid course offering' using errcode='22023';
  end if;
  if not private.is_current_course_professor_member(caller,code,section_value,first_value,last_value) then raise exception 'Current verified course offering enrollment required' using errcode='42501'; end if;
  return query with peers as (
    select distinct e.user_id peer_id from public.course_enrollments e
    where e.course_code=split_part(code,' ',1) and e.course_number=split_part(code,' ',2) and e.section=section_value
      and lower(btrim(e.professor_first_name))=lower(first_value) and lower(btrim(e.professor_last_name))=lower(last_value)
      and e.user_id<>caller and private.student_visible(caller,e.user_id,true) and private.can_view_classmate_with_professor(caller,e.user_id,code,section_value,first_value,last_value)
  )
  select peers.peer_id,case when f.user_id is not null then 'accepted'
    when pending.sender_id=caller then 'outgoing_pending' when pending.recipient_id=caller then 'incoming_pending'
    when latest.status='declined' then 'declined' else 'none' end,coalesce(pending.id,latest.id)
  from peers
  left join public.friendships f on f.user_id=least(caller,peers.peer_id) and f.friend_id=greatest(caller,peers.peer_id)
  left join lateral(select r.* from public.friend_requests r where r.status='pending'
    and least(r.sender_id,r.recipient_id)=least(caller,peers.peer_id)
    and greatest(r.sender_id,r.recipient_id)=greatest(caller,peers.peer_id) order by r.created_at desc limit 1) pending on true
  left join lateral(select r.* from public.friend_requests r where r.status<>'pending'
    and least(r.sender_id,r.recipient_id)=least(caller,peers.peer_id)
    and greatest(r.sender_id,r.recipient_id)=greatest(caller,peers.peer_id) order by r.created_at desc limit 1) latest on true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_classmate_profile(p_course_code text, p_section text, p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section)); result jsonb;
begin
 if not private.student_visible(auth.uid(),p_student_id,true) then return null; end if;
  if auth.uid() is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' or section_value is null or section_value !~ '^[A-Z0-9-]{1,20}$' then
    raise exception 'Invalid course section' using errcode='22023';
  end if;
  if not private.can_view_classmate_in_section(auth.uid(),p_student_id,code,section_value) then return null; end if;
  select jsonb_build_object('student_id',id,'name',name,'major',major,'has_shared_avatar',share_avatar and avatar_path is not null)
    || case when share_year then jsonb_build_object('year',year) else '{}'::jsonb end
    || case when share_interests then jsonb_build_object('interests',interests) else '{}'::jsonb end
    || case when share_residence_status then jsonb_build_object('residence_status',residence_status) else '{}'::jsonb end
    into result from public.profiles where id=p_student_id;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_classmate_profile_by_professor(p_course_code text, p_section text, p_professor_first_name text, p_professor_last_name text, p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not private.student_visible(auth.uid(),p_student_id,true) then return null; end if;
  if auth.uid() is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if not private.can_view_classmate_with_professor(auth.uid(),p_student_id,p_course_code,p_section,p_professor_first_name,p_professor_last_name) then return null; end if;
  select jsonb_build_object('student_id',id,'name',name,'major',major,'has_shared_avatar',share_avatar and avatar_path is not null)
    || case when share_year then jsonb_build_object('year',year) else '{}'::jsonb end
    || case when share_interests then jsonb_build_object('interests',interests) else '{}'::jsonb end
    || case when share_residence_status then jsonb_build_object('residence_status',residence_status) else '{}'::jsonb end
    into result from public.profiles where id=p_student_id;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_classmate_avatar(p_caller_id uuid, p_student_id uuid, p_course_code text, p_section text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.avatar_path from public.profiles p
  where private.student_visible(p_caller_id,p_student_id,true) and p.id=p_student_id and p.share_avatar and p.avatar_path is not null
    and private.can_view_classmate_in_section(p_caller_id,p_student_id,p_course_code,p_section);
$function$;

CREATE OR REPLACE FUNCTION public.resolve_classmate_avatar_by_professor(p_caller_id uuid, p_student_id uuid, p_course_code text, p_section text, p_professor_first_name text, p_professor_last_name text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.avatar_path from public.profiles p where private.student_visible(p_caller_id,p_student_id,true) and p.id=p_student_id and p.share_avatar and p.avatar_path is not null
    and private.can_view_classmate_with_professor(p_caller_id,p_student_id,p_course_code,p_section,p_professor_first_name,p_professor_last_name);
$function$;

CREATE OR REPLACE FUNCTION public.resolve_friend_avatar(p_caller_id uuid, p_student_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.avatar_path from public.profiles p
  where private.student_visible(p_caller_id,p_student_id,true) and p.id = p_student_id and p.share_avatar and p.avatar_path is not null
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
$function$;

-- Caller UUIDs are trusted only at the service boundary. CREATE OR REPLACE
-- preserves ACLs, so explicitly reset these instead of relying on the audit.
revoke all on function public.resolve_friend_avatar(uuid,uuid),
 public.resolve_classmate_avatar_by_professor(uuid,uuid,text,text,text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.resolve_friend_avatar(uuid,uuid),
 public.resolve_classmate_avatar_by_professor(uuid,uuid,text,text,text,text) to service_role;

CREATE OR REPLACE FUNCTION public.send_friend_request_to_student(p_student_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid := auth.uid(); request_id uuid;
begin
 perform private.student_pair_lock(caller,p_student_id);
 perform 1 from public.profiles where id=p_student_id for share;
 if not private.student_visible(caller,p_student_id,true) then raise exception 'Student unavailable' using errcode='42501'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.send_friend_request(p_course_code text, p_section text, p_student_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section)); request_id uuid;
begin
 perform private.student_pair_lock(caller,p_student_id);
 perform 1 from public.profiles where id=p_student_id for share;
 if not private.student_visible(caller,p_student_id,true) then raise exception 'Student unavailable' using errcode='42501'; end if;
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' or section_value is null or section_value !~ '^[A-Z0-9-]{1,20}$' then
    raise exception 'Invalid course section' using errcode='22023';
  end if;
  if p_student_id is null or p_student_id=caller or not private.can_view_classmate_in_section(caller,p_student_id,code,section_value) then
    raise exception 'Student must be an eligible classmate in this course section' using errcode='42501';
  end if;
  if exists(select 1 from public.friendships f where f.user_id=least(caller,p_student_id) and f.friend_id=greatest(caller,p_student_id)) then
    raise exception 'Students are already friends' using errcode='23505';
  end if;
  if exists(select 1 from public.friend_requests r where r.status='pending' and least(r.sender_id,r.recipient_id)=least(caller,p_student_id) and greatest(r.sender_id,r.recipient_id)=greatest(caller,p_student_id)) then
    raise exception 'A pending request already exists for this student pair' using errcode='23505';
  end if;
  insert into public.friend_requests(sender_id,recipient_id) values(caller,p_student_id) returning id into request_id;
  return request_id;
exception when unique_violation then
  raise exception 'A pending request already exists for this student pair' using errcode='23505';
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_friend_request_to_classmate(p_course_code text, p_section text, p_professor_first_name text, p_professor_last_name text, p_student_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section)); first_value text:=btrim(p_professor_first_name); last_value text:=btrim(p_professor_last_name); request_id uuid;
begin
 perform private.student_pair_lock(caller,p_student_id);
 perform 1 from public.profiles where id=p_student_id for share;
 if not private.student_visible(caller,p_student_id,true) then raise exception 'Student unavailable' using errcode='42501'; end if;
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' or section_value is null or section_value !~ '^[A-Z0-9-]{1,20}$' or length(first_value) not between 1 and 80 or length(last_value) not between 1 and 80 then
    raise exception 'Invalid course offering' using errcode='22023';
  end if;
  if p_student_id is null or p_student_id=caller or not private.can_view_classmate_with_professor(caller,p_student_id,code,section_value,first_value,last_value) then
    raise exception 'Student must be an eligible classmate in this course offering' using errcode='42501';
  end if;
  if exists(select 1 from public.friendships f where f.user_id=least(caller,p_student_id) and f.friend_id=greatest(caller,p_student_id)) then
    raise exception 'Students are already friends' using errcode='23505';
  end if;
  if exists(select 1 from public.friend_requests r where r.status='pending' and least(r.sender_id,r.recipient_id)=least(caller,p_student_id) and greatest(r.sender_id,r.recipient_id)=greatest(caller,p_student_id)) then
    raise exception 'A pending request already exists for this student pair' using errcode='23505';
  end if;
  insert into public.friend_requests(sender_id,recipient_id) values(caller,p_student_id) returning id into request_id;
  return request_id;
exception when unique_violation then
  raise exception 'A pending request already exists for this student pair' using errcode='23505';
end;
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_friend_request(p_request_id uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid := auth.uid(); req public.friend_requests;
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('accept','decline') then raise exception 'Action must be accept or decline' using errcode = '22023'; end if;
  select * into req from public.friend_requests where id=p_request_id;
  if not found or req.recipient_id<>caller then raise exception 'Request unavailable' using errcode='42501'; end if;
  perform private.student_pair_lock(req.sender_id,req.recipient_id);
  if private.students_blocked(req.sender_id,req.recipient_id) or not private.dm_eligible(req.sender_id) then raise exception 'Request unavailable' using errcode='42501'; end if;
  select * into req from public.friend_requests where id = p_request_id for update;
  if not found or req.recipient_id <> caller or req.status <> 'pending' then raise exception 'Pending incoming request not found' using errcode = '42501'; end if;
  update public.friend_requests set status = case when p_action = 'accept' then 'accepted' else 'declined' end,
    updated_at = now(), responded_at = now() where id = req.id;
  if p_action = 'accept' then
    insert into public.friendships(user_id,friend_id) values (least(req.sender_id,req.recipient_id),greatest(req.sender_id,req.recipient_id)) on conflict do nothing;
  end if;
end;
$function$;

create function private.dm_block_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.dm_conversations;
begin
 select * into c from public.dm_conversations where id=new.conversation_id;
 perform private.student_pair_lock(c.user_low,c.user_high);
 if private.students_blocked(c.user_low,c.user_high) then raise exception 'Contact unavailable' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function private.dm_block_guard() from public,anon,authenticated;
create trigger dm_block_guard before insert on public.dm_messages for each row execute function private.dm_block_guard();

CREATE OR REPLACE FUNCTION public.dm_contact_state(p_student_id uuid, p_course_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); c public.dm_conversations; p public.profiles; eligible boolean; code text:=private.dm_code(p_course_code);
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_student_id is null or p_student_id=caller then return null; end if;
 select * into c from public.dm_conversations where user_low=least(caller,p_student_id) and user_high=greatest(caller,p_student_id);
 if c.id is null and not private.student_visible(caller,p_student_id,true) then return null; end if;
 if c.id is null and not private.dm_contact(caller,p_student_id,code) then return null; end if;
 select * into p from public.profiles where id=p_student_id;
 eligible:=private.dm_eligible(p_student_id) and not private.students_blocked(caller,p_student_id);
 return jsonb_build_object('student_id',p_student_id,'name',case when eligible then p.name else 'Unavailable student' end,
 'conversation_id',c.id,'can_send',eligible and (c.id is not null or p.allow_new_dms),
 'reason',case when not eligible then 'unavailable' when c.id is null and not p.allow_new_dms then 'closed' else null end);
end; $function$;

CREATE OR REPLACE FUNCTION public.dm_send_message(p_student_id uuid, p_body text, p_client_message_id uuid, p_course_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); c public.dm_conversations; m public.dm_messages; open boolean; code text:=private.dm_code(p_course_code); whitespace text;
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_student_id is null or caller=p_student_id or p_client_message_id is null then raise exception 'Invalid recipient or request' using errcode='22023'; end if;
 -- Explicit ECMAScript whitespace set, matching the client, including Unicode spaces.
 whitespace:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
 if p_body is null or char_length(p_body)>2000 or translate(p_body,whitespace,'')='' then raise exception 'Text must contain 1 to 2000 characters' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(least(caller,p_student_id)::text||greatest(caller,p_student_id)::text,0));
 select * into m from public.dm_messages where sender_id=caller and client_message_id=p_client_message_id;
 if found then
  select * into c from public.dm_conversations where id=m.conversation_id;
  if p_student_id not in(c.user_low,c.user_high) or m.body<>p_body then raise exception 'Request identifier already used' using errcode='23505'; end if;
  return to_jsonb(m);
 end if;
 if not private.dm_eligible(p_student_id) then raise exception 'Contact unavailable' using errcode='42501'; end if;
 select * into c from public.dm_conversations where user_low=least(caller,p_student_id) and user_high=greatest(caller,p_student_id) for update;
 if c.id is null then
  perform 1 from public.profiles where id=p_student_id for update;
  if not private.student_visible(caller,p_student_id,true) then raise exception 'Contact unavailable' using errcode='42501'; end if;
  if not private.dm_contact(caller,p_student_id,code) then raise exception 'Contact unavailable' using errcode='42501'; end if;
  select allow_new_dms into open from public.profiles where id=p_student_id for update;
  if open is distinct from true then raise exception 'New direct messages are closed' using errcode='P0001'; end if;
  insert into public.dm_conversations(user_low,user_high) values(least(caller,p_student_id),greatest(caller,p_student_id)) returning * into c;
 end if;
 insert into public.dm_messages(conversation_id,sequence,sender_id,client_message_id,body)
 values(c.id,c.last_sequence+1,caller,p_client_message_id,p_body) returning * into m;
 update public.dm_conversations set last_sequence=m.sequence,last_message_at=m.created_at where id=c.id;
 return to_jsonb(m);
end; $function$;

revoke all on function public.find_classmates(text,text) from public,anon,authenticated,service_role;

revoke all on function public.course_recommendation_profiles(text,text) from public,anon,authenticated,service_role;

revoke all on function public.course_friend_relationships(text,text) from public,anon,authenticated,service_role;

revoke all on function public.get_classmate_profile(text,text,uuid) from public,anon,authenticated,service_role;

revoke all on function public.send_friend_request(text,text,uuid) from public,anon,authenticated,service_role;

revoke all on function public.resolve_classmate_avatar(uuid,uuid,text,text) from public,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION private.group_mutate(p_group uuid, p_members uuid[], p_name text, p_request uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); ids uuid[]; student uuid; payload jsonb; receipt private.group_mutation_receipts; g public.group_conversations; clean_name text:=nullif(btrim(p_name),''); is_open boolean; pair record;
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_request is null or p_members is null or cardinality(p_members) not between (case when p_group is null then 2 else 1 end) and 49 or array_position(p_members,null) is not null or caller=any(p_members) or char_length(clean_name)>80 then raise exception 'Invalid group members or name' using errcode='22023'; end if;
 select array_agg(x order by x) into ids from (select distinct unnest(p_members) x)s;
 if cardinality(ids)<>cardinality(p_members) then raise exception 'Duplicate members' using errcode='22023'; end if;
 payload:=jsonb_build_object('group_id',p_group,'members',to_jsonb(ids),'name',clean_name);
 perform pg_advisory_xact_lock(hashtextextended('group-mutation:'||caller::text||p_request::text,0));
 select * into receipt from private.group_mutation_receipts where user_id=caller and request_id=p_request;
 if found then
  if receipt.payload<>payload then raise exception 'Request identifier already used' using errcode='23505'; end if;
  return receipt.group_id;
 end if;
 if p_group is not null then
  select * into g from public.group_conversations where id=p_group for update;
  if g.creator_id is distinct from caller then raise exception 'Creator required' using errcode='42501'; end if;
  if (select count(*) from public.group_members where group_id=g.id)+cardinality(ids)>50 then raise exception 'Group limit is 50' using errcode='22023'; end if;
  if exists(select 1 from public.group_members where group_id=g.id and user_id=any(ids)) then raise exception 'Already a member' using errcode='22023'; end if;
 end if;
 -- Acquire pair locks before existing friendship key-share locks to match block ordering.
 for pair in
  with members as (
   select unnest(ids||array[caller]) id
   union select user_id from public.group_members where group_id=p_group
  ) select a.id low,b.id high from members a join members b on a.id<b.id order by a.id,b.id
 loop
  perform private.student_pair_lock(pair.low,pair.high);
 end loop;
 foreach student in array ids loop
  select allow_new_dms into is_open from public.profiles where id=student for update;
  if not found or not private.dm_eligible(student) then raise exception 'Friend unavailable' using errcode='42501'; end if;
  perform 1 from public.friendships where user_id=least(caller,student) and friend_id=greatest(caller,student) for key share;
  if not found then raise exception 'Accepted friend required' using errcode='42501'; end if;
  if not is_open then raise exception 'New messages are closed for a selected friend' using errcode='P0001'; end if;
 end loop;
 if p_group is null then
  insert into public.group_conversations(creator_id,name) values(caller,clean_name) returning * into g;
  insert into public.group_members(group_id,user_id,joined_after_sequence,last_read_sequence) values(g.id,caller,0,0);
 end if;
 insert into public.group_members(group_id,user_id,joined_after_sequence,last_read_sequence) select g.id,x,g.last_sequence,g.last_sequence from unnest(ids)x;
 update public.group_conversations set metadata_revision=metadata_revision+1 where id=g.id;
 insert into private.group_mutation_receipts values(caller,p_request,payload,g.id);
 return g.id;
end; $function$;

CREATE OR REPLACE FUNCTION public.create_study_group(p_course_code text, p_section text, p_name text, p_invitees uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := auth.uid();
  code text := regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
  section_value text := upper(btrim(p_section));
  group_id uuid;
  invitee uuid;
  pair record;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$'
    or section_value is null or section_value !~ '^[A-Z0-9-]{1,20}$' then
    raise exception 'Invalid course section' using errcode='22023';
  end if;
  if not private.is_current_course_section_member(caller,code,section_value) then
    raise exception 'Current course section membership required' using errcode='42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Group name must be 1 to 80 characters' using errcode='22023';
  end if;
  if p_invitees is null or cardinality(p_invitees) not between 1 and 7
    or array_position(p_invitees,null) is not null
    or (select count(distinct x) from unnest(p_invitees) x) <> cardinality(p_invitees) then
    raise exception 'Invite 1 to 7 different classmates' using errcode='22023';
  end if;
  foreach invitee in array p_invitees loop
    if not private.can_view_classmate_in_section(caller,invitee,code,section_value) then
      raise exception 'Every invitee must be a visible classmate in this section' using errcode='42501';
    end if;
  end loop;
  -- Block-only admission serialization; preserve Study Buddies behavior otherwise.
  for pair in
    with members as (select distinct unnest(p_invitees||array[caller]) id)
    select a.id low,b.id high from members a join members b on a.id<b.id order by a.id,b.id
  loop
    perform private.student_pair_lock(pair.low,pair.high);
    if private.students_blocked(pair.low,pair.high) then raise exception 'Student unavailable' using errcode='42501'; end if;
  end loop;
  insert into public.study_groups(course_code,course_section,name,created_by)
    values(code,section_value,btrim(p_name),caller) returning id into group_id;
  insert into public.study_group_members(group_id,user_id,role,status)
    values(group_id,caller,'owner','accepted');
  insert into public.study_group_members(group_id,user_id,role,status)
    select group_id,invited_id,'member','pending' from unnest(p_invitees) as invited(invited_id);
  return group_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_study_group_invite(p_group_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); code text; section_value text;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  if p_accept is null then raise exception 'Choose whether to accept or decline' using errcode='22023'; end if;
  if not exists(select 1 from public.study_group_members where group_id=p_group_id and user_id=caller and status='pending') then raise exception 'Pending invitation not found' using errcode='42501'; end if;
  -- Authorize before locking; recheck membership after acquiring the group row.
  -- Group row precedes membership rows and admission pair locks.
  perform 1 from public.study_groups where id=p_group_id for update;
  select g.course_code,g.course_section into code,section_value
  from public.study_groups g join public.study_group_members m on m.group_id=g.id
  where g.id=p_group_id and m.user_id=caller and m.status='pending' for update of m;
  if not found then raise exception 'Pending invitation not found' using errcode='42501'; end if;
  if p_accept and section_value is not null
    and not private.is_current_course_section_member(caller,code,section_value) then
    raise exception 'Current course section membership required to join' using errcode='42501';
  end if;
  if p_accept and section_value is null
    and not exists(select 1 from public.user_courses where user_id=caller and course_code=code) then
    raise exception 'Save this course before joining the group' using errcode='42501';
  end if;
  if p_accept then
    update public.study_group_members set status='accepted' where group_id=p_group_id and user_id=caller;
  else
    delete from public.study_group_members where group_id=p_group_id and user_id=caller;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.leave_study_group(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid := auth.uid(); next_owner uuid;
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if not exists(select 1 from public.study_group_members where group_id=p_group_id and user_id=caller and status='accepted') then raise exception 'Accepted group membership required' using errcode='42501'; end if;
  -- Authorize before locking; recheck membership after acquiring the group row.
  -- Group row precedes membership rows and admission pair locks.
  perform 1 from public.study_groups where id=p_group_id for update;
  if not exists(select 1 from public.study_group_members where group_id=p_group_id and user_id=caller and status='accepted') then raise exception 'Accepted group membership required' using errcode='42501'; end if;
  if exists(select 1 from public.study_group_members where group_id=p_group_id and user_id=caller and role='owner') then
    select user_id into next_owner from public.study_group_members where group_id=p_group_id and user_id<>caller and status='accepted' order by created_at,user_id limit 1;
    if next_owner is null then delete from public.study_groups where id=p_group_id; return; end if;
    update public.study_group_members set role='owner' where group_id=p_group_id and user_id=next_owner;
    update public.study_groups set created_by=next_owner where id=p_group_id;
  end if;
  delete from public.study_group_members where group_id=p_group_id and user_id=caller;
end; $function$;

-- Block-only guards preserve the existing membership model; no leave/add roles change.
create function private.group_admission_block_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare peer uuid;
begin
 for peer in select user_id from public.group_members where group_id=new.group_id and user_id<>new.user_id order by user_id loop
  perform private.student_pair_lock(new.user_id,peer);
  if private.students_blocked(new.user_id,peer) then raise exception 'Student unavailable' using errcode='42501'; end if;
 end loop;
 return new;
end; $$;
create function private.study_admission_block_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare peer uuid;
begin
 if tg_op='UPDATE' then
  if old.status=new.status or new.status<>'accepted' then return new; end if;
 end if;
 for peer in select user_id from public.study_group_members where group_id=new.group_id and status='accepted' and user_id<>new.user_id order by user_id loop
  perform private.student_pair_lock(new.user_id,peer);
  if private.students_blocked(new.user_id,peer) then raise exception 'Student unavailable' using errcode='42501'; end if;
 end loop;
 return new;
end; $$;
revoke all on function private.group_admission_block_guard(),private.study_admission_block_guard() from public,anon,authenticated;
create trigger group_admission_block_guard before insert on public.group_members for each row execute function private.group_admission_block_guard();
create trigger study_admission_block_guard before insert or update of status on public.study_group_members for each row execute function private.study_admission_block_guard();

-- Caller identity is always session-derived; co-membership grants only this minimal projection.
create function public.group_member_identity(p_group_id uuid,p_student_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('student_id',p.id,'name',p.name,'has_picture',p.avatar_path is not null)
 from public.profiles p where p.id=p_student_id and private.dm_eligible(p.id)
 and private.group_floor(p_group_id) is not null
 and exists(select 1 from public.group_members where group_id=p_group_id and user_id=p.id);
$$;
create function public.resolve_group_avatar(p_caller_id uuid,p_group_id uuid,p_student_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select p.avatar_path from public.profiles p where p.id=p_student_id
 and private.dm_eligible(p_caller_id) and private.dm_eligible(p_student_id)
 and exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_caller_id)
 and exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_student_id);
$$;
revoke all on function public.group_member_identity(uuid,uuid),public.resolve_group_avatar(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.group_member_identity(uuid,uuid) to authenticated;
grant execute on function public.resolve_group_avatar(uuid,uuid,uuid) to service_role;
-- Fail closed if an unexpected inherited role grant defeats explicit revocation.
do $$
declare signature text;
begin
 foreach signature in array array[
  'public.resolve_friend_avatar(uuid,uuid)',
  'public.resolve_classmate_avatar_by_professor(uuid,uuid,text,text,text,text)',
  'public.resolve_group_avatar(uuid,uuid,uuid)'
 ] loop
  if has_function_privilege('anon',signature,'execute')
    or has_function_privilege('authenticated',signature,'execute')
    or not has_function_privilege('service_role',signature,'execute') then
   raise exception 'Unsafe avatar resolver privileges: %',signature;
  end if;
 end loop;
 foreach signature in array array[
  'public.find_classmates(text,text)',
  'public.course_recommendation_profiles(text,text)',
  'public.course_friend_relationships(text,text)',
  'public.get_classmate_profile(text,text,uuid)',
  'public.send_friend_request(text,text,uuid)',
  'public.resolve_classmate_avatar(uuid,uuid,text,text)'
 ] loop
  if has_function_privilege('anon',signature,'execute')
    or has_function_privilege('authenticated',signature,'execute')
    or has_function_privilege('service_role',signature,'execute') then
   raise exception 'Unsafe retired RPC privileges: %',signature;
  end if;
 end loop;
end; $$;
commit;
