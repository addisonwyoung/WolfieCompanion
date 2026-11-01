-- Scope dashboard classmate discovery, recommendations, profiles, and
-- course-based friend actions to the exact current course section.
begin;

create or replace function private.is_current_course_section_member(p_user_id uuid,p_course_code text,p_section text)
returns boolean language sql stable security definer set search_path = '' as $$
  with parsed as (
    select regexp_match(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$') as course,
      upper(btrim(p_section)) as section
  ), term as (select * from private.resolve_current_semester(now()))
  select p.course is not null and p.section ~ '^[A-Z0-9-]{1,20}$' and exists(
    select 1 from public.course_enrollments e cross join term t
    where e.user_id=p_user_id and e.course_code=p.course[1] and e.course_number=p.course[2]
      and e.section=p.section and e.semester=t.semester and e.academic_year=t.academic_year
      and e.verification_status in ('verified','pending','rejected')
  ) from parsed p;
$$;
revoke all on function private.is_current_course_section_member(uuid,text,text) from public,anon,authenticated;

create or replace function private.can_view_classmate_in_section(caller uuid,peer uuid,p_course_code text,p_section text)
returns boolean language sql stable security definer set search_path = '' as $$
  select caller is not null and peer is not null and caller<>peer
    and private.is_current_course_section_member(caller,p_course_code,p_section)
    and private.is_current_course_section_member(peer,p_course_code,p_section)
    and (select count(distinct u.id)=2 from auth.users u join auth.identities i on i.user_id=u.id
      where u.id in(caller,peer) and u.email_confirmed_at is not null
        and lower(split_part(u.email,'@',2))='stonybrook.edu' and u.email ~ '^[^@]+@[^@]+$'
        and i.provider='google' and i.identity_data->>'email_verified'='true'
        and lower(i.identity_data->>'email')=lower(u.email));
$$;
revoke all on function private.can_view_classmate_in_section(uuid,uuid,text,text) from public,anon,authenticated;

drop function if exists public.find_classmates(text);
create function public.find_classmates(p_course_code text,p_section text)
returns table(student_id uuid,name text,major text)
language plpgsql stable security definer set search_path = '' as $$
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
      and e.section=section_value and e.user_id<>caller
      and private.can_view_classmate_in_section(caller,e.user_id,code,section_value)
    order by p.name,p.id;
end;
$$;
revoke all on function public.find_classmates(text,text) from public,anon,authenticated;
grant execute on function public.find_classmates(text,text) to authenticated;

drop function if exists public.course_recommendation_profiles(text);
create function public.course_recommendation_profiles(p_course_code text,p_section text)
returns table(student_id uuid,name text,major text,year text,interests text[],residence_status text,shared_courses text[])
language plpgsql stable security definer set search_path = '' as $$
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
    and e.section=section_value and e.user_id<>caller
    and private.can_view_classmate_in_section(caller,p.id,code,section_value)
    and not exists(select 1 from public.friendships f where f.user_id=least(caller,p.id) and f.friend_id=greatest(caller,p.id))
  group by p.id,p.name,p.major,p.share_year,p.year,p.share_interests,p.interests,p.share_residence_status,p.residence_status
  order by p.name,p.id;
end;
$$;
revoke all on function public.course_recommendation_profiles(text,text) from public,anon,authenticated;
grant execute on function public.course_recommendation_profiles(text,text) to authenticated;

drop function if exists public.course_friend_relationships(text);
create function public.course_friend_relationships(p_course_code text,p_section text)
returns table(student_id uuid,relationship text,request_id uuid)
language plpgsql stable security definer set search_path = '' as $$
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
      and e.section=section_value and e.user_id<>caller
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
$$;
revoke all on function public.course_friend_relationships(text,text) from public,anon,authenticated;
grant execute on function public.course_friend_relationships(text,text) to authenticated;

drop function if exists public.send_friend_request(text,uuid);
create function public.send_friend_request(p_course_code text,p_section text,p_student_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section)); request_id uuid;
begin
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
$$;
revoke all on function public.send_friend_request(text,text,uuid) from public,anon,authenticated;
grant execute on function public.send_friend_request(text,text,uuid) to authenticated;

drop function if exists public.get_classmate_profile(text,uuid);
create function public.get_classmate_profile(p_course_code text,p_section text,p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section)); result jsonb;
begin
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
$$;
revoke all on function public.get_classmate_profile(text,text,uuid) from public,anon,authenticated;
grant execute on function public.get_classmate_profile(text,text,uuid) to authenticated;

drop function if exists public.resolve_classmate_avatar(uuid,uuid,text);
create function public.resolve_classmate_avatar(p_caller_id uuid,p_student_id uuid,p_course_code text,p_section text)
returns text language sql stable security definer set search_path = '' as $$
  select p.avatar_path from public.profiles p
  where p.id=p_student_id and p.share_avatar and p.avatar_path is not null
    and private.can_view_classmate_in_section(p_caller_id,p_student_id,p_course_code,p_section);
$$;
revoke all on function public.resolve_classmate_avatar(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.resolve_classmate_avatar(uuid,uuid,text,text) to service_role;

commit;
