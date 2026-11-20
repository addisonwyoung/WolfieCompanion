-- DISPOSABLE DATABASE ONLY. Run after audited baseline + Stage 1 + Stage 2A + Stage 2B.
-- Synthetic Auth records, role switching and rollback; NEVER paste into live SQL Editor.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end; $$;
insert into auth.users(id,email,email_confirmed_at)
select ('d4000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'mutual'||n||'@stonybrook.edu',now() from generate_series(1,5)n;
insert into auth.identities(user_id,provider,identity_data)
select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id::text like 'd4000000-%';
update public.profiles set name='Mutual fixture' where id::text like 'd4000000-%';
insert into public.course_offerings(id,course_code,course_title,professor_name,section,professor_first_name,professor_last_name,semester,academic_year)
select 'mutual-fixture','CSE 310','Fixture','Ada Lovelace','01','Ada','Lovelace',semester,academic_year from private.resolve_current_semester(now());
insert into public.course_enrollments(user_id,course_code,course_number,section,professor_first_name,professor_last_name,semester,academic_year,verification_status,course_offering_id)
select u.id,'CSE','310','01','Ada','Lovelace',t.semester,t.academic_year,'verified','mutual-fixture'
from auth.users u cross join private.resolve_current_semester(now()) t where u.id::text like 'd4000000-%' and right(u.id::text,1) in ('1','2');

-- Helper checks contact-state/send agreement and zero write side effects on denied sends.
create function pg_temp.expect_send(a uuid,b uuid,allowed boolean,code text default null) returns void language plpgsql as $$
declare state jsonb; sent jsonb; before_rows text; after_rows text; unread_before jsonb; unread_after jsonb; rejected boolean:=false;
begin
 select jsonb_build_array((select count(*) from public.dm_messages),(select count(*) from public.dm_conversations),
 (select jsonb_agg(to_jsonb(c) order by c.id) from public.dm_conversations c),
 (select jsonb_agg(to_jsonb(r) order by r.conversation_id,r.user_id) from public.dm_read_positions r))::text into before_rows;
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 state:=public.dm_contact_state(b,code);
 unread_before:=public.dm_unread();
 perform pg_temp.assert(coalesce((state->>'can_send')::boolean,false)=allowed,'state agrees with send');
 begin
  sent:=public.dm_send_message(b,'Mutual fixture message',gen_random_uuid(),code);
 exception when insufficient_privilege then rejected:=true;
 end;
 unread_after:=public.dm_unread();
 reset role;
 perform pg_temp.assert(rejected=not allowed,'send expected permission');
 if not allowed then
  perform pg_temp.assert(unread_before=unread_after,'denial preserves historical unread projection');
  select jsonb_build_array((select count(*) from public.dm_messages),(select count(*) from public.dm_conversations),
  (select jsonb_agg(to_jsonb(c) order by c.id) from public.dm_conversations c),
  (select jsonb_agg(to_jsonb(r) order by r.conversation_id,r.user_id) from public.dm_read_positions r))::text into after_rows;
  perform pg_temp.assert(before_rows=after_rows,'denial creates no message/thread/activity/read change');
 end if;
end; $$;

-- All nine preference combinations: new friends, new non-friend classmates,
-- and established non-friends after course loss. Test BOTH directions and public/private pairs.
do $$
declare a uuid:='d4000000-0000-0000-0000-000000000001'; b uuid:='d4000000-0000-0000-0000-000000000002';
 own text; peer text; context text; visibility text; allowed boolean;
begin
 foreach visibility in array array['public','private'] loop
 foreach context in array array['friend','classmate','established'] loop
  foreach own in array array['eligible_students','friends_only','no_one'] loop
   foreach peer in array array['eligible_students','friends_only','no_one'] loop
    delete from public.dm_conversations where user_low=a and user_high=b;
    delete from public.friendships where user_id=a and friend_id=b;
    update public.profiles set dm_permission='eligible_students',is_private=false where id in(a,b);
    update public.course_enrollments set verification_status='verified',course_offering_id='mutual-fixture' where user_id in(a,b);
    if context='friend' then insert into public.friendships(user_id,friend_id) values(a,b); end if;
    if context='established' then
     perform pg_temp.expect_send(a,b,true,'CSE 310');
     update public.course_enrollments set verification_status='rejected',course_offering_id=null where user_id in(a,b);
    end if;
    update public.profiles set dm_permission=own,is_private=(visibility='private') where id=a;
    update public.profiles set dm_permission=peer,is_private=(visibility='private') where id=b;
    allowed:=case when context='friend' then own<>'no_one' and peer<>'no_one' when context='classmate' and visibility='private' then false else own='eligible_students' and peer='eligible_students' end;
    perform pg_temp.expect_send(a,b,allowed,'CSE 310');
    perform pg_temp.expect_send(b,a,allowed,'CSE 310');
   end loop;
  end loop;
 end loop;
 end loop;
end; $$;

-- Verification status, term, offering and identifier-only negatives on fresh pairs.
delete from public.dm_conversations where user_low::text like 'd4000000-%';
delete from public.friendships where user_id::text like 'd4000000-%';
update public.profiles set dm_permission='eligible_students',is_private=false where id::text like 'd4000000-%';
update public.course_enrollments set verification_status='verified',course_offering_id='mutual-fixture' where user_id::text like 'd4000000-%';
select pg_temp.assert(private.dm_code(' abcde310a ')='ABCDE 310A','DM course parser matches offering grammar');
do $$
declare status text;
begin
 foreach status in array array['pending','rejected'] loop
  update public.course_enrollments set verification_status=status,course_offering_id=null where user_id='d4000000-0000-0000-0000-000000000002';
  perform pg_temp.expect_send('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000002',false,'CSE 310');
 end loop;
end; $$;
update public.course_enrollments set verification_status='verified',course_offering_id='mutual-fixture',section='02' where user_id='d4000000-0000-0000-0000-000000000002';
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000002',false,'CSE 310');
update public.course_enrollments set section='01',professor_last_name='Different' where user_id='d4000000-0000-0000-0000-000000000002';
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000002',false,'CSE 310');
update public.course_enrollments set professor_last_name='Lovelace',academic_year=academic_year-1 where user_id='d4000000-0000-0000-0000-000000000002';
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000002',false,'CSE 310');
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000003',false);

-- Private sender can deliberately disclose identity to a public verified classmate.
update public.course_enrollments e set academic_year=t.academic_year from private.resolve_current_semester(now()) t where e.user_id='d4000000-0000-0000-0000-000000000002';
update public.profiles set is_private=true where id='d4000000-0000-0000-0000-000000000001';
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000002','d4000000-0000-0000-0000-000000000001',false,'CSE 310');
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000002',true,'CSE 310');
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000002','d4000000-0000-0000-0000-000000000001',true);

-- A private peer's outgoing pending request is DM-only intentional disclosure.
update public.profiles set is_private=true where id='d4000000-0000-0000-0000-000000000003';
insert into public.friend_requests(sender_id,recipient_id) values('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000003');
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000003',false);
delete from public.friend_requests where sender_id='d4000000-0000-0000-0000-000000000001' and recipient_id='d4000000-0000-0000-0000-000000000003';
insert into public.friend_requests(sender_id,recipient_id) values('d4000000-0000-0000-0000-000000000003','d4000000-0000-0000-0000-000000000001');
update public.profiles set dm_permission='friends_only' where id='d4000000-0000-0000-0000-000000000003';
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000003',false);
update public.profiles set dm_permission='eligible_students' where id='d4000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','d4000000-0000-0000-0000-000000000001',true);
select pg_temp.assert(public.get_discoverable_profile('d4000000-0000-0000-0000-000000000003') is null,'pending context grants no general private profile');
reset role;
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000003',true);

-- Bilateral blocks, preserved history/unread and exact committed retry.
set local role authenticated;
select set_config('request.jwt.claim.sub','d4000000-0000-0000-0000-000000000001',true);
select set_config('test.mutual_message',public.dm_send_message('d4000000-0000-0000-0000-000000000002','Exact retry',gen_random_uuid())::text,true);
select public.block_student('d4000000-0000-0000-0000-000000000002');
select pg_temp.assert(public.dm_send_message('d4000000-0000-0000-0000-000000000002','Exact retry',(current_setting('test.mutual_message')::jsonb->>'client_message_id')::uuid)=current_setting('test.mutual_message')::jsonb,'exact retry after block returns stored result');
select pg_temp.assert(jsonb_array_length(public.dm_history((current_setting('test.mutual_message')::jsonb->>'conversation_id')::uuid))>0,'blocked participant retains history');
reset role;
-- Even a privileged backend insertion cannot use an existing conversation to bypass mutual consent.
do $$
declare m jsonb:=current_setting('test.mutual_message')::jsonb;
begin
 begin
  insert into public.dm_messages(conversation_id,sequence,sender_id,client_message_id,body)
  select id,last_sequence+1,user_low,gen_random_uuid(),'Privileged bypass' from public.dm_conversations where id=(m->>'conversation_id')::uuid;
  raise exception 'privileged blocked insertion accepted';
 exception when insufficient_privilege then null;
 end;
end; $$;
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000002',false);
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000002','d4000000-0000-0000-0000-000000000001',false);
set local role authenticated;
select set_config('request.jwt.claim.sub','d4000000-0000-0000-0000-000000000001',true);
do $$ begin
 begin perform public.dm_send_message('d4000000-0000-0000-0000-000000000002','Changed body',(current_setting('test.mutual_message')::jsonb->>'client_message_id')::uuid); raise exception 'nonce mismatch accepted'; exception when unique_violation then null; end;
 begin update public.profiles set allow_new_dms=allow_new_dms where id=auth.uid(); raise exception 'obsolete same-value update accepted'; exception when sqlstate 'PDM01' then null; end;
 begin perform private.dm_send_reason(auth.uid(),'d4000000-0000-0000-0000-000000000002',null); raise exception 'helper exposed'; exception when insufficient_privilege then null; end;
 begin insert into public.dm_messages(conversation_id,sequence,sender_id,client_message_id,body) values(gen_random_uuid(),1,auth.uid(),gen_random_uuid(),'Bypass'); raise exception 'direct write accepted'; exception when insufficient_privilege then null; end;
end; $$;
reset role;

-- Group picker/admission use independent consent; neither the DM preference nor
-- deprecated boolean changes the unchanged creator/friend-based group model.
update public.profiles set is_private=false,dm_permission='no_one' where id::text like 'd4000000-%';
insert into public.friendships(user_id,friend_id) values
('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000003'),
('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub','d4000000-0000-0000-0000-000000000001',true);
select set_config('test.mutual_group',public.group_create(array['d4000000-0000-0000-0000-000000000003'::uuid,'d4000000-0000-0000-0000-000000000004'::uuid],gen_random_uuid(),'Independent consent')->>'group_id',true);
reset role;
select pg_temp.assert((select count(*)=3 from public.group_members where group_id=current_setting('test.mutual_group')::uuid),'closed DMs do not prohibit group admission');
update public.profiles set allow_group_additions=false where id='d4000000-0000-0000-0000-000000000004';
set local role authenticated;
select pg_temp.assert((select not (x->>'can_add')::boolean from jsonb_array_elements(public.group_friend_candidates()) x where x->>'student_id'='d4000000-0000-0000-0000-000000000004'),'picker uses independent consent');
do $$ begin
 begin perform public.group_create(array['d4000000-0000-0000-0000-000000000003'::uuid,'d4000000-0000-0000-0000-000000000004'::uuid],gen_random_uuid(),'Denied consent'); raise exception 'disabled group consent bypassed'; exception when raise_exception then if sqlerrm='disabled group consent bypassed' then raise; end if; end;
end; $$;
reset role;
select pg_temp.assert((select count(*)=3 from public.group_members where group_id=current_setting('test.mutual_group')::uuid),'consent changes preserve existing membership');
do $$ begin
 begin
  insert into public.dm_messages(conversation_id,sequence,sender_id,client_message_id,body)
  select id,last_sequence+1,user_low,gen_random_uuid(),'Backend preference bypass' from public.dm_conversations
  where user_low='d4000000-0000-0000-0000-000000000001' and user_high='d4000000-0000-0000-0000-000000000003';
  raise exception 'privileged no-one insertion accepted';
 exception when insufficient_privilege then null;
 end;
end; $$;

-- General discovery and caller-ID avatar ACLs stay at Stage 2A boundaries.
-- These populated-upgrade users actually retain allow_new_dms=false, but canonical
-- independent consent=true. Neither the group picker nor mutation may read that boolean.
insert into public.friendships(user_id,friend_id) values('d3000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub','d3000000-0000-0000-0000-000000000001',true);
select pg_temp.assert((select (x->>'can_add')::boolean from jsonb_array_elements(public.group_friend_candidates()) x where x->>'student_id'='d3000000-0000-0000-0000-000000000002'),'legacy false does not close canonical group consent in picker');
select pg_temp.assert(public.group_create(array['d3000000-0000-0000-0000-000000000002'::uuid,'d3000000-0000-0000-0000-000000000004'::uuid],gen_random_uuid(),'Legacy-independent consent') is not null,'legacy false does not close canonical group admission');
reset role;
select pg_temp.assert(not has_function_privilege('authenticated','public.resolve_friend_avatar(uuid,uuid)','execute'),'avatar resolver remains service-only');
select pg_temp.assert(not has_function_privilege('authenticated','public.find_classmates(text,text)','execute'),'legacy discovery stays retired');
select pg_temp.assert(not has_function_privilege('anon','public.dm_contact_state(uuid,text)','execute'),'anonymous DM state denied');
-- Removed target eligibility closes writes, not the surviving participant's saved history.
delete from auth.identities where user_id='d4000000-0000-0000-0000-000000000003';
select pg_temp.expect_send('d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000003',false);
set local role anon;
do $$ begin
 begin perform public.dm_contact_state('d4000000-0000-0000-0000-000000000001'); raise exception 'anonymous RPC accepted'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
