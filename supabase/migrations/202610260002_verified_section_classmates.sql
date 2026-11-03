-- Keep dashboard enrollments visible while withholding section discovery until
-- the student's enrollment has been verified.
begin;

create or replace function private.is_current_course_section_member(
  p_user_id uuid,
  p_course_code text,
  p_section text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with parsed as (
    select regexp_match(upper(btrim(p_course_code)), '^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$') as course,
      upper(btrim(p_section)) as section
  ), term as (
    select * from private.resolve_current_semester(now())
  )
  select p.course is not null
    and p.section ~ '^[A-Z0-9-]{1,20}$'
    and exists (
      select 1
      from public.course_enrollments e
      cross join term t
      where e.user_id = p_user_id
        and e.course_code = p.course[1]
        and e.course_number = p.course[2]
        and e.section = p.section
        and e.semester = t.semester
        and e.academic_year = t.academic_year
        and e.verification_status = 'verified'
    )
  from parsed p;
$$;

revoke all on function private.is_current_course_section_member(uuid, text, text)
  from public, anon, authenticated;

commit;
