-- Isolated local Postgres only; never run this script on shared Supabase.
\set ON_ERROR_STOP on
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
-- Snapshot before installing the migration, then compare owner-only policies/ACLs.
create temp table policy_before as select * from pg_policies where schemaname in ('public','storage');
create temp table grants_before as select oid,relacl,relrowsecurity from pg_class where oid in ('public.profiles'::regclass,'public.user_courses'::regclass,'public.user_course_sections'::regclass,'storage.objects'::regclass);
-- Migration commits its transaction, so fixtures below start a new rollback scope.
\ir ../migrations/202610180001_classmate_discovery.sql
begin;
select pg_temp.assert(not exists ((select * from policy_before except select * from pg_policies where schemaname in ('public','storage')) union all (select * from pg_policies where schemaname in ('public','storage') except select * from policy_before)), 'existing policies unchanged');
select pg_temp.assert(not exists (select 1 from grants_before b join pg_class c using(oid) where b.relacl is distinct from c.relacl or b.relrowsecurity is distinct from c.relrowsecurity), 'table ACLs and RLS unchanged');
select pg_temp.assert(not has_function_privilege('anon','public.find_classmates(text)','execute') and has_function_privilege('authenticated','public.find_classmates(text)','execute'), 'function ACL');
select pg_temp.assert((select prosecdef and provolatile='s' and proconfig=array['search_path=""'] and proargnames=array['p_course_code','student_id','name','major'] from pg_proc where oid='public.find_classmates(text)'::regprocedure), 'fixed definer contract');

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case when n=5 then 'wrong@gmail.com' else 'student'||n||'@stonybrook.edu' end,
 case when n=6 then null else now() end,
 jsonb_build_object('full_name',case when n in (2,3) then 'Peer' else 'Student '||n end)
from generate_series(1,9) n;
insert into auth.identities select id,case when email like 'student7@%' then 'email' else 'google' end,
 jsonb_build_object('email',email,'email_verified',email not like 'student8@%') from auth.users where id::text like '10000000-%';
update auth.identities set identity_data=jsonb_set(identity_data,'{email}','"mismatch@stonybrook.edu"') where user_id='10000000-0000-0000-0000-000000000009';
insert into public.user_courses(user_id,course_code)
select id,case when email like 'student4@%' then 'AMS 210' else 'CSE 310' end from auth.users where id::text like '10000000-%';
insert into public.user_course_sections select id,s from public.user_courses cross join (values('01'),('02')) sections(s) where user_id='10000000-0000-0000-0000-000000000002';
update public.profiles set major='Computer Science',year='Third year',interests=array['Secret interest'] where id='10000000-0000-0000-0000-000000000002';
insert into storage.objects(bucket_id,name) values ('avatars','10000000-0000-0000-0000-000000000002/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png');
select set_config('test.peer_course',(select id::text from public.user_courses where user_id='10000000-0000-0000-0000-000000000002'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select pg_temp.assert((select count(*)=2 from public.find_classmates(' cse310 ')), 'normalized match, eligible peers only, no self or section duplicates');
select pg_temp.assert((select array_agg(student_id)=array['10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003'::uuid] from public.find_classmates('CSE 310')), 'stable name and ID ordering');
select pg_temp.assert((select major is null from public.find_classmates('CSE 310') where student_id='10000000-0000-0000-0000-000000000003'), 'nullable major');
select pg_temp.assert((select array_agg(k order by k)=array['major','name','student_id'] from jsonb_object_keys((select to_jsonb(r) from public.find_classmates('CSE310') r limit 1)) k), 'exact projection');
do $$ begin
 begin perform public.find_classmates(null); raise exception 'null accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.find_classmates('bad'); raise exception 'bad accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.find_classmates('AMS210'); raise exception 'unsaved accepted'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.assert((select count(*)=1 from public.profiles), 'peer profile direct read denied');
select pg_temp.assert((select count(*)=1 from public.user_courses), 'peer memberships direct read denied');
select pg_temp.assert((select count(*)=0 from public.user_course_sections), 'peer sections direct read denied');
select pg_temp.assert((select count(*)=0 from storage.objects), 'peer avatars direct read denied');
do $$ declare affected integer; begin
 update public.profiles set name='Stolen' where id='10000000-0000-0000-0000-000000000002'; get diagnostics affected = row_count;
 perform pg_temp.assert(affected=0,'peer profile update denied');
 delete from public.user_courses where user_id='10000000-0000-0000-0000-000000000002'; get diagnostics affected = row_count;
 perform pg_temp.assert(affected=0,'peer membership delete denied');
 delete from public.user_course_sections where user_course_id=current_setting('test.peer_course')::uuid; get diagnostics affected=row_count;
 perform pg_temp.assert(affected=0,'peer section delete denied');
 delete from storage.objects; get diagnostics affected=row_count;
 perform pg_temp.assert(affected=0,'peer avatar delete denied');
 begin insert into public.user_courses(user_id,course_code) values('10000000-0000-0000-0000-000000000002','AMS 210'); raise exception 'peer insert accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.user_course_sections values(current_setting('test.peer_course')::uuid,'03'); raise exception 'peer section insert accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select pg_temp.assert((select count(*)=0 from public.find_classmates('AMS210')), 'successful empty roster');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
do $$ begin begin perform public.find_classmates('CSE310'); raise exception 'ineligible accepted'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin begin perform public.find_classmates('CSE310'); raise exception 'missing session accepted'; exception when insufficient_privilege then null; end; end $$;
reset role;
set local role anon;
do $$ begin begin perform public.find_classmates('CSE310'); raise exception 'anon accepted'; exception when insufficient_privilege then null; end; end $$;
rollback;
