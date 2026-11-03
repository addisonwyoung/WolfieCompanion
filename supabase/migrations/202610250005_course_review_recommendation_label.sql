-- Rename take-again feedback to match the recommendation question in the UI.
begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='course_reviews' and column_name='would_take_again'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='course_reviews' and column_name='would_recommend'
  ) then
    alter table public.course_reviews rename column would_take_again to would_recommend;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='course_reviews' and column_name='would_recommend'
  ) then
    alter table public.course_reviews add column would_recommend boolean;
  end if;
end;
$$;

drop view if exists public.course_reviews_public;
grant select (class_rating, would_recommend) on public.course_reviews to anon, authenticated;
grant insert (offering_id, weekly_hours, difficulty, review, class_rating, would_recommend)
  on public.course_reviews to authenticated;

create view public.course_reviews_public
  with (security_barrier = true, security_invoker = true) as
select r.id, r.offering_id, o.course_code, o.course_number, o.course_title,
  o.professor_name, o.professor_first_name, o.professor_last_name, o.section,
  o.semester, o.academic_year, r.difficulty, r.weekly_hours, r.review,
  r.created_at, r.class_rating, r.would_recommend
from public.course_reviews r
join public.course_offerings o on o.id = r.offering_id
where o.catalog_verified;

revoke all on public.course_reviews_public from public, anon, authenticated;
grant select on public.course_reviews_public to anon, authenticated;

commit;
