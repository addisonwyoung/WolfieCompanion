begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Only trusted Auth records establish eligibility; profile metadata is never authority.
create function private.is_eligible() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
   select 1 from auth.users u join auth.identities i on i.user_id = u.id
   where u.id = auth.uid() and u.email_confirmed_at is not null
     and lower(split_part(u.email, '@', 2)) = 'stonybrook.edu'
     and u.email ~ '^[^@]+@[^@]+$' and i.provider = 'google'
     and i.identity_data->>'email_verified' = 'true'
     and lower(i.identity_data->>'email') = lower(u.email)
 );
$$;
revoke all on function private.is_eligible() from public;
grant execute on function private.is_eligible() to authenticated;
create function public.account_is_eligible() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.is_eligible(); $$;
revoke all on function public.account_is_eligible() from public;
grant execute on function public.account_is_eligible() to authenticated;

create function private.valid_interests(items text[]) returns boolean
language sql immutable set search_path = '' as $$
 select items is not null and cardinality(items) <= 20
   and not exists (select 1 from unnest(items) x where x is null or x <> btrim(x) or length(x) not between 1 and 50)
   and cardinality(items) = (select count(distinct lower(x)) from unnest(items) x);
$$;
grant execute on function private.valid_interests(text[]) to authenticated;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (name = btrim(name) and length(name) between 1 and 100),
 major text check (major = btrim(major) and length(major) between 1 and 120),
 year text check (year in ('First year','Second year','Third year','Fourth year','Graduate')),
 residence_status text check (residence_status in ('commuter','dormer')),
 interests text[] not null default '{}' check (private.valid_interests(interests)),
 avatar_path text check (avatar_path ~ ('^' || id::text || '/[a-f0-9-]+\.(png|jpg)$')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_courses (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 course_code text not null check (course_code ~ '^[A-Z]{2,4} [0-9]{3}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (user_id, course_code)
);
create table public.user_course_sections (
 user_course_id uuid not null references public.user_courses(id) on delete cascade,
 section text not null check (section ~ '^[A-Z0-9-]{1,20}$'),
 primary key (user_course_id, section)
);
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated_at();
create trigger courses_updated before update on public.user_courses for each row execute function private.touch_updated_at();

-- Identities are written after users during OAuth; initialization must also run after that step.
create function private.initialize_profile_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,name) values (new.id,coalesce(nullif(left(btrim(new.raw_user_meta_data->>'full_name'),100),''),'Student')) on conflict (id) do nothing;
 return new;
end; $$;
create trigger initialize_profile after insert on auth.users for each row execute function private.initialize_profile_trigger();
create function public.ensure_profile() returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare result public.profiles;
begin
 if not private.is_eligible() then raise exception 'Eligible student account required' using errcode = '42501'; end if;
 insert into public.profiles(id,name)
 select id,coalesce(nullif(left(btrim(raw_user_meta_data->>'full_name'),100),''),'Student') from auth.users where id = auth.uid()
 on conflict (id) do nothing;
 select * into result from public.profiles where id = auth.uid(); return result;
end; $$;
revoke all on function public.ensure_profile() from public;
grant execute on function public.ensure_profile() to authenticated;

alter table public.profiles enable row level security;
alter table public.user_courses enable row level security;
alter table public.user_course_sections enable row level security;
create policy profile_owner on public.profiles to authenticated using (id = (select auth.uid()) and (select private.is_eligible())) with check (id = (select auth.uid()) and (select private.is_eligible()));
create policy course_owner on public.user_courses to authenticated using (user_id = (select auth.uid()) and (select private.is_eligible())) with check (user_id = (select auth.uid()) and (select private.is_eligible()));
create policy section_owner on public.user_course_sections to authenticated using (exists (select 1 from public.user_courses c where c.id = user_course_id and c.user_id = (select auth.uid())) and (select private.is_eligible())) with check (exists (select 1 from public.user_courses c where c.id = user_course_id and c.user_id = (select auth.uid())) and (select private.is_eligible()));
revoke all on public.profiles, public.user_courses, public.user_course_sections from anon, authenticated;
grant select,insert,update,delete on public.profiles, public.user_courses, public.user_course_sections to authenticated;

create function public.save_enrollments(rows jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; code text; section_value text; course_id uuid; result jsonb; row_number integer := 0;
begin
 if not private.is_eligible() then raise exception 'Eligible student account required' using errcode = '42501'; end if;
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 100 then raise exception 'Provide 1 to 100 class rows' using errcode = '22023'; end if;
 -- Stable lock order also avoids deadlocks for concurrent, overlapping batches.
 for item in select value from jsonb_array_elements(rows) order by upper(regexp_replace(value->>'code','\s','','g')), upper(btrim(value->>'section')) loop
   row_number := row_number + 1;
   if jsonb_typeof(item->'code') is distinct from 'string' or jsonb_typeof(item->'section') is distinct from 'string' then raise exception 'Invalid class row %',row_number using errcode = '22023'; end if;
   code := upper(btrim(item->>'code')); section_value := upper(btrim(item->>'section'));
   if code !~ '^[A-Z]{2,4}\s*[0-9]{3}$' or (section_value <> '' and section_value !~ '^[A-Z0-9-]{1,20}$') then raise exception 'Invalid class row %',row_number using errcode = '22023'; end if;
   code := regexp_replace(code,'^([A-Z]{2,4})\s*([0-9]{3})$','\1 \2');
   insert into public.user_courses(user_id,course_code) values(auth.uid(),code)
   on conflict (user_id,course_code) do update set course_code = excluded.course_code returning id into course_id;
   if section_value <> '' then insert into public.user_course_sections values(course_id,section_value) on conflict do nothing; end if;
 end loop;
 select coalesce(jsonb_agg(x order by x->>'code'),'[]') into result from (
   select jsonb_build_object('id',c.id,'code',c.course_code,'sections',coalesce((select jsonb_agg(s.section order by s.section) from public.user_course_sections s where s.user_course_id = c.id),'[]')) x
   from public.user_courses c where c.user_id = auth.uid()
 ) t; return result;
end; $$;
revoke all on function public.save_enrollments(jsonb) from public;
grant execute on function public.save_enrollments(jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('avatars','avatars',false,5242880,array['image/jpeg','image/png']);
create policy avatar_read on storage.objects for select to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.is_eligible()));
create policy avatar_insert on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and name ~ ('^' || (select auth.uid())::text || '/[a-f0-9-]+\.(png|jpg)$') and (select private.is_eligible()));
create policy avatar_delete on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.is_eligible()));
revoke all on function private.initialize_profile_trigger(), private.touch_updated_at() from public;
commit;
