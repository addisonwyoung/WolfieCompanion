-- Owner review and manual application only. Requires the accounts migration.
begin;
create or replace function public.find_classmates(p_course_code text)
returns table (student_id uuid, name text, major text)
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
 if not exists (select 1 from public.user_courses c where c.user_id = caller and c.course_code = code) then
   raise exception 'Saved course membership required' using errcode = '42501';
 end if;
 return query
 select p.id, p.name, p.major
 from public.user_courses c join public.profiles p on p.id = c.user_id
 where c.course_code = code and c.user_id <> caller
   and exists (
     select 1 from auth.users u join auth.identities i on i.user_id = u.id
     where u.id = c.user_id and u.email_confirmed_at is not null
       and lower(split_part(u.email, '@', 2)) = 'stonybrook.edu'
       and u.email ~ '^[^@]+@[^@]+$' and i.provider = 'google'
       and i.identity_data->>'email_verified' = 'true'
       and lower(i.identity_data->>'email') = lower(u.email)
   )
 order by p.name, p.id;
end;
$$;
revoke all on function public.find_classmates(text) from public, anon, authenticated;
grant execute on function public.find_classmates(text) to authenticated;
commit;
