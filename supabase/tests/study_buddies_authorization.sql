-- Disposable audited PostgreSQL ONLY. No hosted execution.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'ASSERT: %',label; end if;
end; $$;
create function pg_temp.actor(n integer) returns uuid language sql as $$ select ('d8200000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid; $$;
create function pg_temp.run(n integer,sql text,allowed boolean default true,code text default '42501') returns void language plpgsql as $$
declare failed boolean:=false; begin
 perform set_config('request.jwt.claim.sub',pg_temp.actor(n)::text,true); set local role authenticated;
 begin execute sql; exception when others then if sqlstate<>code then raise; end if; failed:=true; end;
 reset role; perform pg_temp.assert(failed=not allowed,'authorization: '||sql);
end; $$;
insert into auth.users(id,email,email_confirmed_at)
select pg_temp.actor(n),'study'||n||'@stonybrook.edu',now() from generate_series(1,12)n;
insert into auth.identities(user_id,provider,identity_data)
select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id::text like 'd8200000-%';
insert into public.course_offerings(id,course_code,course_title,professor_name,section,professor_first_name,professor_last_name,semester,academic_year)
select 'study-fixture','CSE 416','Study fixture','Ada Lovelace','01','Ada','Lovelace',semester,academic_year from private.resolve_current_semester(now());
insert into public.course_enrollments(user_id,course_code,course_number,section,professor_first_name,professor_last_name,semester,academic_year,verification_status,course_offering_id)
select pg_temp.actor(n),'CSE','416','01','Ada',case when n=11 then 'Other' else 'Lovelace' end,t.semester,t.academic_year,
 case when n=12 then 'pending' else 'verified' end,case when n=12 then null else 'study-fixture' end
from generate_series(1,12)n cross join private.resolve_current_semester(now()) t;
update public.profiles set is_private=true where id in(pg_temp.actor(1),pg_temp.actor(2),pg_temp.actor(4));
insert into public.friendships(user_id,friend_id) values(pg_temp.actor(1),pg_temp.actor(2));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.actor(1)::text,true);
select pg_temp.assert(exists(select 1 from jsonb_array_elements(public.study_invitation_candidates('CSE 416','01','Ada','Lovelace')) x where x->>'student_id'=pg_temp.actor(2)::text),'private friend candidate');
select pg_temp.assert(not exists(select 1 from jsonb_array_elements(public.study_invitation_candidates('CSE 416','01','Ada','Lovelace')) x where x->>'student_id' in(pg_temp.actor(4)::text,pg_temp.actor(11)::text,pg_temp.actor(12)::text)),'private nonfriend/wrong professor/pending excluded');
select set_config('test.study',public.study_create('CSE 416','01','Ada','Lovelace','Verified group',array[pg_temp.actor(2),pg_temp.actor(3)],'d8200000-0000-0000-0001-000000000001')::text,true);
reset role;
select pg_temp.assert((select private.study_occupied(current_setting('test.study')::uuid,clock_timestamp())=3),'reservation count');
-- Exact section/semester/year/course and account eligibility cannot be bypassed by UUID.
do $$ declare n integer; original public.course_enrollments; begin
 select * into original from public.course_enrollments where user_id=pg_temp.actor(10);
 for n in 1..4 loop
  update public.course_enrollments set section=case when n=1 then '02' else original.section end,
   semester=case when n=2 then case when original.semester='Fall' then 'Spring' else 'Fall' end else original.semester end,
   academic_year=case when n=3 then original.academic_year-1 else original.academic_year end,
   course_number=case when n=4 then '415' else original.course_number end where user_id=pg_temp.actor(10);
  perform pg_temp.assert(not private.study_offering_member(pg_temp.actor(10),current_setting('test.study')::uuid),'exact offering mismatch');
  perform pg_temp.run(1,format('select public.study_invite(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.study'),pg_temp.actor(10)),false);
 end loop;
 update public.course_enrollments set section=original.section,semester=original.semester,academic_year=original.academic_year,course_number=original.course_number where user_id=pg_temp.actor(10);
 delete from auth.identities where user_id=pg_temp.actor(10);
 perform pg_temp.run(1,format('select public.study_invite(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.study'),pg_temp.actor(10)),false);
 insert into auth.identities(user_id,provider,identity_data) select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id=pg_temp.actor(10);
end; $$;
select pg_temp.run(4,format('select public.study_invitation_candidates(null,null,null,null,%L)',current_setting('test.study')),false);
-- Atomic batch failure does not create a group, membership or receipt.
do $$ declare before_count bigint; begin
 select count(*) into before_count from public.study_groups;
 perform pg_temp.run(1,format('select public.study_create(''CSE 416'',''01'',''Ada'',''Lovelace'',''Denied'',array[%L::uuid,%L::uuid],gen_random_uuid())',pg_temp.actor(4),pg_temp.actor(5)),false);
 perform pg_temp.assert(before_count=(select count(*) from public.study_groups),'creation atomic');
 perform pg_temp.run(1,format('select public.study_invite(%L,array[%L::uuid,%L::uuid],gen_random_uuid())',current_setting('test.study'),pg_temp.actor(4),pg_temp.actor(5)),false);
 perform pg_temp.assert(not exists(select 1 from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(5)),'addition atomic');
end; $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.actor(2)::text,true);
select pg_temp.assert((select x->'members'='[]'::jsonb and x->'tasks'='[]'::jsonb and x->'availability'='[]'::jsonb and x->'owner_id'='null'::jsonb and x->'outgoing_invitations'='[]'::jsonb from jsonb_array_elements(public.my_study_groups()) x where x->>'group_id'=current_setting('test.study')),'pending projection private');
reset role;
-- Issuance authority persists after unfriend; co-member blocks do not veto acceptance.
delete from public.friendships where user_id=pg_temp.actor(1) and friend_id=pg_temp.actor(2);
select pg_temp.run(2,format('select public.block_student(%L)',pg_temp.actor(3)));
select pg_temp.run(2,format('select public.study_respond(%L,%L,true,gen_random_uuid())',current_setting('test.study'),(select invitation_id from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(2))));
-- Original-inviter block prevents acceptance even through privileged status writes.
select pg_temp.run(1,format('select public.block_student(%L)',pg_temp.actor(3)));
select pg_temp.run(3,format('select public.study_respond(%L,%L,true,gen_random_uuid())',current_setting('test.study'),(select invitation_id from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(3))),false);
select pg_temp.run(1,format('select public.unblock_student(%L)',pg_temp.actor(3)));
select set_config('test.invitee_name',(select name from public.profiles where id=pg_temp.actor(3)),true);
select pg_temp.run(3,format('select public.block_student(%L)',pg_temp.actor(1)));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.actor(1)::text,true);
select pg_temp.assert((select o->>'name'=current_setting('test.invitee_name') and o->>'state'='pending' from jsonb_array_elements(public.my_study_groups()) g cross join lateral jsonb_array_elements(g->'outgoing_invitations') o where g->>'group_id'=current_setting('test.study') and o->>'student_id'=pg_temp.actor(3)::text),'management projection does not encode reverse blocking');
reset role;
select pg_temp.run(3,format('select public.study_respond(%L,%L,true,gen_random_uuid())',current_setting('test.study'),(select invitation_id from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(3))),false);
select pg_temp.run(3,format('select public.unblock_student(%L)',pg_temp.actor(1)));

-- Inviter departure/eligibility loss does not invalidate proven issuance.
select pg_temp.run(1,format('select public.study_leave(%L,''d8200000-0000-0000-0002-000000000001'')',current_setting('test.study')));
delete from auth.identities where user_id=pg_temp.actor(1);
select pg_temp.run(3,format('select public.study_respond(%L,%L,true,gen_random_uuid())',current_setting('test.study'),(select invitation_id from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(3))));
select pg_temp.assert((select created_by=pg_temp.actor(2) and professor_last_name='lovelace' from public.study_groups where id=current_setting('test.study')::uuid),'succession preserves offering');
select pg_temp.assert((select invited_by=pg_temp.actor(1) from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(3)),'actual inviter preserved');
select pg_temp.run(2,format('select public.study_invite(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.study'),pg_temp.actor(5)));
update public.profiles set is_private=true,allow_group_additions=false,dm_permission='no_one' where id=pg_temp.actor(5);
select pg_temp.run(5,format('select public.study_respond(%L,%L,true,gen_random_uuid())',current_setting('test.study'),(select invitation_id from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(5))));
-- All accepted co-members retain task/availability access despite a block.
select pg_temp.run(3,format('select public.save_study_group_availability(%L,''[{"day":"Monday","start_minute":600,"end_minute":660}]''::jsonb)',current_setting('test.study')));
select pg_temp.run(3,format('select public.add_study_group_task(%L,''Collaborate'',''Shared note'')',current_setting('test.study')));
select pg_temp.run(2,format('select public.set_study_group_task_complete(%L,true)',(select id from public.study_group_tasks where group_id=current_setting('test.study')::uuid limit 1)));
select pg_temp.run(2,format('select public.dm_send_message(%L,''Still blocked'',gen_random_uuid())',pg_temp.actor(3)),false);
select pg_temp.run(2,format('select public.study_invite(%L,array[%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid],''d8200000-0000-0000-0003-000000000001'')',current_setting('test.study'),pg_temp.actor(6),pg_temp.actor(7),pg_temp.actor(8),pg_temp.actor(9),pg_temp.actor(10)));
select pg_temp.assert(private.study_occupied(current_setting('test.study')::uuid,clock_timestamp())=8,'eight occupied places');
-- Synthetic trusted-clock fixture, not an application write path.
select set_config('test.old_generation',(select invitation_id::text from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(7)),true);
alter table public.study_group_members disable trigger study_admission_block_guard;
update public.study_group_members set invitation_issued_at=clock_timestamp()-interval '168 hours' where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(7);
alter table public.study_group_members enable trigger study_admission_block_guard;
select pg_temp.assert(private.study_occupied(current_setting('test.study')::uuid,clock_timestamp())=7,'expired reservation released without cleanup');
select pg_temp.run(7,format('select public.study_respond(%L,%L,true,gen_random_uuid())',current_setting('test.study'),current_setting('test.old_generation')),false);
update public.profiles set is_private=true where id=pg_temp.actor(7);
select pg_temp.run(2,format('select public.study_invite(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.study'),pg_temp.actor(7)),false);
update public.profiles set is_private=false where id=pg_temp.actor(7);
select pg_temp.run(2,format('select public.study_invite(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.study'),pg_temp.actor(7)));
select pg_temp.assert((select invitation_id<>current_setting('test.old_generation')::uuid from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(7)),'fresh generation');
select pg_temp.run(7,format('select public.study_respond(%L,%L,false,gen_random_uuid())',current_setting('test.study'),current_setting('test.old_generation')),false);
select pg_temp.run(7,format('select public.study_respond(%L,%L,true,gen_random_uuid())',current_setting('test.study'),current_setting('test.old_generation')),false);
do $$ declare generation uuid; issued timestamptz; begin
 select invitation_id,invitation_issued_at into generation,issued from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(7);
 perform pg_temp.run(2,format('select public.study_invite(%L,array[%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid],''d8200000-0000-0000-0003-000000000001'')',current_setting('test.study'),pg_temp.actor(6),pg_temp.actor(7),pg_temp.actor(8),pg_temp.actor(9),pg_temp.actor(10)));
 perform pg_temp.assert((select invitation_id=generation and invitation_issued_at=issued from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(7)),'receipt does not renew replacement');
end; $$;
select pg_temp.run(2,format('select public.study_invite(%L,array[%L::uuid],''d8200000-0000-0000-0003-000000000001'')',current_setting('test.study'),pg_temp.actor(6)),false,'23505');
-- Issuance/response receipts survive decline and do not resurrect deleted generations.
select set_config('test.six_generation',(select invitation_id::text from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(6)),true);
select pg_temp.run(6,format('select public.study_respond(%L,%L,false,''d8200000-0000-0000-0004-000000000001'')',current_setting('test.study'),current_setting('test.six_generation')));
select pg_temp.run(2,format('select public.study_invite(%L,array[%L::uuid,%L::uuid,%L::uuid,%L::uuid,%L::uuid],''d8200000-0000-0000-0003-000000000001'')',current_setting('test.study'),pg_temp.actor(6),pg_temp.actor(7),pg_temp.actor(8),pg_temp.actor(9),pg_temp.actor(10)));
select pg_temp.assert(not exists(select 1 from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(6)),'old issuance cannot undo decline');
select pg_temp.run(2,format('select public.study_invite(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.study'),pg_temp.actor(6)));
select pg_temp.run(6,format('select public.study_respond(%L,%L,false,''d8200000-0000-0000-0004-000000000001'')',current_setting('test.study'),current_setting('test.six_generation')));
select pg_temp.assert(exists(select 1 from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(6)),'old decline cannot undo fresh issuance');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.actor(3)::text,true);
select set_config('test.final_group',public.study_create('CSE 416','01','Ada','Lovelace','Final group',array[pg_temp.actor(8)],'d8200000-0000-0000-0005-000000000001')::text,true);
select public.study_leave(current_setting('test.final_group')::uuid,gen_random_uuid());
reset role;
select pg_temp.run(3,format('select public.study_create(''CSE 416'',''01'',''Ada'',''Lovelace'',''Final group'',array[%L::uuid],''d8200000-0000-0000-0005-000000000001'')',pg_temp.actor(8)),false);
select pg_temp.assert(not exists(select 1 from public.study_groups where id=current_setting('test.final_group')::uuid),'receipt cannot resurrect abandoned Study group');
-- Legacy unverifiable invitations are non-reserving, and a stale null-generation dismissal cannot remove a fresh issue.
alter table public.study_group_members disable trigger study_admission_block_guard;
insert into public.study_group_members(group_id,user_id,role,status) values(current_setting('test.study')::uuid,pg_temp.actor(12),'member','pending');
alter table public.study_group_members enable trigger study_admission_block_guard;
select pg_temp.assert(private.study_occupied(current_setting('test.study')::uuid,clock_timestamp())=8,'legacy pending does not reserve');
select pg_temp.run(12,format('select public.study_respond(%L,null,true,gen_random_uuid())',current_setting('test.study')),false);
select pg_temp.run(6,format('select public.study_respond(%L,%L,false,gen_random_uuid())',current_setting('test.study'),(select invitation_id from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(6))));
update public.course_enrollments set verification_status='verified',course_offering_id='study-fixture' where user_id=pg_temp.actor(12);
select pg_temp.run(2,format('select public.study_invite(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.study'),pg_temp.actor(12)));
select pg_temp.run(12,format('select public.study_respond(%L,null,false,gen_random_uuid())',current_setting('test.study')),false);
select pg_temp.assert((select invitation_id is not null from public.study_group_members where group_id=current_setting('test.study')::uuid and user_id=pg_temp.actor(12)),'fresh invitation survives old legacy dismissal');
-- Legacy workspace remains collaborative and closed to new admission.
select pg_temp.run(1,format('select public.create_study_group(''CSE 416'',''01'',''Legacy bypass'',array[%L::uuid])',pg_temp.actor(3)),false);
select pg_temp.assert(not has_function_privilege('authenticated','public.respond_to_study_group_invite(uuid,boolean)','execute'),'old responder retired');
select pg_temp.assert(not has_function_privilege('authenticated','private.study_issue(uuid,uuid[])','execute'),'private helper denied');
set local role authenticated;
select set_config('request.jwt.claim.sub','d8100000-0000-0000-0000-000000000001',true);
select pg_temp.assert((select not (x->>'can_invite')::boolean and jsonb_array_length(x->'members')=4 and jsonb_array_length(x->'availability')=8 and jsonb_array_length(x->'tasks')=1 from jsonb_array_elements(public.my_study_groups()) x where x->>'group_id'='c61b70c9-3db6-498b-831f-8f6cbea3964c'),'legacy data intact');
reset role;
select pg_temp.run(1,'select public.study_leave(''c61b70c9-3db6-498b-831f-8f6cbea3964c'',gen_random_uuid())',false);
set local role anon;
do $$ begin begin perform public.study_invite(gen_random_uuid(),array[gen_random_uuid()],gen_random_uuid()); raise exception 'anonymous allowed'; exception when insufficient_privilege then null; end; end; $$;
reset role;
rollback;
