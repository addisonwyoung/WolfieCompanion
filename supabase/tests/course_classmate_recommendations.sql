-- Isolated local Postgres only; never run this script on a hosted Supabase project.
-- Requires the accounts, discovery, and classmate-profile migrations plus bootstrap.sql.
\set ON_ERROR_STOP on
create function pg_temp.assert(ok boolean, message text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %', message; end if; end $$;
\ir ../migrations/202610220003_course_classmate_recommendations.sql
\ir ../migrations/202610220004_friend_requests.sql
\ir ../migrations/202610230004_course_recommendation_shared_courses.sql
\ir ../migrations/202610240001_course_recommendation_friend_exclusion.sql
begin;

select pg_temp.assert(has_function_privilege('authenticated','public.course_recommendation_profiles(text)','execute')
  and not has_function_privilege('anon','public.course_recommendation_profiles(text)','execute')
  and not exists (select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a
    where a.grantee=0 and a.privilege_type='EXECUTE'), 'function ACL')
  from pg_proc where oid='public.course_recommendation_profiles(text)'::regprocedure;

insert into auth.users(id,email,email_confirmed_at) values
 ('30000000-0000-0000-0000-000000000001','recommend-caller@stonybrook.edu',now()),
 ('30000000-0000-0000-0000-000000000002','recommend-peer@stonybrook.edu',now()),
 ('30000000-0000-0000-0000-000000000003','recommend-other@stonybrook.edu',now()),
 ('30000000-0000-0000-0000-000000000004','recommend-ineligible@gmail.com',now());
insert into auth.identities
select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id::text like '30000000-%';
insert into public.user_courses(user_id,course_code) values
 ('30000000-0000-0000-0000-000000000001','CSE 310'),
 ('30000000-0000-0000-0000-000000000001','AMS 210'),
 ('30000000-0000-0000-0000-000000000002','CSE 310'),
 ('30000000-0000-0000-0000-000000000002','AMS 210'),
 ('30000000-0000-0000-0000-000000000003','AMS 210'),
 ('30000000-0000-0000-0000-000000000004','CSE 310');
insert into public.user_course_sections(user_course_id,section)
select id, section from public.user_courses cross join (values ('01'),('02')) sections(section)
where user_id='30000000-0000-0000-0000-000000000002';
update public.profiles set name='Recommendation Peer',major='Computer Science',year='Third year',
 interests=array['Private interest'],residence_status='dormer',share_year=false,
 share_interests=false,share_residence_status=false where id='30000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select pg_temp.assert((select count(*)=1 and min(student_id::text)='30000000-0000-0000-0000-000000000002'
  from public.course_recommendation_profiles('cse310')), 'normalized course membership, self/ineligible/unrelated exclusion and section deduplication');
select pg_temp.assert((select shared_courses=array['AMS 210','CSE 310']::text[]
  from public.course_recommendation_profiles('CSE 310')), 'shared courses include the visible intersection only once and in stable order');
select pg_temp.assert((select name='Recommendation Peer' and major='Computer Science'
  and year is null and interests is null and residence_status is null
  from public.course_recommendation_profiles('CSE 310')), 'private optional fields omitted');

reset role;
update public.profiles set share_year=true,year=null,share_interests=true,interests='{}',
 share_residence_status=true,residence_status=null where id='30000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.assert((select year is null and interests='{}'::text[] and residence_status is null
  from public.course_recommendation_profiles('CSE310')), 'public null and empty values preserved');
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000004',true);
do $$ begin
  begin perform * from public.course_recommendation_profiles('CSE310'); raise exception 'ineligible caller accepted';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
do $$ begin
  begin perform * from public.course_recommendation_profiles('AMS210'); raise exception 'unsaved course accepted';
  exception when insufficient_privilege then null; end;
  begin perform * from public.course_recommendation_profiles('bad'); raise exception 'invalid course accepted';
  exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin perform * from public.course_recommendation_profiles('CSE310'); raise exception 'anonymous caller accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform * from public.course_recommendation_profiles('CSE310'); raise exception 'anon execute accepted';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
