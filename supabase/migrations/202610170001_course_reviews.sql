begin;

-- Add an authoritative catalog because existing course/enrollment tables do not
-- model professor, term, or academic year. IDs match evaluationData.ts.
create table public.course_offerings (
  id text primary key,
  course_code text not null check (course_code ~ '^[A-Z]{2,4} [0-9]{3}$'),
  course_title text not null check (length(btrim(course_title)) between 1 and 160),
  professor_name text not null check (length(btrim(professor_name)) between 1 and 120),
  semester text not null check (semester in ('Spring', 'Summer', 'Fall')),
  academic_year integer not null check (academic_year between 1000 and 9999),
  constraint course_offerings_valid_id check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

insert into public.course_offerings (id, course_code, course_title, professor_name, semester, academic_year) values
  ('cse-416-fall-2025-lee', 'CSE 416', 'Software Engineering', 'Dr. Lee', 'Fall', 2025),
  ('cse-416-spring-2026-patel', 'CSE 416', 'Software Engineering', 'Prof. Patel', 'Spring', 2026),
  ('bio-201-spring-2026-nguyen', 'BIO 201', 'Organisms to Ecosystems', 'Dr. Nguyen', 'Spring', 2026),
  ('mat-210-fall-2025-roberts', 'MAT 210', 'Applied Linear Algebra', 'Prof. Roberts', 'Fall', 2025),
  ('bio-201-fall-2026-kim', 'BIO 201', 'Organisms to Ecosystems', 'Dr. Kim', 'Fall', 2026);

alter table public.course_offerings enable row level security;
create policy course_offerings_eligible_read on public.course_offerings
  for select to authenticated using ((select private.is_eligible()));
revoke all on public.course_offerings from public, anon, authenticated;
grant select on public.course_offerings to authenticated;

create table public.course_reviews (
  id uuid primary key default gen_random_uuid(),
  offering_id text not null references public.course_offerings(id) on delete restrict,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weekly_hours numeric not null check (weekly_hours between 0 and 40),
  difficulty smallint not null check (difficulty between 1 and 5),
  review text not null default '' check (length(review) <= 1000),
  created_at timestamptz not null default now(),
  constraint course_reviews_one_per_user_offering unique (user_id, offering_id)
);
create index course_reviews_offering_idx on public.course_reviews (offering_id, created_at desc);
alter table public.course_reviews enable row level security;
create policy course_reviews_eligible_insert on public.course_reviews
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_eligible()));
create policy course_reviews_eligible_read on public.course_reviews
  for select to authenticated
  using ((select private.is_eligible()));
revoke all on public.course_reviews from public, anon, authenticated;
grant insert (offering_id, weekly_hours, difficulty, review)
  on public.course_reviews to authenticated;
-- Allow the invoker-security view to read anonymous fields while withholding
-- reviewer identity even from direct table queries.
grant select (id, offering_id, weekly_hours, difficulty, review, created_at)
  on public.course_reviews to authenticated;

-- Explicit anonymous allowlist; offering metadata is joined from the catalog.
create view public.course_reviews_public
  with (security_barrier = true, security_invoker = true) as
select r.id, r.offering_id, o.course_code, o.course_title, o.professor_name,
       o.semester, o.academic_year, r.difficulty, r.weekly_hours,
       r.review, r.created_at
from public.course_reviews r
join public.course_offerings o on o.id = r.offering_id
where (select private.is_eligible());
revoke all on public.course_reviews_public from public, anon;
grant select on public.course_reviews_public to authenticated;

create function public.my_course_review_offerings()
returns table (offering_id text)
language sql stable security definer
set search_path = ''
as $$
  select r.offering_id
  from public.course_reviews r
  where r.user_id = (select auth.uid())
    and (select private.is_eligible());
$$;
revoke all on function public.my_course_review_offerings() from public, anon;
grant execute on function public.my_course_review_offerings() to authenticated;

commit;
