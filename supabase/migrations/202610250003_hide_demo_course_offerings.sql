-- Hide the original demo offerings from Course Evaluations without deleting
-- reviews, enrollment history, or any offering rows referenced by those records.
begin;

update public.course_offerings
set catalog_verified = false
where id in (
  'cse-416-fall-2025-lee',
  'cse-416-spring-2026-patel',
  'bio-201-spring-2026-nguyen',
  'mat-210-fall-2025-roberts',
  'bio-201-fall-2026-kim'
);

commit;
