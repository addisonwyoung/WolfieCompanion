-- Owner-reviewed manual deployment only. Course codes are department prefixes
-- (for example, CSE); combine with course_number to form CSE 416.
begin;

create table if not exists public.course_catalog (
  course_code text not null
    check (course_code = upper(btrim(course_code)) and course_code ~ '^[A-Z]{2,5}$'),
  course_number text not null
    check (course_number = upper(btrim(course_number)) and course_number ~ '^[0-9]{3}[A-Z]?$'),
  course_name text not null
    check (course_name = btrim(course_name) and length(course_name) between 1 and 160),
  primary key (course_code, course_number)
);

alter table public.course_catalog enable row level security;
drop policy if exists course_catalog_eligible_read on public.course_catalog;
create policy course_catalog_eligible_read on public.course_catalog
  for select to authenticated using ((select private.is_eligible()));
revoke all on public.course_catalog from public, anon, authenticated;
grant select on public.course_catalog to authenticated;

commit;
