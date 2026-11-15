-- Scope dashboard discovery to the exact course, section, and professor.
-- Existing section-only membership helpers remain available to study groups.
begin;

create function private.is_current_course_professor_member(
  p_user_id uuid,p_course_code text,p_section text,p_professor_first_name text,p_professor_last_name text
) returns boolean language sql stable security definer set search_path = '' as $$
  with parsed as (
    select regexp_match(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$') as course,
      upper(btrim(p_section)) as section,lower(btrim(p_professor_first_name)) as first_name,
      lower(btrim(p_professor_last_name)) as last_name
  ), term as (select * from private.resolve_current_semester(now()))
  select p.course is not null and p.section ~ '^[A-Z0-9-]{1,20}$'
    and length(p.first_name) between 1 and 80 and length(p.last_name) between 1 and 80
    and exists(select 1 from public.course_enrollments e cross join term t
      where e.user_id=p_user_id and e.course_code=p.course[1] and e.course_number=p.course[2]
        and e.section=p.section and lower(btrim(e.professor_first_name))=p.first_name
        and lower(btrim(e.professor_last_name))=p.last_name and e.semester=t.semester
        and e.academic_year=t.academic_year and e.verification_status='verified')
  from parsed p;
$$;
revoke all on function private.is_current_course_professor_member(uuid,text,text,text,text) from public,anon,authenticated;

create function private.can_view_classmate_with_professor(
  p_caller_id uuid,p_peer_id uuid,p_course_code text,p_section text,p_professor_first_name text,p_professor_last_name text
) returns boolean language sql stable security definer set search_path = '' as $$
  select p_caller_id is not null and p_peer_id is not null and p_caller_id<>p_peer_id
    and private.is_current_course_professor_member(p_caller_id,p_course_code,p_section,p_professor_first_name,p_professor_last_name)
    and private.is_current_course_professor_member(p_peer_id,p_course_code,p_section,p_professor_first_name,p_professor_last_name)
    and (select count(distinct u.id)=2 from auth.users u join auth.identities i on i.user_id=u.id
      where u.id in(p_caller_id,p_peer_id) and u.email_confirmed_at is not null
        and lower(split_part(u.email,'@',2))='stonybrook.edu' and u.email ~ '^[^@]+@[^@]+$'
        and i.provider='google' and i.identity_data->>'email_verified'='true'
        and lower(i.identity_data->>'email')=lower(u.email));
$$;
revoke all on function private.can_view_classmate_with_professor(uuid,uuid,text,text,text,text) from public,anon,authenticated;

create function public.find_classmates_by_professor(
  p_course_code text,p_section text,p_professor_first_name text,p_professor_last_name text
) returns table(student_id uuid,name text,major text)
language plpgsql stable security definer set search_path = '' as $$
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
      and e.user_id<>caller and private.can_view_classmate_with_professor(caller,e.user_id,code,section_value,first_value,last_value)
    order by p.name,p.id;
end;
$$;
revoke all on function public.find_classmates_by_professor(text,text,text,text) from public,anon,authenticated;
grant execute on function public.find_classmates_by_professor(text,text,text,text) to authenticated;

create function public.course_recommendation_profiles_by_professor(
  p_course_code text,p_section text,p_professor_first_name text,p_professor_last_name text
) returns table(student_id uuid,name text,major text,year text,interests text[],residence_status text,shared_courses text[])
language plpgsql stable security definer set search_path = '' as $$
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
    and e.user_id<>caller and private.can_view_classmate_with_professor(caller,p.id,code,section_value,first_value,last_value)
    and not exists(select 1 from public.friendships f where f.user_id=least(caller,p.id) and f.friend_id=greatest(caller,p.id))
  group by p.id,p.name,p.major,p.share_year,p.year,p.share_interests,p.interests,p.share_residence_status,p.residence_status
  order by p.name,p.id;
end;
$$;
revoke all on function public.course_recommendation_profiles_by_professor(text,text,text,text) from public,anon,authenticated;
grant execute on function public.course_recommendation_profiles_by_professor(text,text,text,text) to authenticated;

create function public.course_friend_relationships_by_professor(
  p_course_code text,p_section text,p_professor_first_name text,p_professor_last_name text
) returns table(student_id uuid,relationship text,request_id uuid)
language plpgsql stable security definer set search_path = '' as $$
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
      and e.user_id<>caller and private.can_view_classmate_with_professor(caller,e.user_id,code,section_value,first_value,last_value)
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
revoke all on function public.course_friend_relationships_by_professor(text,text,text,text) from public,anon,authenticated;
grant execute on function public.course_friend_relationships_by_professor(text,text,text,text) to authenticated;

create function public.send_friend_request_to_classmate(
  p_course_code text,p_section text,p_professor_first_name text,p_professor_last_name text,p_student_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2'); section_value text:=upper(btrim(p_section)); first_value text:=btrim(p_professor_first_name); last_value text:=btrim(p_professor_last_name); request_id uuid;
begin
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
$$;
revoke all on function public.send_friend_request_to_classmate(text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.send_friend_request_to_classmate(text,text,text,text,uuid) to authenticated;

create function public.get_classmate_profile_by_professor(
  p_course_code text,p_section text,p_professor_first_name text,p_professor_last_name text,p_student_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if not private.can_view_classmate_with_professor(auth.uid(),p_student_id,p_course_code,p_section,p_professor_first_name,p_professor_last_name) then return null; end if;
  select jsonb_build_object('student_id',id,'name',name,'major',major,'has_shared_avatar',share_avatar and avatar_path is not null)
    || case when share_year then jsonb_build_object('year',year) else '{}'::jsonb end
    || case when share_interests then jsonb_build_object('interests',interests) else '{}'::jsonb end
    || case when share_residence_status then jsonb_build_object('residence_status',residence_status) else '{}'::jsonb end
    into result from public.profiles where id=p_student_id;
  return result;
end;
$$;
revoke all on function public.get_classmate_profile_by_professor(text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.get_classmate_profile_by_professor(text,text,text,text,uuid) to authenticated;

create function public.resolve_classmate_avatar_by_professor(
  p_caller_id uuid,p_student_id uuid,p_course_code text,p_section text,p_professor_first_name text,p_professor_last_name text
) returns text language sql stable security definer set search_path = '' as $$
  select p.avatar_path from public.profiles p where p.id=p_student_id and p.share_avatar and p.avatar_path is not null
    and private.can_view_classmate_with_professor(p_caller_id,p_student_id,p_course_code,p_section,p_professor_first_name,p_professor_last_name);
$$;
revoke all on function public.resolve_classmate_avatar_by_professor(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_classmate_avatar_by_professor(uuid,uuid,text,text,text,text) to service_role;

commit;
