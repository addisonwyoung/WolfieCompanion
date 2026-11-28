-- Owner-reviewed manual application only. Requires course memberships,
-- course reviews, and academic items migrations.
begin;

create or replace function public.remove_current_course_enrollment(p_enrollment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller uuid:=auth.uid();
  term_value text;
  year_value integer;
  selected public.course_enrollments;
  has_other_current_membership boolean;
  has_other_current_offering boolean;
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
      select exists(
        select 1 from public.course_enrollments e
        where e.user_id=caller and e.id<>selected.id
          and e.legacy_user_course_id=selected.legacy_user_course_id
          and e.semester=term_value and e.academic_year=year_value
          and e.revoked_at is null
          and e.verification_status in ('verified','pending','rejected')
      ) into has_other_current_membership;

      if not has_other_current_membership then
        -- Reminder occurrences reference academic_items with ON DELETE CASCADE.
        delete from public.academic_items
          where user_id=caller and user_course_id=selected.legacy_user_course_id;
      end if;
    end if;

    if selected.course_offering_id is not null then
      select exists(
        select 1 from public.course_enrollments e
        where e.user_id=caller and e.id<>selected.id
          and e.course_offering_id=selected.course_offering_id
          and e.semester=term_value and e.academic_year=year_value
          and e.revoked_at is null
          and e.verification_status='verified'
      ) into has_other_current_offering;

      if not has_other_current_offering then
        -- Reviews belong to an owner and an exact catalog offering, not to a
        -- shared course record. Leave every other owner's review untouched.
        delete from public.course_reviews
          where user_id=caller and offering_id=selected.course_offering_id;
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
