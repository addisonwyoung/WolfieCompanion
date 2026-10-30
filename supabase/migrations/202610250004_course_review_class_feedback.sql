-- Add class-level rating and take-again feedback to new course reviews.
-- Existing reviews remain readable with NULL values for the new fields.
begin;

alter table public.course_reviews
  add column if not exists class_rating smallint,
  add column if not exists would_take_again boolean;

alter table public.course_reviews drop constraint if exists course_reviews_class_rating_check;
alter table public.course_reviews add constraint course_reviews_class_rating_check
  check (class_rating is null or class_rating between 1 and 5);

grant select (class_rating, would_take_again) on public.course_reviews to anon, authenticated;
grant insert (offering_id, weekly_hours, difficulty, review, class_rating, would_take_again)
  on public.course_reviews to authenticated;

create or replace view public.course_reviews_public
  with (security_barrier = true, security_invoker = true) as
select r.id, r.offering_id, o.course_code, o.course_number, o.course_title,
  o.professor_name, o.professor_first_name, o.professor_last_name, o.section,
  o.semester, o.academic_year, r.difficulty, r.weekly_hours, r.review,
  r.created_at, r.class_rating, r.would_take_again
from public.course_reviews r
join public.course_offerings o on o.id = r.offering_id
where o.catalog_verified;

revoke all on public.course_reviews_public from public, anon, authenticated;
grant select on public.course_reviews_public to anon, authenticated;

commit;
