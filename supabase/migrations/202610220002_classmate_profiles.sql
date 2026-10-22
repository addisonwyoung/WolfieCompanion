-- Owner review and manual application only. Requires accounts and classmate discovery.
begin;
alter table public.profiles
 add column if not exists share_year boolean not null default false,
 add column if not exists share_interests boolean not null default false,
 add column if not exists share_residence_status boolean not null default false,
 add column if not exists share_avatar boolean not null default false;

-- Internal authorization shared by text and picture projections. Never client-callable.
create or replace function private.can_view_classmate(caller uuid, peer uuid, course text)
returns boolean language sql stable security definer set search_path = '' as $$
 select caller is not null and peer is not null and caller <> peer
 and course ~ '^[A-Z]{2,4} [0-9]{3}$'
 and exists (select 1 from public.user_courses where user_id=caller and course_code=course)
 and exists (select 1 from public.user_courses where user_id=peer and course_code=course)
 and (select count(distinct u.id)=2 from auth.users u join auth.identities i on i.user_id=u.id
 where u.id in (caller,peer) and u.email_confirmed_at is not null
 and lower(split_part(u.email,'@',2))='stonybrook.edu' and u.email ~ '^[^@]+@[^@]+$'
 and i.provider='google' and i.identity_data->>'email_verified'='true'
 and lower(i.identity_data->>'email')=lower(u.email));
$$;
revoke all on function private.can_view_classmate(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.get_classmate_profile(p_course_code text,p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare code text := upper(btrim(p_course_code)); result jsonb;
begin
 if auth.uid() is null or not private.is_eligible() then
  raise exception 'Eligible student account required' using errcode='42501';
 end if;
 if code is null or code !~ '^[A-Z]{2,4}\s*[0-9]{3}$' then
  raise exception 'Invalid course code' using errcode='22023';
 end if;
 code := regexp_replace(code,'^([A-Z]{2,4})\s*([0-9]{3})$','\1 \2');
 if not private.can_view_classmate(auth.uid(),p_student_id,code) then return null; end if;
 select jsonb_build_object('student_id',id,'name',name,'major',major,
 'has_shared_avatar',share_avatar and avatar_path is not null)
 || case when share_year then jsonb_build_object('year',year) else '{}'::jsonb end
 || case when share_interests then jsonb_build_object('interests',interests) else '{}'::jsonb end
 || case when share_residence_status then jsonb_build_object('residence_status',residence_status) else '{}'::jsonb end
 into result from public.profiles where id=p_student_id;
 return result;
end; $$;
revoke all on function public.get_classmate_profile(text,uuid) from public,anon,authenticated;
grant execute on function public.get_classmate_profile(text,uuid) to authenticated;

-- Explicit caller is accepted ONLY from the trusted server after Auth verification.
create or replace function public.resolve_classmate_avatar(p_caller_id uuid,p_student_id uuid,p_course_code text)
returns text language sql stable security definer set search_path = '' as $$
 select p.avatar_path from public.profiles p
 where p.id=p_student_id and p.share_avatar and p.avatar_path is not null
 and private.can_view_classmate(p_caller_id,p_student_id,
 regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,4})\s*([0-9]{3})$','\1 \2'));
$$;
revoke all on function public.resolve_classmate_avatar(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_classmate_avatar(uuid,uuid,text) to service_role;
commit;
