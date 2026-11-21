-- DISPOSABLE DATABASE ONLY, after scoped audit baseline + Stage 1/2A/2B/3A.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end; $$;
create function pg_temp.run_as(actor uuid,statement text,allowed boolean default true,expected text default '42501') returns void language plpgsql as $$
declare failed boolean:=false; begin
 perform set_config('request.jwt.claim.sub',actor::text,true); set local role authenticated;
 begin execute statement; exception when others then if sqlstate<>expected then raise; end if; failed:=true; end;
 reset role; perform pg_temp.assert(failed=not allowed,'permission: '||statement);
end; $$;
insert into auth.users(id,email,email_confirmed_at)
select ('d6000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'groupfixture'||n||'@stonybrook.edu',now() from generate_series(1,55)n;
insert into auth.identities(user_id,provider,identity_data)
select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id::text like 'd6000000-%';
update public.profiles set name='Fixture '||right(id::text,3) where id::text like 'd6000000-%';
update public.profiles set is_private=true where id::text like 'd6000000-%' and right(id::text,1) in('5','6');
insert into public.friendships(user_id,friend_id) values('d6000000-0000-0000-0000-000000000001','d6000000-0000-0000-0000-000000000005');
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',$q$select public.block_student('d6000000-0000-0000-0000-000000000003')$q$);
-- Sally independently admits a blocked pair; initial creator selects Creator Only.
set local role authenticated;
select set_config('request.jwt.claim.sub','d6000000-0000-0000-0000-000000000001',true);
select set_config('test.group',public.group_create_configured(array['d6000000-0000-0000-0000-000000000002'::uuid,'d6000000-0000-0000-0000-000000000003'::uuid],'d6000000-0000-0000-0001-000000000001','Fixture','creator_only')->>'group_id',true);
select pg_temp.assert((public.group_detail(current_setting('test.group')::uuid)->>'can_manage')::boolean,'active creator manages');
select pg_temp.assert((public.group_detail(current_setting('test.group')::uuid)->>'can_send')::boolean,'three eligible members can send despite co-member block');
select public.group_send_message(current_setting('test.group')::uuid,'Retained before departure','d6000000-0000-0000-0002-000000000001');
reset role;
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_add_members(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.group'),'d6000000-0000-0000-0000-000000000004'),false);
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_set_addition_permission(%L,''all_members'',gen_random_uuid())',current_setting('test.group')),false);
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_friend_candidates(%L)',current_setting('test.group')),false);
select pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_set_addition_permission(%L,''all_members'',''d6000000-0000-0000-0003-000000000001'')',current_setting('test.group')));
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_add_members(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.group'),'d6000000-0000-0000-0000-000000000004'));
-- Direct blocked actor-target additions remain denied (another group is needed because 3 is already a member).
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',$q$select public.group_create(array['d6000000-0000-0000-0000-000000000003'::uuid,'d6000000-0000-0000-0000-000000000007'::uuid],gen_random_uuid(),'Blocked direct')$q$,false);
-- Private nonfriend, opt-out, ineligible and partial-batch failures are atomic.
update public.profiles set allow_group_additions=false where id='d6000000-0000-0000-0000-000000000009';
delete from auth.identities where user_id='d6000000-0000-0000-0000-000000000010';
do $$ declare target uuid; before_groups bigint; before_members bigint; before_receipts bigint; begin
 select count(*) into before_groups from public.group_conversations;
 select count(*) into before_members from public.group_members;
 select count(*) into before_receipts from private.group_mutation_receipts;
 foreach target in array array['d6000000-0000-0000-0000-000000000006'::uuid,'d6000000-0000-0000-0000-000000000009'::uuid,'d6000000-0000-0000-0000-000000000010'::uuid] loop
  perform pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_create(array[%L::uuid,%L::uuid],gen_random_uuid(),''Atomic'')','d6000000-0000-0000-0000-000000000007',target),false);
  perform pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_add_members(%L,array[%L::uuid,%L::uuid],gen_random_uuid())',current_setting('test.group'),'d6000000-0000-0000-0000-000000000007',target),false);
 end loop;
 perform pg_temp.assert(before_groups=(select count(*) from public.group_conversations) and before_members=(select count(*) from public.group_members) and before_receipts=(select count(*) from private.group_mutation_receipts),'failed batches unchanged');
end; $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','d6000000-0000-0000-0000-000000000001',true);
select pg_temp.assert(exists(select 1 from jsonb_array_elements(public.group_friend_candidates()) x where x->>'student_id'='d6000000-0000-0000-0000-000000000005'),'private friend candidate');
select pg_temp.assert(not exists(select 1 from jsonb_array_elements(public.group_friend_candidates()) x where x->>'student_id'='d6000000-0000-0000-0000-000000000006'),'private nonfriend hidden');
select pg_temp.assert((select x->'can_add'='true'::jsonb and x->'reason'='null'::jsonb and not x ? 'allow_group_additions' from jsonb_array_elements(public.group_friend_candidates()) x where x->>'student_id'='d6000000-0000-0000-0000-000000000009'),'candidate selection does not expose disabled consent');
reset role;
-- Changing only consent must not change the candidate projection (new and existing group picker).
do $$ declare context uuid; before_row jsonb; after_row jsonb; begin
 foreach context in array array[null::uuid,current_setting('test.group')::uuid] loop
  perform set_config('request.jwt.claim.sub','d6000000-0000-0000-0000-000000000001',true);
  set local role authenticated;
  select x into before_row from jsonb_array_elements(public.group_friend_candidates(context)) x where x->>'student_id'='d6000000-0000-0000-0000-000000000009';
  reset role;
  update public.profiles set allow_group_additions=true where id='d6000000-0000-0000-0000-000000000009';
  set local role authenticated;
  select x into after_row from jsonb_array_elements(public.group_friend_candidates(context)) x where x->>'student_id'='d6000000-0000-0000-0000-000000000009';
  reset role;
  perform pg_temp.assert(before_row is not null and before_row=after_row,'candidate response unchanged by consent in either picker context');
  update public.profiles set allow_group_additions=false where id='d6000000-0000-0000-0000-000000000009';
 end loop;
end; $$;
-- Private friend admission preserves limited identity for active nonfriend co-members.
set local role authenticated;
select set_config('request.jwt.claim.sub','d6000000-0000-0000-0000-000000000001',true);
select set_config('test.private_group',public.group_create(array['d6000000-0000-0000-0000-000000000005'::uuid,'d6000000-0000-0000-0000-000000000007'::uuid],gen_random_uuid(),'Private friend')->>'group_id',true);
select set_config('request.jwt.claim.sub','d6000000-0000-0000-0000-000000000007',true);
select pg_temp.assert(public.group_member_identity(current_setting('test.private_group')::uuid,'d6000000-0000-0000-0000-000000000005') is not null,'private nonfriend active group identity');
select public.group_leave(current_setting('test.private_group')::uuid,gen_random_uuid());
select pg_temp.assert(public.group_member_identity(current_setting('test.private_group')::uuid,'d6000000-0000-0000-0000-000000000005') is null,'departed viewer loses private group identity');
reset role;
-- A committed retry remains non-writing below three eligible members.
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_send_message(%L,''Committed retry'',''d6000000-0000-0000-0002-000000000099'')',current_setting('test.group')));
-- Ordinary self-leave, then creator departure. Peer removal is retired.
select pg_temp.run_as('d6000000-0000-0000-0000-000000000004',format('select public.group_leave(%L,gen_random_uuid())',current_setting('test.group')));
select pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_remove_member(%L,%L)',current_setting('test.group'),'d6000000-0000-0000-0000-000000000002'),false);
select pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_set_addition_permission(%L,''creator_only'',''d6000000-0000-0000-0003-000000000002'')',current_setting('test.group')));
select pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_leave(%L,''d6000000-0000-0000-0004-000000000001'')',current_setting('test.group')));
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_send_message(%L,''Committed retry'',''d6000000-0000-0000-0002-000000000099'')',current_setting('test.group')));
select pg_temp.assert((select count(*)=2 from public.group_messages where group_id=current_setting('test.group')::uuid),'committed retry does not write below minimum');
select pg_temp.assert((select creator_departed and addition_permission='all_members' and creator_id='d6000000-0000-0000-0000-000000000001' from public.group_conversations where id=current_setting('test.group')::uuid),'atomic permanent creator transition');
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_send_message(%L,''Too small'',gen_random_uuid())',current_setting('test.group')),false);
select pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_history(%L)',current_setting('test.group')),false);
set local role authenticated;
select set_config('request.jwt.claim.sub','d6000000-0000-0000-0000-000000000001',true);
select pg_temp.assert((select count(*)=0 from public.group_messages where group_id=current_setting('test.group')::uuid),'former member direct RLS denies history');
reset role;
-- Remaining members restore sendability and write during the creator's absence.
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_add_members(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.group'),'d6000000-0000-0000-0000-000000000007'));
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_send_message(%L,''During absence'',gen_random_uuid())',current_setting('test.group')));
select pg_temp.run_as('d6000000-0000-0000-0000-000000000007',format('select public.group_leave(%L,gen_random_uuid())',current_setting('test.group')));
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_add_members(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.group'),'d6000000-0000-0000-0000-000000000001'));
-- Old successful setting receipts do not restore revoked creator privileges/settings.
select pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_set_addition_permission(%L,''creator_only'',''d6000000-0000-0000-0003-000000000002'')',current_setting('test.group')));
select pg_temp.assert((select addition_permission='all_members' from public.group_conversations where id=current_setting('test.group')::uuid),'settings retry cannot restore creator mode');
-- A lost leave acknowledgement replay must not leave the new membership episode.
select pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_leave(%L,''d6000000-0000-0000-0004-000000000001'')',current_setting('test.group')));
select pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_set_addition_permission(%L,''creator_only'',gen_random_uuid())',current_setting('test.group')),false);
set local role authenticated;
select set_config('request.jwt.claim.sub','d6000000-0000-0000-0000-000000000001',true);
select pg_temp.assert(not (public.group_detail(current_setting('test.group')::uuid)->>'can_manage')::boolean,'former creator is ordinary');
select pg_temp.assert(jsonb_array_length(public.group_history(current_setting('test.group')::uuid))=0,'readdition excludes previous-tenure history');
reset role;
select pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_send_message(%L,''Retained before departure'',''d6000000-0000-0000-0002-000000000001'')',current_setting('test.group')),false);
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_send_message(%L,''After readdition'',gen_random_uuid())',current_setting('test.group')));
-- Removing eligibility, not merely membership count, disables new messages.
delete from auth.identities where user_id='d6000000-0000-0000-0000-000000000003';
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_send_message(%L,''Ineligible third'',gen_random_uuid())',current_setting('test.group')),false);
do $$ begin
 begin insert into public.group_messages(group_id,sequence,sender_id,client_message_id,body) values(current_setting('test.group')::uuid,3,'d6000000-0000-0000-0000-000000000002',gen_random_uuid(),'Privileged bypass'); raise exception 'minimum bypass'; exception when insufficient_privilege then null; end;
end; $$;
insert into auth.identities(user_id,provider,identity_data) select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id='d6000000-0000-0000-0000-000000000003';
-- Final departure keeps the abandoned data with no access or independent rejoining.
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',format('select public.group_leave(%L,gen_random_uuid())',current_setting('test.group')));
select pg_temp.run_as('d6000000-0000-0000-0000-000000000003',format('select public.group_leave(%L,gen_random_uuid())',current_setting('test.group')));
select pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_leave(%L,gen_random_uuid())',current_setting('test.group')));
select pg_temp.assert((select count(*)=0 from public.group_members where group_id=current_setting('test.group')::uuid) and (select count(*)=4 from public.group_messages where group_id=current_setting('test.group')::uuid),'abandoned history retained');
select pg_temp.run_as('d6000000-0000-0000-0000-000000000001',format('select public.group_add_members(%L,array[%L::uuid],gen_random_uuid())',current_setting('test.group'),'d6000000-0000-0000-0000-000000000007'),false);
-- Stage 2B DM blocks/mutual settings still hold; Study functions are untouched.
select pg_temp.run_as('d6000000-0000-0000-0000-000000000002',$q$select public.dm_send_message('d6000000-0000-0000-0000-000000000003','Blocked DM',gen_random_uuid())$q$,false);
select pg_temp.assert(not has_function_privilege('authenticated','public.group_remove_member(uuid,uuid)','execute'),'peer removal unavailable');
select pg_temp.assert(not has_function_privilege('authenticated','private.group_can_add(uuid,uuid)','execute'),'helper private');
set local role anon;
do $$ begin begin perform public.group_leave(gen_random_uuid(),gen_random_uuid()); raise exception 'anonymous leave'; exception when insufficient_privilege then null; end; end; $$;
reset role;
rollback;
