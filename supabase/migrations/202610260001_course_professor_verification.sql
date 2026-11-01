-- Owner-reviewed manual deployment only. Requires course_catalog and the
-- semester-aware enrollment migration. The application never runs this SQL.
begin;

-- Approved professor names are scoped to a catalog course only. Sections and
-- terms remain part of evaluation offerings, not the professor dropdown.
create table if not exists public.course_professors (
  course_code text not null,
  course_number text not null,
  professor_first_name text not null check (
    professor_first_name=btrim(professor_first_name) and length(professor_first_name) between 1 and 80
  ),
  professor_last_name text not null check (
    professor_last_name=btrim(professor_last_name) and length(professor_last_name) between 1 and 80
  ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key(course_code,course_number)
    references public.course_catalog(course_code,course_number) on delete cascade
);
create unique index if not exists course_professors_identity
  on public.course_professors(course_code,course_number,
    lower(btrim(professor_first_name)),lower(btrim(professor_last_name)));
create index if not exists course_professors_course_active
  on public.course_professors(course_code,course_number,professor_last_name,professor_first_name)
  where active;
alter table public.course_professors enable row level security;
drop policy if exists course_professors_eligible_read on public.course_professors;
create policy course_professors_eligible_read on public.course_professors
  for select to authenticated using ((select private.is_eligible()));
revoke all on public.course_professors from public,anon,authenticated;
grant select on public.course_professors to authenticated;

-- An approval confirms the professor for the course, independent of section or
-- term. Promote all submissions for this course/professor so every matching
-- enrollment can receive its own section/term-specific evaluation offering.
create or replace function private.promote_approved_course_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare title_value text; full_code text; offering_id_value text;
begin
  if new.status='approved' and old.status is distinct from new.status then
    select c.course_name into title_value from public.course_catalog c
      where c.course_code=new.course_code and c.course_number=new.course_number;
    if title_value is null then raise exception 'Add this course to course_catalog before approval'; end if;

    insert into public.course_professors(course_code,course_number,professor_first_name,professor_last_name)
      values(new.course_code,new.course_number,new.professor_first_name,new.professor_last_name)
      on conflict do nothing;

    update public.verify_courses v set status='approved',reviewed_at=coalesce(v.reviewed_at,now())
      where v.id<>new.id and v.status='pending'
        and v.course_code=new.course_code and v.course_number=new.course_number
        and lower(btrim(v.professor_first_name))=lower(btrim(new.professor_first_name))
        and lower(btrim(v.professor_last_name))=lower(btrim(new.professor_last_name));

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

-- Keep the atomic enrollment API and legacy planner rows. A catalog course with
-- an unlisted professor stays on the dashboard as pending and has no offering.
create or replace function public.save_enrollments(rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; full_code text; code_value text; number_value text; section_value text;
  first_value text; last_value text; term_value text; year_value integer; title_value text;
  legacy_id uuid; verify_id uuid; offering_id_value text; item_count integer := 0;
begin
  if auth.uid() is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
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
    if title_value is not null and exists(
      select 1 from public.course_professors p where p.course_code=code_value and p.course_number=number_value
        and lower(btrim(p.professor_first_name))=lower(first_value)
        and lower(btrim(p.professor_last_name))=lower(last_value) and p.active
    ) then
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

commit;
