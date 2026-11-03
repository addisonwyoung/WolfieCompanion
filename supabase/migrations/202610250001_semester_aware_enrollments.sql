-- Owner review and manual application only. Requires accounts, course reviews,
-- course catalog, classmate profiles, friendships, and academic items migrations.
-- This file is never applied by the client.
begin;

create table if not exists public.semester_calendar (
  semester text primary key check (semester in ('Fall', 'Winter', 'Spring', 'Summer')),
  start_month smallint not null check (start_month between 1 and 12),
  start_day smallint not null check (start_day between 1 and 31),
  end_month smallint not null check (end_month between 1 and 12),
  end_day smallint not null check (end_day between 1 and 31),
  unique (start_month, start_day)
);
insert into public.semester_calendar(semester,start_month,start_day,end_month,end_day) values
  ('Fall',8,20,12,20),('Winter',1,2,1,22),
  ('Spring',1,25,5,20),('Summer',5,22,8,14)
on conflict (semester) do update set start_month=excluded.start_month,
  start_day=excluded.start_day,end_month=excluded.end_month,end_day=excluded.end_day;
alter table public.semester_calendar enable row level security;
revoke all on public.semester_calendar from public,anon,authenticated;

create or replace function private.resolve_current_semester(p_at timestamptz default now())
returns table(semester text, academic_year integer)
language sql stable security definer set search_path = '' as $$
  with campus_date as (
    select (coalesce(p_at,now()) at time zone 'America/New_York')::date as value
  ), candidates as (
    select c.semester, y.start_year::integer as start_year,
      make_date(y.start_year::integer,c.start_month,c.start_day) as starts_on
    from public.semester_calendar c
    cross join campus_date d
    cross join lateral generate_series(extract(year from d.value)::integer-1,
      extract(year from d.value)::integer) as y(start_year)
  )
  select c.semester,c.start_year from candidates c,campus_date d
  where c.starts_on <= d.value order by c.starts_on desc limit 1;
$$;
revoke all on function private.resolve_current_semester(timestamptz) from public,anon,authenticated;

create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_code text not null check (course_code=upper(btrim(course_code)) and course_code ~ '^[A-Z]{2,5}$'),
  course_number text not null check (course_number=upper(btrim(course_number)) and course_number ~ '^[0-9]{3}[A-Z]?$'),
  section text check (section is null or (section=upper(btrim(section)) and section ~ '^[A-Z0-9-]{1,20}$')),
  professor_first_name text check (professor_first_name is null or (professor_first_name=btrim(professor_first_name) and length(professor_first_name) between 1 and 80)),
  professor_last_name text check (professor_last_name is null or (professor_last_name=btrim(professor_last_name) and length(professor_last_name) between 1 and 80)),
  semester text check (semester in ('Fall','Winter','Spring','Summer')),
  academic_year integer check (academic_year between 1000 and 9999),
  course_offering_id text references public.course_offerings(id) on delete restrict,
  legacy_user_course_id uuid references public.user_courses(id) on delete restrict,
  verify_course_id uuid,
  verification_status text not null check (verification_status in ('verified','pending','rejected','legacy_unverified')),
  created_at timestamptz not null default now(),
  constraint course_enrollments_term_pair check ((semester is null)=(academic_year is null)),
  constraint course_enrollments_completeness check (
    verification_status='legacy_unverified' or
    (section is not null and professor_first_name is not null and professor_last_name is not null and semester is not null and academic_year is not null)
  ),
  constraint course_enrollments_offering_status check (
    (verification_status='verified' and course_offering_id is not null) or
    (verification_status<>'verified' and course_offering_id is null)
  )
);
alter table public.user_courses drop constraint if exists user_courses_course_code_check;
alter table public.user_courses add constraint user_courses_course_code_check
  check (course_code ~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$');
create index if not exists course_enrollments_current_user_idx
  on public.course_enrollments(user_id,academic_year,semester,course_code,course_number);
create index if not exists course_enrollments_course_current_idx
  on public.course_enrollments(course_code,course_number,academic_year,semester,user_id);
create unique index if not exists course_enrollments_exact_instance
  on public.course_enrollments(user_id,course_code,course_number,upper(section),lower(btrim(professor_first_name)),lower(btrim(professor_last_name)),semester,academic_year)
  where verification_status <> 'legacy_unverified';
alter table public.course_enrollments enable row level security;
drop policy if exists course_enrollments_owner_read on public.course_enrollments;
create policy course_enrollments_owner_read on public.course_enrollments for select to authenticated
  using (user_id=(select auth.uid()) and (select private.is_eligible()));
revoke all on public.course_enrollments from public,anon,authenticated;
grant select on public.course_enrollments to authenticated;

alter table public.course_offerings
  add column if not exists course_number text,
  add column if not exists section text,
  add column if not exists professor_first_name text,
  add column if not exists professor_last_name text,
  add column if not exists catalog_verified boolean not null default false;
alter table public.course_offerings drop constraint if exists course_offerings_semester_check;
alter table public.course_offerings drop constraint if exists course_offerings_course_code_check;
alter table public.course_offerings add constraint course_offerings_semester_check
  check (semester in ('Fall','Winter','Spring','Summer'));
alter table public.course_offerings add constraint course_offerings_course_code_check
  check (course_code ~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$');
alter table public.course_offerings add constraint course_offerings_course_number_check
  check (course_number is null or course_number ~ '^[0-9]{3}[A-Z]?$');
alter table public.course_offerings add constraint course_offerings_section_check
  check (section is null or (section=upper(btrim(section)) and section ~ '^[A-Z0-9-]{1,20}$'));
alter table public.course_offerings add constraint course_offerings_professor_names_check
  check ((professor_first_name is null and professor_last_name is null) or
    (professor_first_name=btrim(professor_first_name) and length(professor_first_name) between 1 and 80
     and professor_last_name=btrim(professor_last_name) and length(professor_last_name) between 1 and 80));
update public.course_offerings o set course_number=split_part(o.course_code,' ',2),
  catalog_verified=exists(select 1 from public.course_catalog c
    where c.course_code=split_part(o.course_code,' ',1)
      and c.course_number=split_part(o.course_code,' ',2))
where o.course_code ~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$';
create unique index if not exists course_offerings_exact_instance
  on public.course_offerings(course_code,course_number,lower(btrim(professor_first_name)),lower(btrim(professor_last_name)),upper(section),semester,academic_year)
  where course_number is not null and professor_first_name is not null and professor_last_name is not null and section is not null;
drop policy if exists course_offerings_eligible_read on public.course_offerings;
drop policy if exists course_offerings_verified_read on public.course_offerings;
drop policy if exists course_offerings_anon_verified_read on public.course_offerings;
create policy course_offerings_anon_verified_read on public.course_offerings for select to anon
  using (catalog_verified);
create policy course_offerings_verified_read on public.course_offerings for select to authenticated
  using (catalog_verified);
revoke all on public.course_offerings from public,anon,authenticated;
grant select on public.course_offerings to anon,authenticated;

create table if not exists public.verify_courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null check (course_code=upper(btrim(course_code)) and course_code ~ '^[A-Z]{2,5}$'),
  course_number text not null check (course_number=upper(btrim(course_number)) and course_number ~ '^[0-9]{3}[A-Z]?$'),
  section text not null check (section=upper(btrim(section)) and section ~ '^[A-Z0-9-]{1,20}$'),
  professor_first_name text not null check (professor_first_name=btrim(professor_first_name) and length(professor_first_name) between 1 and 80),
  professor_last_name text not null check (professor_last_name=btrim(professor_last_name) and length(professor_last_name) between 1 and 80),
  student_id uuid not null references auth.users(id) on delete cascade,
  semester text not null check (semester in ('Fall','Winter','Spring','Summer')),
  academic_year integer not null check (academic_year between 1000 and 9999),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint verify_courses_review_timestamp check ((status='pending' and reviewed_at is null) or (status<>'pending' and reviewed_at is not null))
);
create unique index if not exists verify_courses_exact_submission
  on public.verify_courses(student_id,course_code,course_number,upper(section),lower(btrim(professor_first_name)),lower(btrim(professor_last_name)),semester,academic_year);
create index if not exists verify_courses_pending_idx on public.verify_courses(submitted_at) where status='pending';
alter table public.verify_courses enable row level security;
drop policy if exists verify_courses_owner_read on public.verify_courses;
create policy verify_courses_owner_read on public.verify_courses for select to authenticated
  using (student_id=(select auth.uid()) and (select private.is_eligible()));
revoke all on public.verify_courses from public,anon,authenticated;
grant select on public.verify_courses to authenticated;
alter table public.course_enrollments add constraint course_enrollments_verify_fk
  foreign key (verify_course_id) references public.verify_courses(id) on delete restrict;

-- Legacy memberships have no reliable term or instructor. Preserve their links
-- to Academic Planner, but never use these rows for current membership/reviews.
insert into public.course_enrollments(user_id,course_code,course_number,section,
  legacy_user_course_id,verification_status)
select c.user_id,split_part(c.course_code,' ',1),split_part(c.course_code,' ',2),s.section,
  c.id,'legacy_unverified'
from public.user_courses c
left join public.user_course_sections s on s.user_course_id=c.id
where c.course_code ~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$'
  and not exists(select 1 from public.course_enrollments e where e.legacy_user_course_id=c.id
    and e.section is not distinct from s.section and e.verification_status='legacy_unverified');

create or replace function private.is_current_course_member(p_user_id uuid,p_course text)
returns boolean language sql stable security definer set search_path = '' as $$
  with parsed as (select regexp_match(upper(btrim(p_course)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$') as parts), term as (
    select * from private.resolve_current_semester(now())
  )
  select p.parts is not null and exists(
    select 1 from public.course_enrollments e cross join term t
    where e.user_id=p_user_id and e.course_code=p.parts[1] and e.course_number=p.parts[2]
      and e.semester=t.semester and e.academic_year=t.academic_year
      and e.verification_status in ('verified','pending','rejected')
  ) from parsed p;
$$;
revoke all on function private.is_current_course_member(uuid,text) from public,anon,authenticated;

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
    and e.verification_status in ('verified','pending','rejected')
  order by e.course_code,e.course_number,e.section nulls first;
end;
$$;
revoke all on function public.my_current_enrollments() from public,anon,authenticated;
grant execute on function public.my_current_enrollments() to authenticated;

create or replace function private.promote_approved_course_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare title_value text; full_code text; offering_id_value text;
begin
  if new.status='approved' and old.status is distinct from new.status then
    select c.course_name into title_value from public.course_catalog c
      where c.course_code=new.course_code and c.course_number=new.course_number;
    if title_value is null then raise exception 'Add this course to course_catalog before approval'; end if;
    full_code := new.course_code||' '||new.course_number;
    offering_id_value := 'offering-'||md5(lower(full_code)||':'||lower(btrim(new.professor_first_name))||':'||lower(btrim(new.professor_last_name))||':'||upper(new.section)||':'||new.semester||':'||new.academic_year::text);
    insert into public.course_offerings(id,course_code,course_number,course_title,professor_name,
      professor_first_name,professor_last_name,section,semester,academic_year,catalog_verified)
    values(offering_id_value,full_code,new.course_number,title_value,
      new.professor_first_name||' '||new.professor_last_name,new.professor_first_name,
      new.professor_last_name,new.section,new.semester,new.academic_year,true)
    on conflict do nothing;
    select o.id into offering_id_value from public.course_offerings o
      where o.course_code=full_code and o.course_number=new.course_number
        and lower(btrim(o.professor_first_name))=lower(btrim(new.professor_first_name))
        and lower(btrim(o.professor_last_name))=lower(btrim(new.professor_last_name))
        and upper(o.section)=upper(new.section) and o.semester=new.semester
        and o.academic_year=new.academic_year and o.catalog_verified;
    update public.course_enrollments set verification_status='verified',course_offering_id=offering_id_value
      where verify_course_id=new.id and verification_status='pending';
  elsif new.status='rejected' and old.status is distinct from new.status then
    update public.course_enrollments set verification_status='rejected'
      where verify_course_id=new.id and verification_status='pending';
  end if;
  return new;
end;
$$;
revoke all on function private.promote_approved_course_submission() from public,anon,authenticated;
drop trigger if exists verify_courses_promote_approved on public.verify_courses;
create trigger verify_courses_promote_approved after update of status on public.verify_courses
  for each row execute function private.promote_approved_course_submission();

create or replace function public.save_enrollments(rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; full_code text; code_value text; number_value text; section_value text;
  first_value text; last_value text; term_value text; year_value integer; title_value text;
  legacy_id uuid; enrollment_id_value uuid; verify_id uuid; offering_id_value text;
  item_count integer := 0;
begin
  if auth.uid() is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 100 then
    raise exception 'Provide 1 to 100 class rows' using errcode='22023';
  end if;
  select semester,academic_year into term_value,year_value from private.resolve_current_semester(now());
  for item in select value from jsonb_array_elements(rows)
    order by upper(regexp_replace(value->>'code','\s','','g')),upper(btrim(value->>'section')) loop
    item_count := item_count+1;
    if jsonb_typeof(item->'code') is distinct from 'string'
      or jsonb_typeof(item->'section') is distinct from 'string'
      or jsonb_typeof(item->'professor_first_name') is distinct from 'string'
      or jsonb_typeof(item->'professor_last_name') is distinct from 'string' then
      raise exception 'Class row % needs course, section, professor first name, and professor last name',item_count using errcode='22023';
    end if;
    full_code:=regexp_replace(upper(btrim(item->>'code')),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
    if full_code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' then raise exception 'Invalid course code in row %',item_count using errcode='22023'; end if;
    code_value:=split_part(full_code,' ',1); number_value:=split_part(full_code,' ',2);
    section_value:=upper(btrim(item->>'section'));
    first_value:=btrim(item->>'professor_first_name'); last_value:=btrim(item->>'professor_last_name');
    if section_value !~ '^[A-Z0-9-]{1,20}$' or length(first_value) not between 1 and 80 or length(last_value) not between 1 and 80 then
      raise exception 'Class row % needs a valid section and professor first/last names',item_count using errcode='22023';
    end if;

    -- Keep the legacy course row for existing Academic Planner foreign keys.
    insert into public.user_courses(user_id,course_code) values(auth.uid(),full_code)
      on conflict(user_id,course_code) do update set course_code=excluded.course_code returning id into legacy_id;
    insert into public.user_course_sections(user_course_id,section) values(legacy_id,section_value) on conflict do nothing;

    select c.course_name into title_value from public.course_catalog c
      where c.course_code=code_value and c.course_number=number_value;
    if title_value is not null then
      offering_id_value:='offering-'||md5(lower(full_code)||':'||lower(first_value)||':'||lower(last_value)||':'||section_value||':'||term_value||':'||year_value::text);
      insert into public.course_offerings(id,course_code,course_number,course_title,professor_name,
        professor_first_name,professor_last_name,section,semester,academic_year,catalog_verified)
      values(offering_id_value,full_code,number_value,title_value,first_value||' '||last_value,
        first_value,last_value,section_value,term_value,year_value,true)
      on conflict do nothing;
      select o.id into offering_id_value from public.course_offerings o
        where o.course_code=full_code and o.course_number=number_value
          and lower(btrim(o.professor_first_name))=lower(first_value)
          and lower(btrim(o.professor_last_name))=lower(last_value)
          and upper(o.section)=section_value and o.semester=term_value
          and o.academic_year=year_value and o.catalog_verified;
      insert into public.course_enrollments(user_id,course_code,course_number,section,
        professor_first_name,professor_last_name,semester,academic_year,course_offering_id,
        legacy_user_course_id,verification_status)
      values(auth.uid(),code_value,number_value,section_value,first_value,last_value,term_value,
        year_value,offering_id_value,legacy_id,'verified') on conflict do nothing;
    else
      insert into public.verify_courses(course_code,course_number,section,professor_first_name,
        professor_last_name,student_id,semester,academic_year)
      values(code_value,number_value,section_value,first_value,last_value,auth.uid(),term_value,year_value)
      on conflict do nothing returning id into verify_id;
      if verify_id is null then
        select v.id into verify_id from public.verify_courses v where v.student_id=auth.uid()
          and v.course_code=code_value and v.course_number=number_value and v.section=section_value
          and lower(v.professor_first_name)=lower(first_value) and lower(v.professor_last_name)=lower(last_value)
          and v.semester=term_value and v.academic_year=year_value;
      end if;
      insert into public.course_enrollments(user_id,course_code,course_number,section,
        professor_first_name,professor_last_name,semester,academic_year,legacy_user_course_id,
        verify_course_id,verification_status)
      values(auth.uid(),code_value,number_value,section_value,first_value,last_value,term_value,
        year_value,legacy_id,verify_id,'pending') on conflict do nothing;
    end if;
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'enrollment_id',e.enrollment_id,'legacy_course_id',e.legacy_course_id,'code',e.code,
    'section',e.section,'professor_first_name',e.professor_first_name,
    'professor_last_name',e.professor_last_name,'verification_status',e.verification_status)
    order by e.code,e.section) from public.my_current_enrollments() e),'[]'::jsonb);
end;
$$;
revoke all on function public.save_enrollments(jsonb) from public,anon,authenticated;
grant execute on function public.save_enrollments(jsonb) to authenticated;

-- Backfill is complete before current-term discovery is switched to history.
create or replace function private.can_view_classmate(caller uuid,peer uuid,course text)
returns boolean language sql stable security definer set search_path = '' as $$
  select caller is not null and peer is not null and caller<>peer
    and course ~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$'
    and private.is_current_course_member(caller,course)
    and private.is_current_course_member(peer,course)
    and (select count(distinct u.id)=2 from auth.users u join auth.identities i on i.user_id=u.id
      where u.id in(caller,peer) and u.email_confirmed_at is not null
        and lower(split_part(u.email,'@',2))='stonybrook.edu' and u.email ~ '^[^@]+@[^@]+$'
        and i.provider='google' and i.identity_data->>'email_verified'='true'
        and lower(i.identity_data->>'email')=lower(u.email));
$$;
revoke all on function private.can_view_classmate(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.find_classmates(p_course_code text)
returns table(student_id uuid,name text,major text)
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' then raise exception 'Invalid course code' using errcode='22023'; end if;
  if not private.is_current_course_member(caller,code) then raise exception 'Current-semester course enrollment required' using errcode='42501'; end if;
  return query select distinct p.id,p.name,p.major from public.course_enrollments e
    join public.profiles p on p.id=e.user_id
    where e.course_code=split_part(code,' ',1) and e.course_number=split_part(code,' ',2)
      and e.user_id<>caller and private.is_current_course_member(e.user_id,code)
      and exists(select 1 from auth.users u join auth.identities i on i.user_id=u.id
        where u.id=e.user_id and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))='stonybrook.edu'
          and u.email ~ '^[^@]+@[^@]+$' and i.provider='google'
          and i.identity_data->>'email_verified'='true' and lower(i.identity_data->>'email')=lower(u.email))
    order by p.name,p.id;
end;
$$;
revoke all on function public.find_classmates(text) from public,anon,authenticated;
grant execute on function public.find_classmates(text) to authenticated;

-- Return shape remains unchanged; membership and shared-course lists use term history.
drop function if exists public.course_recommendation_profiles(text);
create function public.course_recommendation_profiles(p_course_code text)
returns table(student_id uuid,name text,major text,year text,interests text[],residence_status text,shared_courses text[])
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' then raise exception 'Invalid course code' using errcode='22023'; end if;
  if not private.is_current_course_member(caller,code) then raise exception 'Current-semester course enrollment required' using errcode='42501'; end if;
  return query
  select p.id,p.name,p.major,case when p.share_year then p.year else null end,
    case when p.share_interests then p.interests else null end,
    case when p.share_residence_status then p.residence_status else null end,
    coalesce((select array_agg(distinct mine.course_code||' '||mine.course_number order by mine.course_code||' '||mine.course_number)
      from public.course_enrollments mine join public.course_enrollments theirs
        on theirs.course_code=mine.course_code and theirs.course_number=mine.course_number
      where mine.user_id=caller and theirs.user_id=p.id
        and private.is_current_course_member(caller,mine.course_code||' '||mine.course_number)
        and private.is_current_course_member(p.id,mine.course_code||' '||mine.course_number)),'{}'::text[])
  from public.course_enrollments e join public.profiles p on p.id=e.user_id
  where e.course_code=split_part(code,' ',1) and e.course_number=split_part(code,' ',2)
    and e.user_id<>caller and private.is_current_course_member(e.user_id,code)
    and private.can_view_classmate(caller,p.id,code)
    and not exists(select 1 from public.friendships f where f.user_id=least(caller,p.id) and f.friend_id=greatest(caller,p.id))
  group by p.id,p.name,p.major,p.share_year,p.year,p.share_interests,p.interests,p.share_residence_status,p.residence_status
  order by p.name,p.id;
end;
$$;
revoke all on function public.course_recommendation_profiles(text) from public,anon,authenticated;
grant execute on function public.course_recommendation_profiles(text) to authenticated;

-- Friend/course discovery and friend-in-course lists remain the same shape,
-- but their course membership gate now delegates to current-term privacy checks.
create or replace function public.course_friend_relationships(p_course_code text)
returns table(student_id uuid,relationship text,request_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' then raise exception 'Invalid course code' using errcode='22023'; end if;
  if not private.is_current_course_member(caller,code) then raise exception 'Current-semester course enrollment required' using errcode='42501'; end if;
  return query with peers as (
    select distinct e.user_id peer_id from public.course_enrollments e
    where e.course_code=split_part(code,' ',1) and e.course_number=split_part(code,' ',2)
      and e.user_id<>caller and private.can_view_classmate(caller,e.user_id,code)
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
revoke all on function public.course_friend_relationships(text) from public,anon,authenticated;
grant execute on function public.course_friend_relationships(text) to authenticated;

create or replace function public.friends_in_course(p_course_code text)
returns table(student_id uuid,name text,major text,year text,interests text[],residence_status text,has_shared_avatar boolean)
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid:=auth.uid(); code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$' then raise exception 'Invalid course code' using errcode='22023'; end if;
  if not private.is_current_course_member(caller,code) then raise exception 'Current-semester course enrollment required' using errcode='42501'; end if;
  return query select p.id,p.name,p.major,case when p.share_year then p.year else null end,
    case when p.share_interests then p.interests else null end,
    case when p.share_residence_status then p.residence_status else null end,p.share_avatar and p.avatar_path is not null
  from public.friendships f join public.profiles p on p.id=case when f.user_id=caller then f.friend_id else f.user_id end
  where caller in(f.user_id,f.friend_id) and private.can_view_classmate(caller,p.id,code)
  order by p.name,p.id;
end;
$$;
revoke all on function public.friends_in_course(text) from public,anon,authenticated;
grant execute on function public.friends_in_course(text) to authenticated;

-- Course reviews remain tied to historical verified enrollment, not current term.
drop policy if exists course_reviews_eligible_insert on public.course_reviews;
create policy course_reviews_eligible_insert on public.course_reviews for insert to authenticated
  with check (user_id=(select auth.uid()) and (select private.is_eligible()) and exists(
    select 1 from public.course_enrollments e where e.user_id=(select auth.uid())
      and e.course_offering_id=course_reviews.offering_id and e.verification_status='verified'));
drop policy if exists course_reviews_anon_read on public.course_reviews;
drop policy if exists course_reviews_eligible_read on public.course_reviews;
create policy course_reviews_anon_read on public.course_reviews for select to anon using(true);
create policy course_reviews_public_read on public.course_reviews for select to authenticated using(true);
grant select(id,offering_id,weekly_hours,difficulty,review,created_at) on public.course_reviews to anon;

drop view if exists public.course_reviews_public;
create view public.course_reviews_public with(security_barrier=true,security_invoker=true) as
select r.id,r.offering_id,o.course_code,o.course_number,o.course_title,o.professor_name,
  o.professor_first_name,o.professor_last_name,o.section,o.semester,o.academic_year,
  r.difficulty,r.weekly_hours,r.review,r.created_at
from public.course_reviews r join public.course_offerings o on o.id=r.offering_id
where o.catalog_verified;
revoke all on public.course_reviews_public from public,anon,authenticated;
grant select on public.course_reviews_public to anon,authenticated;

commit;
