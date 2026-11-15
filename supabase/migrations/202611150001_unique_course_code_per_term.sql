-- A student can only add a course code once in a given semester and
-- academic year, regardless of section or professor.
begin;

create or replace function private.prevent_duplicate_course_code_per_term()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Legacy planner-only enrollments have no term and remain outside this rule.
  if new.semester is null or new.academic_year is null then
    return new;
  end if;

  -- Serialize competing saves for the same user/course/term before checking.
  perform pg_advisory_xact_lock(hashtextextended(
    new.user_id::text || ':' || new.course_code || ':' || new.course_number || ':' || new.semester || ':' || new.academic_year::text,
    0
  ));

  if exists (
    select 1
    from public.course_enrollments e
    where e.user_id = new.user_id
      and e.course_code = new.course_code
      and e.course_number = new.course_number
      and e.semester = new.semester
      and e.academic_year = new.academic_year
  ) then
    raise exception 'This course code is already on your dashboard for this semester and academic year.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;
revoke all on function private.prevent_duplicate_course_code_per_term() from public, anon, authenticated;

drop trigger if exists course_enrollments_unique_course_per_term on public.course_enrollments;
create trigger course_enrollments_unique_course_per_term
  before insert on public.course_enrollments
  for each row execute function private.prevent_duplicate_course_code_per_term();

commit;
