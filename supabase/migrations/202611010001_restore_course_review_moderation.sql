-- Reapply the server-only review submission path after the semester-aware and
-- class-feedback migrations recreate the public view and grant browser inserts.
begin;

alter table public.course_reviews
  add column if not exists moderation_status text not null default 'appropriate';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.course_reviews'::regclass
      and conname = 'course_reviews_moderation_status_check'
  ) then
    alter table public.course_reviews
      add constraint course_reviews_moderation_status_check
      check (moderation_status in ('appropriate', 'flagged'));
  end if;
end;
$$;

-- Only the authenticated Express endpoint, using the service role, may insert.
revoke insert on public.course_reviews from public, anon, authenticated;
revoke insert (offering_id, weekly_hours, difficulty, review, class_rating, would_recommend)
  on public.course_reviews from public, anon, authenticated;

-- security_invoker views require callers to have column-level SELECT rights.
grant select (id, offering_id, weekly_hours, difficulty, review, created_at,
              class_rating, would_recommend, moderation_status)
  on public.course_reviews to authenticated;
revoke select (id, offering_id, weekly_hours, difficulty, review, created_at,
               class_rating, would_recommend, moderation_status)
  on public.course_reviews from anon;

create or replace view public.course_reviews_public
  with (security_barrier = true, security_invoker = true) as
select r.id, r.offering_id, o.course_code, o.course_number, o.course_title,
       o.professor_name, o.professor_first_name, o.professor_last_name, o.section,
       o.semester, o.academic_year, r.difficulty, r.weekly_hours, r.review,
       r.created_at, r.class_rating, r.would_recommend, r.moderation_status
from public.course_reviews r
join public.course_offerings o on o.id = r.offering_id
where o.catalog_verified and (select private.is_eligible());

revoke all on public.course_reviews_public from public, anon, authenticated;
grant select on public.course_reviews_public to authenticated;

commit;
