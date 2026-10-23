-- Owner review and manual application only. Requires accounts, classmate discovery,
-- and classmate profile visibility migrations. This file is not applied by the client.
begin;

create or replace function public.course_recommendation_profiles(p_course_code text)
returns table (
  student_id uuid,
  name text,
  major text,
  year text,
  interests text[],
  residence_status text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  code text := upper(btrim(p_course_code));
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode = '42501';
  end if;
  if code is null or code !~ '^[A-Z]{2,4}\s*[0-9]{3}$' then
    raise exception 'Invalid course code' using errcode = '22023';
  end if;
  code := regexp_replace(code, '^([A-Z]{2,4})\s*([0-9]{3})$', '\1 \2');
  if not exists (
    select 1 from public.user_courses c
    where c.user_id = caller and c.course_code = code
  ) then
    raise exception 'Saved course membership required' using errcode = '42501';
  end if;

  return query
  select distinct on (p.id)
    p.id,
    p.name,
    p.major,
    case when p.share_year then p.year else null end,
    case when p.share_interests then p.interests else null end,
    case when p.share_residence_status then p.residence_status else null end
  from public.user_courses c
  join public.profiles p on p.id = c.user_id
  left join public.user_course_sections s on s.user_course_id = c.id
  where c.course_code = code
    and c.user_id <> caller
    and private.can_view_classmate(caller, p.id, code)
  order by p.id, s.section nulls first;
end;
$$;

revoke all on function public.course_recommendation_profiles(text) from public, anon, authenticated;
grant execute on function public.course_recommendation_profiles(text) to authenticated;
commit;
