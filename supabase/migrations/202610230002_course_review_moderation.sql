begin;

-- Reviews now pass through the authenticated Express moderation endpoint.
-- Existing rows are treated as appropriate; newly flagged rows remain visible
-- through the public review projection in a separate client section.
alter table public.course_reviews
  add column moderation_status text not null default 'appropriate'
  check (moderation_status in ('appropriate', 'flagged'));

-- Remove the browser's direct insert path so a client cannot skip moderation.
revoke insert on public.course_reviews from authenticated;
revoke insert (offering_id, weekly_hours, difficulty, review)
  on public.course_reviews from authenticated;

grant select (id, offering_id, weekly_hours, difficulty, review, created_at, moderation_status)
  on public.course_reviews to authenticated;

create or replace view public.course_reviews_public
  with (security_barrier = true, security_invoker = true) as
select r.id, r.offering_id, o.course_code, o.course_title, o.professor_name,
       o.semester, o.academic_year, r.difficulty, r.weekly_hours,
       r.review, r.created_at, r.moderation_status
from public.course_reviews r
join public.course_offerings o on o.id = r.offering_id
where (select private.is_eligible());

revoke all on public.course_reviews_public from public, anon;
grant select on public.course_reviews_public to authenticated;

commit;
