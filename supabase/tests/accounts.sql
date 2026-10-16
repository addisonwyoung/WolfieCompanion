\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','a@stonybrook.edu',now(),'{"full_name":"Student A"}'),
 ('00000000-0000-0000-0000-000000000002','b@stonybrook.edu',now(),'{"full_name":"Student B"}'),
 ('00000000-0000-0000-0000-000000000003','c@gmail.com',now(),'{}'),
 ('00000000-0000-0000-0000-000000000004','d@stonybrook.edu',null,'{}');
insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select pg_temp.assert(public.account_is_eligible(),'eligible owner');
select public.ensure_profile();
update public.profiles set name='Edited',major=null,interests=array['Music'] where id=auth.uid();
select public.ensure_profile();
select pg_temp.assert((select count(*)=1 and min(name)='Edited' from public.profiles),'idempotent initialization and owner read');
do $$ begin
 begin update public.profiles set name=' '; raise exception 'blank accepted'; exception when check_violation then null; end;
 begin update public.profiles set interests=array['Music','music']; raise exception 'duplicates accepted'; exception when check_violation then null; end;
 begin update public.profiles set year='Unknown'; raise exception 'year accepted'; exception when check_violation then null; end;
 begin update public.profiles set id='00000000-0000-0000-0000-000000000002'; raise exception 'owner reassigned'; exception when insufficient_privilege then null; end;
end $$;
select public.save_enrollments('[{"code":"cse310","section":"01"},{"code":"CSE 310","section":"02"},{"code":"CSE 310","section":"01"},{"code":"AMS210","section":""}]');
select public.save_enrollments('[{"code":"CSE310","section":"01"}]');
select pg_temp.assert((select count(*)=2 from public.user_courses),'deduplicated courses');
select pg_temp.assert((select count(*)=2 and min(section)='01' from public.user_course_sections),'distinct sections preserve zeros');
do $$ begin
 begin perform public.save_enrollments('[{"code":"AAA100","section":"01"},{"code":"ZZZ999","section":"bad!"}]'); raise exception 'invalid accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.save_enrollments((select jsonb_agg(jsonb_build_object('code','AAA100','section','01')) from generate_series(1,101))); raise exception 'oversized accepted'; exception when invalid_parameter_value then null; end;
 begin insert into public.user_courses(user_id,course_code) values(auth.uid(),'bad'); raise exception 'invalid direct write accepted'; exception when check_violation then null; end;
end $$;
select pg_temp.assert((select count(*)=2 from public.user_courses),'batch rollback');
insert into storage.objects(bucket_id,name) values('avatars',auth.uid()::text||'/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png');
select pg_temp.assert((select count(*)=1 from storage.objects),'avatar owner read');
select set_config('test.owner_course_id',(select id::text from public.user_courses where course_code='CSE 310'),true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.assert((select count(*)=0 from public.user_courses),'other courses private');
select pg_temp.assert((select count(*)=0 from public.user_course_sections),'other sections private');
select pg_temp.assert((select count(*)=0 from storage.objects),'other avatars private');
do $$ begin
 begin insert into public.user_courses(user_id,course_code) values('00000000-0000-0000-0000-000000000001','AAA 100'); raise exception 'foreign insert accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.user_course_sections values(current_setting('test.owner_course_id')::uuid,'03'); raise exception 'foreign section accepted'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('avatars','00000000-0000-0000-0000-000000000001/aaaaaaaa.png'); raise exception 'foreign avatar accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert(not public.account_is_eligible(),'gmail denied');
select pg_temp.assert((select count(*)=0 from public.profiles),'ineligible profile private');
do $$ begin begin perform public.ensure_profile(); raise exception 'ineligible init'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select pg_temp.assert(not public.account_is_eligible(),'unconfirmed denied');
reset role;
update auth.users set raw_user_meta_data='{"email":"a@stonybrook.edu","email_verified":true}' where id='00000000-0000-0000-0000-000000000003';
update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','false') where user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert(not public.account_is_eligible(),'editable metadata does not grant eligibility');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.assert(not public.account_is_eligible(),'provider-unverified identity denied');
reset role;
set local role anon;
do $$ begin begin perform * from public.profiles; raise exception 'anonymous read accepted'; exception when insufficient_privilege then null; end; end $$;
rollback;
