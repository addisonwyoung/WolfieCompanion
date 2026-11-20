-- Disposable synthetic database ONLY after the audited baseline plus Stage 1/2A.
-- Executed only by the isolated local runtime harness; never run on live Supabase.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end; $$;
insert into auth.users(id,email,email_confirmed_at)
select ('d1000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'privacy'||n||'@stonybrook.edu',now() from generate_series(1,4)n;
insert into auth.identities(user_id,provider,identity_data)
select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id::text like 'd1000000-%';
update public.profiles set name='Synthetic student',share_year=false,share_interests=false,share_residence_status=false,share_avatar=false,is_private=(id='d1000000-0000-0000-0000-000000000002') where id::text like 'd1000000-%';
insert into public.friendships(user_id,friend_id) values
('d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002'),
('d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000003');
update public.profiles set avatar_path=id::text||'/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png' where id='d1000000-0000-0000-0000-000000000002';
-- Current offering fixtures use the audited schema, never old user_courses discovery.
insert into public.course_offerings(id,course_code,course_title,professor_name,section,professor_first_name,professor_last_name,semester,academic_year)
select 'privacy-fixture-cse-310','CSE 310','Synthetic course','Ada Lovelace','01','Ada','Lovelace',semester,academic_year
from private.resolve_current_semester(now());
insert into public.course_enrollments(user_id,course_code,course_number,section,professor_first_name,professor_last_name,semester,academic_year,verification_status,course_offering_id)
select u.id,'CSE','310','01','Ada','Lovelace',t.semester,t.academic_year,
 case when u.id='d1000000-0000-0000-0000-000000000004' then 'pending' else 'verified' end,
 case when u.id='d1000000-0000-0000-0000-000000000004' then null else 'privacy-fixture-cse-310' end
from auth.users u cross join private.resolve_current_semester(now()) t where u.id::text like 'd1000000-%';
update public.profiles set major=case when id='d1000000-0000-0000-0000-000000000004' then 'History' else 'Computer Science' end where id::text like 'd1000000-%';
-- Privileged resolution rechecks the audience; even a matching offering is not privacy consent.
update public.profiles set share_avatar=true where id='d1000000-0000-0000-0000-000000000002';
set local role service_role;
select pg_temp.assert(public.resolve_friend_avatar('d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002') is not null,'service resolves private accepted friend');
select pg_temp.assert(public.resolve_friend_avatar('d1000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000002') is null,'service denies private nonfriend');
select pg_temp.assert(public.resolve_classmate_avatar_by_professor('d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002','CSE 310','01','Ada','Lovelace') is not null,'service resolves authorized offering friend');
select pg_temp.assert(public.resolve_classmate_avatar_by_professor('d1000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000002','CSE 310','01','Ada','Lovelace') is null,'offering cannot override private profile');
reset role;
update public.profiles set share_avatar=false where id='d1000000-0000-0000-0000-000000000002';
-- Catalog checks catch bypasses without depending on a successful course lookup.
select pg_temp.assert(not exists(select 1 from unnest(array[
 'public.find_classmates(text,text)','public.course_recommendation_profiles(text,text)',
 'public.course_friend_relationships(text,text)','public.get_classmate_profile(text,text,uuid)',
 'public.send_friend_request(text,text,uuid)','public.resolve_classmate_avatar(uuid,uuid,text,text)'
]) signature where has_function_privilege('authenticated',signature,'execute') or has_function_privilege('anon',signature,'execute') or has_function_privilege('service_role',signature,'execute')),'all retired overloads unavailable');
select pg_temp.assert(not has_function_privilege('authenticated','public.resolve_group_avatar(uuid,uuid,uuid)','execute') and has_function_privilege('service_role','public.resolve_group_avatar(uuid,uuid,uuid)','execute'),'no forged-caller resolver access');
select pg_temp.assert(not has_function_privilege('authenticated','private.students_blocked(uuid,uuid)','execute'),'block direction helper private');
select pg_temp.assert(not exists(select 1 from unnest(array[
 'public.resolve_friend_avatar(uuid,uuid)',
 'public.resolve_classmate_avatar_by_professor(uuid,uuid,text,text,text,text)',
 'public.resolve_group_avatar(uuid,uuid,uuid)'
]) signature where has_function_privilege('authenticated',signature,'execute') or has_function_privilege('anon',signature,'execute') or not has_function_privilege('service_role',signature,'execute')),'all caller-ID resolvers explicitly service-only');

set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
select pg_temp.assert(public.get_discoverable_profile('d1000000-0000-0000-0000-000000000002') is not null,'private accepted friend visible');
select pg_temp.assert((select relationship='accepted' from public.friend_directory() where student_id='d1000000-0000-0000-0000-000000000003'),'public friends remain generally discoverable');
select pg_temp.assert((select array_agg(k order by k)=array['has_shared_avatar','major','name','student_id'] from jsonb_object_keys(public.get_discoverable_profile('d1000000-0000-0000-0000-000000000002')) k),'friend profile excludes settings/email/schedules/unshared fields');
select pg_temp.assert((select count(*)=1 from public.profiles),'raw profiles remain owner-only');
do $$ begin
 begin perform public.resolve_friend_avatar('d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002'); raise exception 'forged friend caller accepted'; exception when insufficient_privilege then null; end;
 begin perform public.resolve_classmate_avatar_by_professor('d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002','CSE 310','01','Ada','Lovelace'); raise exception 'forged professor caller accepted'; exception when insufficient_privilege then null; end;
 begin perform public.resolve_group_avatar('d1000000-0000-0000-0000-000000000001',gen_random_uuid(),'d1000000-0000-0000-0000-000000000002'); raise exception 'forged group caller accepted'; exception when insufficient_privilege then null; end;
end; $$;

select pg_temp.assert((select count(*)=0 from public.find_classmates_by_professor('CSE 310','01','Ada','Lovelace') where student_id='d1000000-0000-0000-0000-000000000002'),'private friend absent from general classmate roster');
select pg_temp.assert((select count(*)=1 from public.find_classmates_by_professor('CSE 310','01','Ada','Lovelace') where student_id='d1000000-0000-0000-0000-000000000003'),'public verified offering classmate visible');
select pg_temp.assert((select count(*)=0 from public.find_classmates_by_professor('CSE 310','01','Ada','Lovelace') where student_id='d1000000-0000-0000-0000-000000000004'),'pending enrollment excluded');
select pg_temp.assert((select count(*)=0 from public.course_recommendation_profiles_by_professor('CSE 310','01','Ada','Lovelace') where student_id='d1000000-0000-0000-0000-000000000002'),'private recommendation excluded');
do $$ begin
 begin perform public.find_classmates_by_professor('CSE 310','02','Ada','Lovelace'); raise exception 'wrong section accepted'; exception when insufficient_privilege then null; end;
 begin perform public.find_classmates_by_professor('CSE 310','01','Different','Professor'); raise exception 'wrong professor accepted'; exception when insufficient_privilege then null; end;
end; $$;

select set_config('test.privacy_group',public.group_create(array['d1000000-0000-0000-0000-000000000002'::uuid,'d1000000-0000-0000-0000-000000000003'::uuid],gen_random_uuid(),'Privacy fixture')->>'group_id',true);
select public.group_send_message(current_setting('test.privacy_group')::uuid,'Historical group author',gen_random_uuid());
select set_config('test.privacy_dm_request',gen_random_uuid()::text,true);
select public.dm_send_message('d1000000-0000-0000-0000-000000000002','Stored before block',current_setting('test.privacy_dm_request')::uuid);
select set_config('test.privacy_dm',public.dm_contact_state('d1000000-0000-0000-0000-000000000002')->>'conversation_id',true);
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000003',true);
select pg_temp.assert(public.get_discoverable_profile('d1000000-0000-0000-0000-000000000002') is null,'private nonfriend hidden despite shared group');
select pg_temp.assert(public.get_friend_profile('d1000000-0000-0000-0000-000000000002') is null,'friend lookup cannot use shared-group context');
select pg_temp.assert(public.get_classmate_profile_by_professor('CSE 310','01','Ada','Lovelace','d1000000-0000-0000-0000-000000000002') is null,'private identifier lookup cannot bypass course privacy');
select pg_temp.assert(public.group_member_identity(current_setting('test.privacy_group')::uuid,'d1000000-0000-0000-0000-000000000002')->>'name'='Synthetic student','private co-member contextual name');
select pg_temp.assert(public.get_discoverable_profile('d1000000-0000-0000-0000-000000000004') is not null,'public unrelated student visible across courses');
select pg_temp.assert((select count(*)=0 from public.friend_directory() where student_id='d1000000-0000-0000-0000-000000000002'),'directory excludes private nonfriend');
do $$ begin
 begin perform public.send_friend_request_to_student('d1000000-0000-0000-0000-000000000002'); raise exception 'private target accepted'; exception when insufficient_privilege then null; end;
 begin perform public.find_classmates('CSE 310','01'); raise exception 'legacy lookup accepted'; exception when insufficient_privilege then null; end;
end; $$;
-- Study regression: pending peers are not active members. Acceptance serializes
-- on the group and checks accepted members, while decline always remains possible.
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
select set_config('test.privacy_study',public.create_study_group('CSE 310','01','Study privacy fixture',array['d1000000-0000-0000-0000-000000000002'::uuid,'d1000000-0000-0000-0000-000000000003'::uuid])::text,true);
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000002',true);
select public.block_student('d1000000-0000-0000-0000-000000000003');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
do $$ begin
 begin perform public.create_study_group('CSE 310','01','Blocked creation',array['d1000000-0000-0000-0000-000000000002'::uuid,'d1000000-0000-0000-0000-000000000003'::uuid]); raise exception 'blocked new study pair accepted'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000003',true);
select public.respond_to_study_group_invite(current_setting('test.privacy_study')::uuid,true);
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000002',true);
do $$ begin
 begin perform public.respond_to_study_group_invite(current_setting('test.privacy_study')::uuid,true); raise exception 'blocked active study peer accepted'; exception when insufficient_privilege then null; end;
end; $$;
select public.respond_to_study_group_invite(current_setting('test.privacy_study')::uuid,false);
select public.unblock_student('d1000000-0000-0000-0000-000000000003');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000003',true);
select public.block_student('d1000000-0000-0000-0000-000000000001');
select public.save_study_group_availability(current_setting('test.privacy_study')::uuid,'[]'::jsonb);
reset role;
-- Fixture-only no-op update must not eject/revalidate already accepted co-members.
update public.study_group_members set status=status where group_id=current_setting('test.privacy_study')::uuid;
select pg_temp.assert((select count(*)=2 from public.study_group_members where group_id=current_setting('test.privacy_study')::uuid),'block preserves accepted study members');
set local role authenticated;
select public.leave_study_group(current_setting('test.privacy_study')::uuid);
select public.unblock_student('d1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
select public.leave_study_group(current_setting('test.privacy_study')::uuid);
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
select public.block_student('d1000000-0000-0000-0000-000000000002');
select public.block_student('d1000000-0000-0000-0000-000000000002');
select pg_temp.assert((select count(*)=1 from public.student_blocks),'block is idempotent and owner-readable');
select pg_temp.assert((select count(*)=0 from public.friendships where friend_id='d1000000-0000-0000-0000-000000000002'),'blocking removes friendship');
select public.dm_send_message('d1000000-0000-0000-0000-000000000002','Stored before block',current_setting('test.privacy_dm_request')::uuid);
select pg_temp.assert(jsonb_array_length(public.dm_history(current_setting('test.privacy_dm')::uuid))=1,'historical DM and committed replay retained without duplicate');
select pg_temp.assert(public.group_member_identity(current_setting('test.privacy_group')::uuid,'d1000000-0000-0000-0000-000000000002') is not null,'block preserves group identity');
do $$ begin
 begin perform public.block_student(auth.uid()); raise exception 'self block accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.dm_send_message('d1000000-0000-0000-0000-000000000002','Blocked send',gen_random_uuid()); raise exception 'blocked send accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.student_blocks(blocker_id,blocked_id) values(auth.uid(),'d1000000-0000-0000-0000-000000000004'); raise exception 'direct block accepted'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000002',true);
select pg_temp.assert((select count(*)=0 from public.student_blocks),'reverse block list private');
select pg_temp.assert(public.get_discoverable_profile('d1000000-0000-0000-0000-000000000001') is null,'block denies discovery both ways');
select pg_temp.assert(public.dm_contact_state('d1000000-0000-0000-0000-000000000001')->>'can_send'='false','existing blocked thread read-only state');
select pg_temp.assert((select count(*)=0 from public.friend_directory() where student_id='d1000000-0000-0000-0000-000000000001'),'blocked public target hidden from directory');
select pg_temp.assert(public.get_discoverable_profile('d1000000-0000-0000-0000-000000000004') is not null,'private caller can discover public students');
select pg_temp.assert(public.group_member_identity(current_setting('test.privacy_group')::uuid,auth.uid())->>'has_picture'='true','group picture independent of general sharing');
select pg_temp.assert((select array_agg(k order by k)=array['has_picture','name','student_id'] from jsonb_object_keys(public.group_member_identity(current_setting('test.privacy_group')::uuid,auth.uid())) k),'group identity minimal');
do $$ begin
 begin perform public.dm_send_message('d1000000-0000-0000-0000-000000000001','Reverse blocked send',gen_random_uuid()); raise exception 'reverse send accepted'; exception when insufficient_privilege then null; end;
end; $$;
select public.block_student('d1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
select public.unblock_student('d1000000-0000-0000-0000-000000000002');
select pg_temp.assert(public.get_discoverable_profile('d1000000-0000-0000-0000-000000000002') is null,'reverse block survives unblock');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000004',true);
select pg_temp.assert(public.group_member_identity(current_setting('test.privacy_group')::uuid,'d1000000-0000-0000-0000-000000000002') is null,'outsider cannot enumerate group identities');
select public.send_friend_request_to_student('d1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
select set_config('test.stale_request',(select id::text from public.friend_requests where sender_id='d1000000-0000-0000-0000-000000000004' and status='pending'),true);
select public.block_student('d1000000-0000-0000-0000-000000000004');
do $$ begin
 begin perform public.respond_to_friend_request(current_setting('test.stale_request')::uuid,'accept'); raise exception 'stale accept succeeded'; exception when insufficient_privilege then null; end;
end; $$;
select public.unblock_student('d1000000-0000-0000-0000-000000000004');
select pg_temp.assert((select count(*)=0 from public.friendships where friend_id='d1000000-0000-0000-0000-000000000004'),'unblock does not restore friendship');
reset role;
set local role service_role;
select pg_temp.assert(public.resolve_group_avatar('d1000000-0000-0000-0000-000000000003',current_setting('test.privacy_group')::uuid,'d1000000-0000-0000-0000-000000000002') is not null,'private co-member picture authorized');
select pg_temp.assert(public.resolve_group_avatar('d1000000-0000-0000-0000-000000000004',current_setting('test.privacy_group')::uuid,'d1000000-0000-0000-0000-000000000002') is null,'outsider picture denied');
reset role;
-- Fixture-only removal models departure; does not implement new departure behavior.
delete from public.group_members where group_id=current_setting('test.privacy_group')::uuid and user_id='d1000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000003',true);
select pg_temp.assert(public.group_member_identity(current_setting('test.privacy_group')::uuid,'d1000000-0000-0000-0000-000000000001') is null,'former target has no active identity access');
select pg_temp.assert(public.group_history(current_setting('test.privacy_group')::uuid)->0->>'sender_name'='Synthetic student','historical message attribution retained');
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
select pg_temp.assert(public.group_member_identity(current_setting('test.privacy_group')::uuid,'d1000000-0000-0000-0000-000000000002') is null,'departed caller identity denied');
reset role;
update public.course_enrollments set verification_status='rejected' where user_id='d1000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=0 from public.find_classmates_by_professor('CSE 310','01','Ada','Lovelace') where student_id='d1000000-0000-0000-0000-000000000004'),'rejected enrollment excluded');
reset role;
update auth.users set email_confirmed_at=null where id='d1000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000004',true);
do $$ begin
 begin perform public.block_student('d1000000-0000-0000-0000-000000000003'); raise exception 'ineligible block accepted'; exception when insufficient_privilege then null; end;
 begin perform public.unblock_student('d1000000-0000-0000-0000-000000000003'); raise exception 'ineligible unblock accepted'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.block_student('d1000000-0000-0000-0000-000000000001'); raise exception 'anon block'; exception when insufficient_privilege then null; end;
 begin perform public.resolve_friend_avatar('d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002'); raise exception 'anon avatar'; exception when insufficient_privilege then null; end;
end; $$;
rollback;
