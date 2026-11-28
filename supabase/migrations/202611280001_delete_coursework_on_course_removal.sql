-- Owner-reviewed manual application only. Requires course membership,
-- academic items, and (when installed) academic reminder migrations.
begin;

create or replace function public.remove_current_course_enrollment(p_enrollment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller uuid:=auth.uid();
  term_value text;
  year_value integer;
  selected public.course_enrollments;
  has_other_current_membership boolean;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  if p_enrollment_id is null then
    raise exception 'Course enrollment is required' using errcode='22023';
  end if;
  select semester,academic_year into term_value,year_value
    from private.resolve_current_semester(now());
  select e.* into selected
    from public.course_enrollments e
    where e.id=p_enrollment_id and e.user_id=caller
      and e.semester=term_value and e.academic_year=year_value
      and (e.revoked_at is null or e.superseded_by is null)
      and e.verification_status in ('verified','pending','rejected')
    for update;
  if not found then
    raise exception 'Current course enrollment not found' using errcode='42501';
  end if;

  if selected.revoked_at is null then
    if selected.legacy_user_course_id is not null then
      -- Keep coursework while another active current-term enrollment still
      -- points at the same planner course (for example another section).
      select exists(
        select 1 from public.course_enrollments e
        where e.user_id=caller and e.id<>selected.id
          and e.legacy_user_course_id=selected.legacy_user_course_id
          and e.semester=term_value and e.academic_year=year_value
          and e.revoked_at is null
          and e.verification_status in ('verified','pending','rejected')
      ) into has_other_current_membership;

      if not has_other_current_membership then
        -- Reminder occurrences reference academic_items with ON DELETE CASCADE,
        -- so this removes the course's reminders in the same transaction.
        delete from public.academic_items
          where user_id=caller and user_course_id=selected.legacy_user_course_id;

        -- Keep the private planner anchor because historical enrollment rows
        -- may still reference it. The client exposes planner choices only for
        -- active current-term memberships, so this anchor is no longer selectable.
      end if;
    end if;

    update public.course_enrollments set revoked_at=clock_timestamp()
      where id=selected.id and user_id=caller;
  end if;
end;
$$;
revoke all on function public.remove_current_course_enrollment(uuid) from public,anon,authenticated;
grant execute on function public.remove_current_course_enrollment(uuid) to authenticated;

commit;
