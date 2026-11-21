-- Stage 3A ONLY. Manual whole-file execution after verified Stage 1/2A/2B.
-- No Study Buddies, warning, DM-policy, ownership-transfer or membership-history changes.
begin;
set local lock_timeout='5s';
do $$ declare signature text; begin
 foreach signature in array array['private.dm_send_reason(uuid,uuid,text)','private.student_visible(uuid,uuid,boolean)',
 'private.student_pair_lock(uuid,uuid)','private.group_mutate(uuid,uuid[],text,uuid)',
 'public.group_create(uuid[],uuid,text)','public.group_add_members(uuid,uuid[],uuid)',
 'public.group_remove_member(uuid,uuid)','public.group_send_message(uuid,text,uuid)',
 'public.group_friend_candidates(uuid,text,text,uuid,integer)'] loop
  if to_regprocedure(signature) is null then raise exception 'Verified Stage 2B/group prerequisite missing: %',signature; end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgrelid='public.group_members'::regclass and tgname='group_admission_block_guard' and tgenabled='O') then
  raise exception 'Enabled Stage 2A group admission guard required';
 end if;
 if exists(select 1 from unnest(array['anon','authenticated']) r where
  has_any_column_privilege(r,'public.group_members','INSERT,UPDATE') or has_table_privilege(r,'public.group_members','DELETE') or
  has_any_column_privilege(r,'public.group_messages','INSERT,UPDATE') or has_table_privilege(r,'public.group_messages','DELETE') or
  has_any_column_privilege(r,'public.group_conversations','INSERT,UPDATE') or has_table_privilege(r,'public.group_conversations','DELETE')) then
  raise exception 'Unexpected direct client group write privileges';
 end if;
end; $$;

alter table public.group_conversations
 add column addition_permission text not null default 'all_members' check(addition_permission in('all_members','creator_only')),
 add column creator_departed boolean not null default false,
 add constraint group_departed_creator_all_members check(not creator_departed or addition_permission='all_members');
-- Existing groups default All Members; absent/null historical creators cannot regain authority.
update public.group_conversations g set creator_departed=true
where creator_id is null or not exists(select 1 from public.group_members m where m.group_id=g.id and m.user_id=g.creator_id);

create function private.group_can_add(p_group uuid,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.dm_eligible(p_actor) and exists(select 1 from public.group_conversations g
 join public.group_members m on m.group_id=g.id and m.user_id=p_actor where g.id=p_group and
 (g.addition_permission='all_members' or (g.creator_id=p_actor and not g.creator_departed)));
$$;
revoke all on function private.group_can_add(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.group_detail(p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare floor bigint; result jsonb; begin
 floor:=private.group_floor(p_group_id);
 if floor is null then raise exception 'Group unavailable' using errcode='42501'; end if;
 select jsonb_build_object('group_id',g.id,'name',private.group_name(g.id),'creator_id',g.creator_id,
 'addition_permission',g.addition_permission,'can_add',private.group_can_add(g.id,auth.uid()),
 'can_manage',coalesce(g.creator_id=auth.uid() and not g.creator_departed,false),
 'can_send',(select count(*)>=3 from public.group_members m where m.group_id=g.id and private.dm_eligible(m.user_id)),
 'joined_after_sequence',floor,'last_read_sequence',v.last_read_sequence,
 'members',(select coalesce(jsonb_agg(jsonb_build_object('student_id',m.user_id,'name',case when private.dm_eligible(m.user_id) then p.name else 'Unavailable student' end) order by m.user_id),'[]'::jsonb)
 from public.group_members m join public.profiles p on p.id=m.user_id where m.group_id=g.id)) into result
 from public.group_conversations g join public.group_members v on v.group_id=g.id and v.user_id=auth.uid() where g.id=p_group_id;
 return result;
end; $$;

-- Keep the legacy candidate signature, but candidates are university-wide public students
-- plus the actor's private accepted friends. Selection never discloses target consent;
-- the mutation/trigger rechecks actual authorization atomically at submission.
create or replace function public.group_friend_candidates(p_group_id uuid default null,p_search text default '',p_before_name text default null,p_before_id uuid default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if auth.uid() is null or not private.is_eligible() then raise exception 'Group unavailable' using errcode='42501'; end if;
 if p_group_id is not null and not private.group_can_add(p_group_id,auth.uid()) then raise exception 'Group unavailable' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 or p_search is null or char_length(p_search)>100 or (p_before_name is null)<>(p_before_id is null) then raise exception 'Invalid page' using errcode='22023'; end if;
 if p_before_id is not null and not private.student_visible(auth.uid(),p_before_id,true) then raise exception 'Invalid page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x.row order by x.name,x.id),'[]'::jsonb) into result from (
  select p.name,p.id,jsonb_build_object('student_id',p.id,'name',p.name,'major',p.major,
  'can_add',true,'reason',null) row
  from public.profiles p where private.student_visible(auth.uid(),p.id,true)
  and position(lower(btrim(p_search)) in lower(p.name))>0
  and (p_group_id is null or not exists(select 1 from public.group_members where group_id=p_group_id and user_id=p.id))
  and (p_before_id is null or (p.name,p.id)>(p_before_name,p_before_id))
  order by p.name,p.id limit p_limit
 ) x; return result;
end; $$;

-- One core mutator; old wrappers remain callable and default creation to All Members.
create function private.group_membership_mutate(p_group uuid,p_members uuid[],p_name text,p_request uuid,p_permission text) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); ids uuid[]; student uuid; payload jsonb; receipt private.group_mutation_receipts;
 g public.group_conversations; clean_name text:=nullif(btrim(p_name),''); is_open boolean;
begin
 if caller is null or not private.is_eligible() then raise exception 'Group unavailable' using errcode='42501'; end if;
 if p_request is null or p_members is null or cardinality(p_members) not between (case when p_group is null then 2 else 1 end) and 49
 or array_position(p_members,null) is not null or caller=any(p_members) or char_length(clean_name)>80 then raise exception 'Invalid group request' using errcode='22023'; end if;
 if p_group is null and (p_permission is null or p_permission not in('all_members','creator_only')) then raise exception 'Invalid membership permission' using errcode='22023'; end if;
 select array_agg(x order by x) into ids from (select distinct unnest(p_members) x)s;
 if cardinality(ids)<>cardinality(p_members) then raise exception 'Duplicate students' using errcode='22023'; end if;
 payload:=jsonb_build_object('group_id',p_group,'members',to_jsonb(ids),'name',clean_name);
 if p_group is null and p_permission='creator_only' then payload:=payload||jsonb_build_object('addition_permission',p_permission); end if;
 perform pg_advisory_xact_lock(hashtextextended('group-mutation:'||caller::text||p_request::text,0));
 select * into receipt from private.group_mutation_receipts where user_id=caller and request_id=p_request;
 if found then
  if receipt.payload<>payload then raise exception 'Request identifier already used' using errcode='23505'; end if;
  return receipt.group_id; -- no admission is repeated; wrapper still rechecks current detail access
 end if;
 if p_group is not null then
  select * into g from public.group_conversations where id=p_group for update;
  if not private.group_can_add(p_group,caller) then raise exception 'This student could not be added to the group chat' using errcode='42501'; end if;
  if (select count(*) from public.group_members where group_id=g.id)+cardinality(ids)>50 then raise exception 'Group limit is 50' using errcode='22023'; end if;
  if exists(select 1 from public.group_members where group_id=g.id and user_id=any(ids)) then raise exception 'Invalid group request' using errcode='22023'; end if;
 end if;
 -- Group row -> canonical actor/target pairs -> target profiles in UUID order.
 foreach student in array ids loop perform private.student_pair_lock(caller,student); end loop;
 foreach student in array ids loop
  select allow_group_additions into is_open from public.profiles where id=student for update;
  if is_open is distinct from true or not private.student_visible(caller,student,true) then
   raise exception 'This student could not be added to the group chat' using errcode='42501';
  end if;
 end loop;
 if p_group is null then
  insert into public.group_conversations(creator_id,name,addition_permission) values(caller,clean_name,p_permission) returning * into g;
  insert into public.group_members(group_id,user_id,joined_after_sequence,last_read_sequence) values(g.id,caller,0,0);
 end if;
 insert into public.group_members(group_id,user_id,joined_after_sequence,last_read_sequence)
 select g.id,x,g.last_sequence,g.last_sequence from unnest(ids)x;
 update public.group_conversations set metadata_revision=metadata_revision+1 where id=g.id;
 insert into private.group_mutation_receipts values(caller,p_request,payload,g.id);
 return g.id;
end; $$;
revoke all on function private.group_membership_mutate(uuid,uuid[],text,uuid,text) from public,anon,authenticated,service_role;
create or replace function private.group_mutate(p_group uuid,p_members uuid[],p_name text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin return private.group_membership_mutate(p_group,p_members,p_name,p_request,'all_members'); end; $$;

create function public.group_create_configured(p_members uuid[],p_request_id uuid,p_name text,p_addition_permission text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare id uuid; begin
 id:=private.group_membership_mutate(null,p_members,p_name,p_request_id,p_addition_permission);
 return public.group_detail(id);
end; $$;

create function public.group_set_addition_permission(p_group_id uuid,p_permission text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); g public.group_conversations; receipt private.group_mutation_receipts;
 payload jsonb:=jsonb_build_object('operation','permission','group_id',p_group_id,'permission',p_permission);
begin
 if caller is null or not private.is_eligible() then raise exception 'Group unavailable' using errcode='42501'; end if;
 if p_request_id is null or p_permission is null or p_permission not in('all_members','creator_only') then raise exception 'Invalid group request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('group-mutation:'||caller::text||p_request_id::text,0));
 select * into receipt from private.group_mutation_receipts where user_id=caller and request_id=p_request_id;
 if found then
  if receipt.payload<>payload then raise exception 'Request identifier already used' using errcode='23505'; end if;
  return public.group_detail(receipt.group_id);
 end if;
 if private.group_floor(p_group_id) is null then raise exception 'Group unavailable' using errcode='42501'; end if;
 select * into g from public.group_conversations where id=p_group_id for update;
 if private.group_floor(p_group_id) is null or g.creator_id is distinct from caller or g.creator_departed then raise exception 'Group unavailable' using errcode='42501'; end if;
 update public.group_conversations set addition_permission=p_permission,metadata_revision=metadata_revision+1 where id=p_group_id;
 insert into private.group_mutation_receipts values(caller,p_request_id,payload,p_group_id);
 return public.group_detail(p_group_id);
end; $$;

create function public.group_leave(p_group_id uuid,p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); g public.group_conversations; receipt private.group_mutation_receipts;
 payload jsonb:=jsonb_build_object('operation','leave','group_id',p_group_id);
begin
 if caller is null or not private.is_eligible() then raise exception 'Group unavailable' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Invalid group request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('group-mutation:'||caller::text||p_request_id::text,0));
 select * into receipt from private.group_mutation_receipts where user_id=caller and request_id=p_request_id;
 if found then
  if receipt.payload<>payload then raise exception 'Request identifier already used' using errcode='23505'; end if;
  return;
 end if;
 if private.group_floor(p_group_id) is null then return; end if;
 select * into g from public.group_conversations where id=p_group_id for update;
 if private.group_floor(p_group_id) is null then return; end if;
 if g.creator_id=caller and not g.creator_departed then
  update public.group_conversations set creator_departed=true,addition_permission='all_members' where id=p_group_id;
 end if;
 delete from public.group_members where group_id=p_group_id and user_id=caller;
 update public.group_conversations set metadata_revision=metadata_revision+1 where id=p_group_id;
 insert into private.group_mutation_receipts values(caller,p_request_id,payload,p_group_id);
end; $$;

-- Retire peer removal even through retained legacy signatures.
create or replace function public.group_remove_member(p_group_id uuid,p_member_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin raise exception 'Group unavailable' using errcode='42501'; end; $$;
revoke all on function public.group_remove_member(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.group_admission_block_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); g public.group_conversations; is_open boolean;
begin
 select * into g from public.group_conversations where id=new.group_id for update;
 if caller is null or not private.is_eligible() or g.id is null then raise exception 'This student could not be added to the group chat' using errcode='42501'; end if;
 if new.user_id=caller and g.creator_id=caller and not g.creator_departed and g.last_sequence=0
 and not exists(select 1 from public.group_members where group_id=g.id) then
  new.joined_after_sequence:=0; new.last_read_sequence:=0; return new;
 end if;
 if not private.group_can_add(g.id,caller) or (select count(*) from public.group_members where group_id=g.id)>=50 then raise exception 'This student could not be added to the group chat' using errcode='42501'; end if;
 perform private.student_pair_lock(caller,new.user_id);
 select allow_group_additions into is_open from public.profiles where id=new.user_id for update;
 if is_open is distinct from true or not private.student_visible(caller,new.user_id,true) then raise exception 'This student could not be added to the group chat' using errcode='42501'; end if;
 new.joined_after_sequence:=g.last_sequence; new.last_read_sequence:=g.last_sequence;
 return new;
end; $$;

create or replace function public.group_send_message(p_group_id uuid,p_body text,p_client_message_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); g public.group_conversations; m public.group_messages; whitespace text;
begin
 if private.group_floor(p_group_id) is null then raise exception 'Group unavailable' using errcode='42501'; end if;
 whitespace:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
 if p_client_message_id is null or p_body is null or char_length(p_body)>2000 or translate(p_body,whitespace,'')='' then raise exception 'Text must contain 1 to 2000 characters' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('group-send:'||caller::text||p_client_message_id::text,0));
 select * into g from public.group_conversations where id=p_group_id for update;
 if private.group_floor(p_group_id) is null then raise exception 'Group unavailable' using errcode='42501'; end if;
 select * into m from public.group_messages where sender_id=caller and client_message_id=p_client_message_id;
 if found then
  if m.group_id<>p_group_id or m.body<>p_body then raise exception 'Request identifier already used' using errcode='23505'; end if;
  if m.sequence<=private.group_floor(p_group_id) then raise exception 'Group unavailable' using errcode='42501'; end if;
  return private.group_message_json(m);
 end if;
 insert into public.group_messages(group_id,sequence,sender_id,client_message_id,body) values(g.id,g.last_sequence+1,caller,p_client_message_id,p_body) returning * into m;
 update public.group_conversations set last_sequence=m.sequence,last_message_at=m.created_at where id=g.id;
 return private.group_message_json(m);
end; $$;

-- New sends and privileged insertions share membership/count checks under the group row lock.
create function private.group_send_guard() returns trigger
language plpgsql security definer set search_path='' as $$ declare g public.group_conversations; begin
 select * into g from public.group_conversations where id=new.group_id for update;
 if g.id is null or new.sender_id is null or not private.dm_eligible(new.sender_id)
 or (auth.uid() is not null and auth.uid()<>new.sender_id)
 or not exists(select 1 from public.group_members where group_id=g.id and user_id=new.sender_id)
 or (select count(*) from public.group_members where group_id=g.id and private.dm_eligible(user_id))<3 then
  raise exception 'Sending is unavailable in this group' using errcode='42501';
 end if;
 return new;
end; $$;
revoke all on function private.group_send_guard() from public,anon,authenticated,service_role;
create trigger group_send_guard before insert on public.group_messages for each row execute function private.group_send_guard();

revoke all on function public.group_create_configured(uuid[],uuid,text,text),public.group_set_addition_permission(uuid,text,uuid),public.group_leave(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.group_create_configured(uuid[],uuid,text,text),public.group_set_addition_permission(uuid,text,uuid),public.group_leave(uuid,uuid) to authenticated;
do $$ declare signature text; begin
 foreach signature in array array['public.group_create_configured(uuid[],uuid,text,text)','public.group_set_addition_permission(uuid,text,uuid)','public.group_leave(uuid,uuid)'] loop
  if has_function_privilege('anon',signature,'execute') or has_function_privilege('service_role',signature,'execute') or not has_function_privilege('authenticated',signature,'execute') then raise exception 'Unsafe group RPC privileges: %',signature; end if;
 end loop;
 foreach signature in array array['private.group_can_add(uuid,uuid)','private.group_membership_mutate(uuid,uuid[],text,uuid,text)','private.group_send_guard()'] loop
  if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute') or has_function_privilege('service_role',signature,'execute') then raise exception 'Unsafe group helper privileges: %',signature; end if;
 end loop;
 if has_function_privilege('authenticated','public.group_remove_member(uuid,uuid)','execute') or has_function_privilege('service_role','public.group_remove_member(uuid,uuid)','execute') then raise exception 'Unsafe legacy removal privileges'; end if;
end; $$;
commit;
