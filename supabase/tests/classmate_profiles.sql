-- Isolated local Postgres only. Requires accounts and discovery migrations.
\set ON_ERROR_STOP on
create temp table profile_policies_before as select * from pg_policies where schemaname in ('public','storage');
-- A populated profile predating the migration must stay private.
insert into auth.users(id,email) values ('20000000-0000-0000-0000-000000000001','existing@stonybrook.edu') on conflict (id) do nothing;
update public.profiles set year='Graduate', interests=array['Private'] where id='20000000-0000-0000-0000-000000000001';
\ir ../migrations/202610220002_classmate_profiles.sql
begin;
select pg_temp.assert((select not share_year and not share_interests and not share_residence_status and not share_avatar from public.profiles where id='20000000-0000-0000-0000-000000000001'),'existing private defaults');
select pg_temp.assert(not exists ((select * from profile_policies_before except select * from pg_policies where schemaname in ('public','storage')) union all (select * from pg_policies where schemaname in ('public','storage') except select * from profile_policies_before)),'policies unchanged');
select pg_temp.assert(not has_function_privilege('authenticated','public.resolve_classmate_avatar(uuid,uuid,text)','execute') and not has_function_privilege('anon','public.resolve_classmate_avatar(uuid,uuid,text)','execute') and has_function_privilege('service_role','public.resolve_classmate_avatar(uuid,uuid,text)','execute'),'resolver ACL');
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

select pg_temp.assert((select not share_year and not share_interests and not share_residence_status and not share_avatar from public.profiles where id='10000000-0000-0000-0000-000000000002'),'new private defaults');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select pg_temp.assert(public.get_classmate_profile(' cse310 ','10000000-0000-0000-0000-000000000002') = jsonb_build_object('student_id','10000000-0000-0000-0000-000000000002','name','Peer','major','Computer Science','has_shared_avatar',false),'private exact projection');
select pg_temp.assert(public.get_classmate_profile('CSE310','10000000-0000-0000-0000-000000000001') is null,'self denied');
select pg_temp.assert((select count(*)=1 from public.profiles),'direct peer profile remains denied');
select pg_temp.assert((select count(*)=1 from public.user_courses),'direct peer enrollments remain denied');
select pg_temp.assert((select count(*)=0 from storage.objects),'direct peer Storage remains denied');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
update public.profiles set share_year=true where id=auth.uid();
select pg_temp.assert((select share_year and year='Third year' from public.profiles where id=auth.uid()),'owner can persist sharing with retained year');
update public.profiles set share_year=false where id=auth.uid();
select pg_temp.assert((select not share_year and year='Third year' from public.profiles where id=auth.uid()),'revocation preserves value');
do $$ declare affected integer; begin
 update public.profiles set share_year=true where id='10000000-0000-0000-0000-000000000001'; get diagnostics affected=row_count;
 perform pg_temp.assert(affected=0,'peer cannot change flags');
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);

select pg_temp.assert(public.get_classmate_profile('CSE310','10000000-0000-0000-0000-000000000004') is null,'unrelated denied');
select pg_temp.assert(public.get_classmate_profile('CSE310','10000000-0000-0000-0000-000000000005') is null,'ineligible peer denied');
select pg_temp.assert(public.get_classmate_profile('CSE310','10000000-0000-0000-0000-000000000099') is null,'unknown denied');
do $$ begin
 begin perform public.resolve_classmate_avatar('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','CSE310'); raise exception 'resolver exposed'; exception when insufficient_privilege then null; end;
 begin perform public.get_classmate_profile('bad','10000000-0000-0000-0000-000000000002'); raise exception 'invalid accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- Owner opts in one field at a time; nothing else becomes visible.
do $$ declare flag text; field text; value jsonb; begin
 for flag,field in select * from (values ('share_year','year'),('share_interests','interests'),('share_residence_status','residence_status')) x(f,k) loop
 execute format('update public.profiles set %I=true where id=%L',flag,'10000000-0000-0000-0000-000000000002');
 value := public.get_classmate_profile('CSE310','10000000-0000-0000-0000-000000000002');
 perform pg_temp.assert(value ? field and (select count(*)=5 from jsonb_object_keys(value)),'independent flag '||flag);
 execute format('update public.profiles set %I=false where id=%L',flag,'10000000-0000-0000-0000-000000000002');
 end loop;
end $$;
update public.profiles set share_year=true,year=null,share_interests=true,interests='{}',share_residence_status=true,residence_status=null where id='10000000-0000-0000-0000-000000000002';
select pg_temp.assert(public.get_classmate_profile('CSE310','10000000-0000-0000-0000-000000000002') @> '{"year":null,"interests":[],"residence_status":null}','shared empty values');
update public.profiles set share_avatar=true,avatar_path='10000000-0000-0000-0000-000000000002/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png' where id='10000000-0000-0000-0000-000000000002';
select pg_temp.assert(public.resolve_classmate_avatar('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','cse310') like '%/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png','current shared picture');
update public.profiles set avatar_path='10000000-0000-0000-0000-000000000002/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png' where id='10000000-0000-0000-0000-000000000002';
select pg_temp.assert(public.resolve_classmate_avatar('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','CSE310') like '%/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png','only replacement path');
update public.profiles set share_avatar=false where id='10000000-0000-0000-0000-000000000002';
select pg_temp.assert(public.resolve_classmate_avatar('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','CSE310') is null,'revocation');
update public.profiles set share_avatar=true,avatar_path=null where id='10000000-0000-0000-0000-000000000002';
select pg_temp.assert(public.resolve_classmate_avatar('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','CSE310') is null,'removed picture');
update public.profiles set avatar_path='10000000-0000-0000-0000-000000000002/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png' where id='10000000-0000-0000-0000-000000000002';
select pg_temp.assert(public.resolve_classmate_avatar('10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002','CSE310') is null,'resolver ineligible caller');
select pg_temp.assert(public.resolve_classmate_avatar(null,'10000000-0000-0000-0000-000000000002','CSE310') is null,'resolver anonymous');
select pg_temp.assert(public.resolve_classmate_avatar('10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','CSE310') is null,'resolver unrelated caller');
delete from public.user_courses where user_id='10000000-0000-0000-0000-000000000002';
select pg_temp.assert(public.resolve_classmate_avatar('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','CSE310') is null,'resolver revoked membership');
select pg_temp.assert(public.get_classmate_profile('CSE310','10000000-0000-0000-0000-000000000002') is null,'detail revoked membership');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
do $$ begin begin perform public.get_classmate_profile('CSE310','10000000-0000-0000-0000-000000000002'); raise exception 'ineligible caller'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin begin perform public.get_classmate_profile('CSE310','10000000-0000-0000-0000-000000000002'); raise exception 'missing session'; exception when insufficient_privilege then null; end; end $$;
reset role;
set local role anon;
do $$ begin begin perform public.get_classmate_profile('CSE310','10000000-0000-0000-0000-000000000002'); raise exception 'anon accepted'; exception when insufficient_privilege then null; end; end $$;
rollback;
