-- Restore the narrow insert grant required by the course review form.
-- RLS still limits inserts to verified enrollments for the exact offering.
begin;

grant insert (offering_id, weekly_hours, difficulty, review)
  on public.course_reviews to authenticated;

commit;
