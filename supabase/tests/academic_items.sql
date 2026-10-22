-- Isolated local Postgres ONLY; never run fixtures against hosted Supabase.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
create function pg_temp.reject(sql text, expected text) returns void language plpgsql as $$
begin
 begin execute sql; exception when others then
   if sqlstate = expected or (expected = '23503' and sqlstate = '23001') then return; end if; raise;
 end;
 raise exception 'Expected rejection: %',sql;
end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000021','planner-a@stonybrook.edu',now()),
 ('00000000-0000-0000-0000-000000000022','planner-b@stonybrook.edu',now()),
 ('00000000-0000-0000-0000-000000000023','planner-c@example.com',now());
insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users
 where id in ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000023');
insert into public.user_courses(id,user_id,course_code) values
 ('10000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000021','CSE 310'),
 ('10000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000022','CSE 310'),
 ('10000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000023','CSE 310'),
 ('10000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000021','AMS 210');
select pg_temp.assert(not exists(select from information_schema.columns where table_name='academic_items' and column_name='section'), 'no item section');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
insert into public.academic_items(id,user_course_id,title,type,due_date) values
 ('20000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000021','Homework','assignment','2026-10-21');
select pg_temp.assert((select due_time is null from public.academic_items), 'date-only time stays null');
update public.academic_items set title='Edited', location='Library', notes='Bring notes', due_time='14:00', type='exam';
select pg_temp.assert((select title='Edited' and location='Library' and due_time='14:00' from public.academic_items),'persist edit');
update public.academic_items set completed_at=now();
select pg_temp.reject($q$delete from public.user_courses where id='10000000-0000-0000-0000-000000000021'$q$,'23503');
update public.academic_items set completed_at=null,due_time=null;
select pg_temp.assert((select completed_at is null and due_time is null from public.academic_items),'reopen and clear time');
select pg_temp.reject($q$delete from public.user_courses where id='10000000-0000-0000-0000-000000000021'$q$,'23503');
select pg_temp.reject($q$update public.academic_items set title=' '$q$,'23514');
select pg_temp.reject($q$update public.academic_items set title=repeat('x',201)$q$,'23514');
select pg_temp.reject($q$update public.academic_items set type='invalid'$q$,'23514');
select pg_temp.reject($q$update public.academic_items set notes=repeat('x',5001)$q$,'23514');
select pg_temp.reject($q$update public.academic_items set location=repeat('x',201)$q$,'23514');
select pg_temp.reject($q$update public.academic_items set due_time='24:00'$q$,'23514');
select pg_temp.reject($q$update public.academic_items set due_date='infinity'$q$,'23514');
select pg_temp.reject($q$update public.academic_items set user_id='00000000-0000-0000-0000-000000000022'$q$,'42501');
select pg_temp.reject($q$update public.academic_items set user_course_id='10000000-0000-0000-0000-000000000022'$q$,'42501');
select pg_temp.reject($q$insert into public.academic_items(user_course_id,title,type,due_date) values('10000000-0000-0000-0000-000000000022','Spoof','quiz','2026-10-21')$q$,'42501');
delete from public.user_courses where id='10000000-0000-0000-0000-000000000024';
select pg_temp.assert(not exists(select from public.user_courses where course_code='AMS 210'),'unreferenced course deletion works');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000022',true);
select pg_temp.assert((select count(*)=0 from public.academic_items),'second user cannot read');
update public.academic_items set title='stolen';
delete from public.academic_items;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000023',true);
select pg_temp.assert((select count(*)=0 from public.academic_items),'ineligible cannot read');
select pg_temp.reject($q$insert into public.academic_items(user_course_id,title,type,due_date) values('10000000-0000-0000-0000-000000000023','Invalid','project','2026-10-21')$q$,'42501');
delete from public.academic_items;
reset role;
-- Even privileged direct course-owner reassignment cannot break the composite reference.
select pg_temp.reject($q$update public.user_courses set user_id='00000000-0000-0000-0000-000000000023',course_code='BIO 201' where id='10000000-0000-0000-0000-000000000021'$q$,'23503');
set local role anon;
select pg_temp.reject('select * from public.academic_items','42501');
select pg_temp.reject('delete from public.academic_items','42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
select pg_temp.assert((select title='Edited' from public.academic_items),'unauthorized mutations did not change owner item');
insert into public.academic_items(user_course_id,title,type,due_date,completed_at) values
 ('10000000-0000-0000-0000-000000000021','Keep completed','project','2026-10-22',now());
delete from public.academic_items where id='20000000-0000-0000-0000-000000000021';
select pg_temp.assert((select count(*)=1 and min(title)='Keep completed' from public.academic_items),'individual deletion keeps sibling');
select pg_temp.reject($q$delete from public.user_courses where id='10000000-0000-0000-0000-000000000021'$q$,'23503');
delete from public.academic_items;
delete from public.user_courses where id='10000000-0000-0000-0000-000000000021';
select pg_temp.assert((select count(*)=0 from public.academic_items),'completed deletion permitted');
rollback;
