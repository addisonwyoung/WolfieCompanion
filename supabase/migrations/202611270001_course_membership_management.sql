-- Owner-managed current-term enrollments. Manual Supabase deployment only.
-- Retain revoked rows and legacy course anchors for planner history, but do
-- not let revoked rows authorize current course access.
begin;

alter table public.course_enrollments add column if not exists revoked_at timestamptz;
alter table public.course_enrollments add column if not exists superseded_by uuid references public.course_enrollments(id) on delete restrict;

drop index if exists public.course_enrollments_exact_instance;
create unique index course_enrollments_exact_instance
  on public.course_enrollments(user_id,course_code,course_number,upper(section),
    lower(btrim(professor_first_name)),lower(btrim(professor_last_name)),semester,academic_year)
  where verification_status <> 'legacy_unverified' and revoked_at is null;

create or replace function private.prevent_duplicate_course_code_per_term()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.semester is null or new.academic_year is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    new.user_id::text||':'||new.course_code||':'||new.course_number||':'||new.semester||':'||new.academic_year::text,0));
  if exists(select 1 from public.course_enrollments e
    where e.user_id=new.user_id and e.course_code=new.course_code and e.course_number=new.course_number
      and e.semester=new.semester and e.academic_year=new.academic_year and e.revoked_at is null) then
    raise exception 'This course code is already on your dashboard for this semester and academic year.' using errcode='23505';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_duplicate_course_code_per_term() from public,anon,authenticated;

create or replace function private.is_current_course_member(p_user_id uuid,p_course text)
returns boolean language sql stable security definer set search_path = '' as $$
  with parsed as (
    select regexp_match(upper(btrim(p_course)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$') as parts
  ), term as (select * from private.resolve_current_semester(now()))
  select p.parts is not null and exists(select 1 from public.course_enrollments e cross join term t
    where e.user_id=p_user_id and e.course_code=p.parts[1] and e.course_number=p.parts[2]
      and e.semester=t.semester and e.academic_year=t.academic_year and e.revoked_at is null
      and e.verification_status in ('verified','pending','rejected'))
  from parsed p;
$$;
revoke all on function private.is_current_course_member(uuid,text) from public,anon,authenticated;

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
      and e.revoked_at is null and e.verification_status in ('verified','pending','rejected'))
  from parsed p;
$$;
revoke all on function private.is_current_course_section_member(uuid,text,text) from public,anon,authenticated;

create or replace function private.is_current_course_professor_member(
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
        and e.academic_year=t.academic_year and e.revoked_at is null and e.verification_status='verified')
  from parsed p;
$$;
revoke all on function private.is_current_course_professor_member(uuid,text,text,text,text) from public,anon,authenticated;

create or replace function public.my_current_enrollments()
returns table(enrollment_id uuid,legacy_course_id uuid,code text,section text,
  professor_first_name text,professor_last_name text,verification_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  return query select e.id,e.legacy_user_course_id,e.course_code||' '||e.course_number,e.section,
    e.professor_first_name,e.professor_last_name,e.verification_status
  from public.course_enrollments e cross join lateral private.resolve_current_semester(now()) t
  where e.user_id=auth.uid() and e.semester=t.semester and e.academic_year=t.academic_year
    and e.revoked_at is null and e.verification_status in ('verified','pending','rejected')
  order by e.course_code,e.course_number,e.section nulls first;
end;
$$;
revoke all on function public.my_current_enrollments() from public,anon,authenticated;
grant execute on function public.my_current_enrollments() to authenticated;

create function public.edit_current_course_enrollment(
  p_enrollment_id uuid,p_course_code text,p_section text,p_professor_first_name text,p_professor_last_name text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid:=auth.uid(); term_value text; year_value integer; full_code text; code_value text; number_value text;
  section_value text; first_value text; last_value text; old_row public.course_enrollments;
  new_row public.course_enrollments; result jsonb;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  if p_enrollment_id is null or p_course_code is null or p_section is null
    or p_professor_first_name is null or p_professor_last_name is null then
    raise exception 'Course, section, and professor are required' using errcode='22023';
  end if;
  full_code:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
  if full_code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' then raise exception 'Invalid course code' using errcode='22023'; end if;
  code_value:=split_part(full_code,' ',1); number_value:=split_part(full_code,' ',2);
  section_value:=upper(btrim(p_section)); first_value:=btrim(p_professor_first_name); last_value:=btrim(p_professor_last_name);
  if section_value !~ '^[A-Z0-9-]{1,20}$' or length(first_value) not between 1 and 80 or length(last_value) not between 1 and 80 then
    raise exception 'Enter a valid section and professor first and last names' using errcode='22023';
  end if;
  select semester,academic_year into term_value,year_value from private.resolve_current_semester(now());
  select e.* into old_row from public.course_enrollments e
  where e.id=p_enrollment_id and e.user_id=caller and e.semester=term_value and e.academic_year=year_value
    and e.verification_status in ('verified','pending','rejected') for update;
  if not found then raise exception 'Current course enrollment not found' using errcode='42501'; end if;

  -- A retry after a successful edit returns the replacement row, making the
  -- account refresh safe to retry if the client lost the first response.
  if old_row.revoked_at is not null and old_row.superseded_by is not null then
    select to_jsonb(e) into result from public.my_current_enrollments() e where e.enrollment_id=old_row.superseded_by;
    if result is not null then return result; end if;
    raise exception 'Updated course is no longer on the current dashboard' using errcode='42501';
  end if;
  if old_row.revoked_at is not null then raise exception 'Current course enrollment not found' using errcode='42501'; end if;

  if old_row.course_code=code_value and old_row.course_number=number_value and old_row.section=section_value
    and old_row.professor_first_name=first_value and old_row.professor_last_name=last_value then
    select to_jsonb(e) into result from public.my_current_enrollments() e where e.enrollment_id=old_row.id;
    return result;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller::text||':'||code_value||':'||number_value||':'||term_value||':'||year_value::text,0));
  if exists(select 1 from public.course_enrollments e where e.user_id=caller and e.id<>old_row.id
    and e.course_code=code_value and e.course_number=number_value and e.semester=term_value
    and e.academic_year=year_value and e.revoked_at is null) then
    raise exception 'This course code is already on your dashboard for this semester and academic year.' using errcode='23505';
  end if;

  update public.course_enrollments set revoked_at=clock_timestamp() where id=old_row.id and user_id=caller;
  perform public.save_enrollments(jsonb_build_array(jsonb_build_object(
    'code',full_code,'section',section_value,'professor_first_name',first_value,'professor_last_name',last_value)));

  select e.* into new_row from public.course_enrollments e
  where e.user_id=caller and e.course_code=code_value and e.course_number=number_value
    and e.section=section_value and lower(btrim(e.professor_first_name))=lower(first_value)
    and lower(btrim(e.professor_last_name))=lower(last_value) and e.semester=term_value
    and e.academic_year=year_value and e.revoked_at is null
  order by e.created_at desc limit 1;
  if not found then raise exception 'Updated course could not be confirmed' using errcode='P0001'; end if;

  update public.course_enrollments set superseded_by=new_row.id where id=old_row.id and user_id=caller;

  if old_row.legacy_user_course_id is not null and new_row.legacy_user_course_id is not null
    and old_row.legacy_user_course_id<>new_row.legacy_user_course_id then
    update public.academic_items set user_course_id=new_row.legacy_user_course_id
      where user_id=caller and user_course_id=old_row.legacy_user_course_id;
  end if;

  select to_jsonb(e) into result from public.my_current_enrollments() e where e.enrollment_id=new_row.id;
  return result;
end;
$$;
revoke all on function public.edit_current_course_enrollment(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.edit_current_course_enrollment(uuid,text,text,text,text) to authenticated;

create function public.remove_current_course_enrollment(p_enrollment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid:=auth.uid(); term_value text; year_value integer; changed integer;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  if p_enrollment_id is null then raise exception 'Course enrollment is required' using errcode='22023'; end if;
  select semester,academic_year into term_value,year_value from private.resolve_current_semester(now());
  update public.course_enrollments set revoked_at=coalesce(revoked_at,clock_timestamp())
  where id=p_enrollment_id and user_id=caller and semester=term_value and academic_year=year_value
    and (revoked_at is null or superseded_by is null) and verification_status in ('verified','pending','rejected');
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Current course enrollment not found' using errcode='42501'; end if;
end;
$$;
revoke all on function public.remove_current_course_enrollment(uuid) from public,anon,authenticated;
grant execute on function public.remove_current_course_enrollment(uuid) to authenticated;

commit;
