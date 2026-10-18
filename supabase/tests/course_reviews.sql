-- Isolated Postgres test only. Run after bootstrap.sql, the account migration,
-- and course_reviews migration. NEVER run this file against Supabase.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, message text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %', message; end if; end; $$;

-- Add a test-only offering to check two professors for the same course/term.
insert into public.course_offerings (id,course_code,course_title,professor_name,semester,academic_year)
values ('cse-416-fall-2025-patel','CSE 416','Software Engineering','Prof. Patel','Fall',2025);

insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000011','reviewer-a@stonybrook.edu',now()),
 ('00000000-0000-0000-0000-000000000012','reviewer-b@stonybrook.edu',now()),
 ('00000000-0000-0000-0000-000000000013','reviewer-c@gmail.com',now());
insert into auth.identities(user_id,provider,identity_data)
select id,'google',jsonb_build_object('email',email,'email_verified',true)
from auth.users where id in (
 '00000000-0000-0000-0000-000000000011',
 '00000000-0000-0000-0000-000000000012',
 '00000000-0000-0000-0000-000000000013'
);

select pg_temp.assert((select count(*) = 7 from information_schema.columns where table_schema='public' and table_name='course_reviews'), 'review table has exactly seven columns');
select pg_temp.assert(not has_column_privilege('authenticated','public.course_reviews','user_id','INSERT'), 'client cannot set reviewer identity column');
select pg_temp.assert(not has_column_privilege('authenticated','public.course_reviews','user_id','SELECT'), 'client cannot read reviewer identity column');
select pg_temp.assert((select coalesce(reloptions @> array['security_invoker=true'], false) from pg_class where oid='public.course_reviews_public'::regclass), 'review view uses caller permissions and RLS');
select pg_temp.assert(not has_table_privilege('anon','public.course_reviews','SELECT'), 'anonymous role cannot read base table');
select pg_temp.assert(not has_table_privilege('anon','public.course_reviews_public','SELECT'), 'anonymous role cannot read projection');
select pg_temp.assert((select count(*) = 9 from information_schema.columns where table_schema='public' and table_name='profiles'), 'existing profiles columns still present');
select pg_temp.assert((select count(*) = 5 from information_schema.columns where table_schema='public' and table_name='user_courses'), 'existing user_courses columns still present');
select pg_temp.assert((select count(*) = 2 from information_schema.columns where table_schema='public' and table_name='user_course_sections'), 'existing user_course_sections columns still present');
select pg_temp.assert((select count(*) = 3 from pg_policies where schemaname='public' and tablename in ('profiles','user_courses','user_course_sections')), 'existing owner policies still present');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select pg_temp.assert(public.account_is_eligible(), 'reviewer A eligible');
insert into public.course_reviews(offering_id,difficulty,weekly_hours,review)
values ('cse-416-fall-2025-lee',4,12.5,'Clear project milestones.');

do $$ begin
  begin
    insert into public.course_reviews(offering_id,difficulty,weekly_hours)
    values ('cse-416-fall-2025-lee',3,8);
    raise exception 'duplicate review accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.course_reviews(offering_id,difficulty,weekly_hours)
    values ('unknown-offering',3,8);
    raise exception 'invalid offering accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.course_reviews(offering_id,difficulty,weekly_hours)
    values ('cse-416-fall-2025-lee',3,41);
    raise exception 'invalid hours accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.course_reviews(offering_id,user_id,difficulty,weekly_hours)
    values ('cse-416-fall-2025-lee','00000000-0000-0000-0000-000000000012',3,8);
    raise exception 'identity spoof accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

insert into public.course_reviews(offering_id,difficulty,weekly_hours,review)
values ('cse-416-fall-2025-patel',3,9,'Different professor, same course and term.');
select pg_temp.assert((select count(*) = 2 from public.course_reviews_public where course_code='CSE 416' and semester='Fall' and academic_year=2025), 'same course/term different professor offerings stay distinct');
select pg_temp.assert((select count(*) = 2 from public.my_course_review_offerings()), 'student sees only their reviewed offering keys');
select pg_temp.assert((select count(*) = 0 from information_schema.columns where table_schema='public' and table_name='course_reviews_public' and column_name in ('user_id','name','email','reviewer_name')), 'review projection omits reviewer identity');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',true);
select pg_temp.assert(public.account_is_eligible(), 'reviewer B eligible');
select pg_temp.assert((select count(*) = 2 from public.course_reviews_public where course_code='CSE 416' and semester='Fall' and academic_year=2025), 'eligible peer can read anonymous reviews');
select pg_temp.assert((select count(*) = 0 from public.my_course_review_offerings()), 'peer cannot see another student's submission state');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',true);
select pg_temp.assert(not public.account_is_eligible(), 'gmail reviewer ineligible');
do $$ begin
  begin
    insert into public.course_reviews(offering_id,difficulty,weekly_hours)
    values ('bio-201-fall-2026-kim',2,2);
    raise exception 'ineligible insert accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role anon;
do $$ begin
  begin perform * from public.course_reviews_public; raise exception 'anonymous projection read accepted';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
