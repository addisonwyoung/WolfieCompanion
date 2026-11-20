-- Stage 2B. Owner-reviewed, whole-file manual SQL Editor execution AFTER Stage 1/2A.
-- Never replay older migrations. Canonical settings and all historical data are retained.
begin;
set local lock_timeout = '5s';

do $$
declare signature text; mismatches bigint;
begin
 foreach signature in array array[
  'private.students_blocked(uuid,uuid)','private.student_pair_lock(uuid,uuid)',
  'private.student_friend(uuid,uuid)','private.is_current_course_professor_member(uuid,text,text,text,text)',
  'public.block_student(uuid)','public.unblock_student(uuid)',
  'public.dm_send_message(uuid,text,uuid,text)','public.dm_contact_state(uuid,text)',
  'private.group_mutate(uuid,uuid[],text,uuid)',
  'public.group_friend_candidates(uuid,text,text,uuid,integer)'
 ] loop
  if to_regprocedure(signature) is null then raise exception 'Verified Stage 1/2A prerequisite missing: %',signature; end if;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('dm_send_message','dm_contact_state')
  and p.oid not in ('public.dm_send_message(uuid,text,uuid,text)'::regprocedure,'public.dm_contact_state(uuid,text)'::regprocedure)) then
  raise exception 'Unexpected DM overload; re-audit before deployment';
 end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.dm_messages'::regclass and tgname='dm_block_guard' and tgenabled='O') then
  raise exception 'Enabled Stage 2A DM block guard required';
 end if;
 if exists(select 1 from public.profiles where dm_permission is null or dm_permission not in ('eligible_students','friends_only','no_one') or allow_group_additions is null) then
  raise exception 'Valid canonical Stage 1 settings required';
 end if;
 select count(*) into mismatches from public.profiles
 where dm_permission<>case when allow_new_dms then 'eligible_students' else 'no_one' end;
 raise notice 'Legacy/canonical setting differences: %. Canonical values preserved; no settings backfill performed.',mismatches;
 if exists(select 1 from unnest(array['anon','authenticated']) role_name where
  has_any_column_privilege(role_name,'public.dm_messages','INSERT,UPDATE') or
  has_table_privilege(role_name,'public.dm_messages','DELETE') or
  has_any_column_privilege(role_name,'public.dm_conversations','INSERT,UPDATE') or
  has_table_privilege(role_name,'public.dm_conversations','DELETE')) then
  raise exception 'Unexpected direct client DM write privileges';
 end if;
end; $$;

-- Match enrollment/discovery's supported two-to-five-letter subjects and optional suffix.
create or replace function private.dm_code(code text) returns text
language plpgsql immutable set search_path='' as $$
begin
 if code is null then return null; end if;
 if upper(btrim(code)) !~ '^[A-Z]{2,5}\s*[0-9]{3}[A-Z]?$' then raise exception 'Invalid course' using errcode='22023'; end if;
 return regexp_replace(upper(btrim(code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
end; $$;
revoke all on function private.dm_code(text) from public,anon,authenticated,service_role;

-- Preserve the column for composite-return compatibility, but never accept old setting writes.
-- UPDATE OF also rejects an old client's same-value assignment, rather than silently ignoring it.
create function private.reject_legacy_dm_setting() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'Refresh the application and save Direct messaging preferences instead.' using errcode='PDM01';
end; $$;
revoke all on function private.reject_legacy_dm_setting() from public,anon,authenticated,service_role;
create trigger reject_legacy_dm_setting before update of allow_new_dms on public.profiles
for each row execute function private.reject_legacy_dm_setting();

-- Database-derived offering match: a UUID/course hint cannot supply section/professor authority.
-- Do not tighten the legacy academic helper: Study Buddies keep their separate section rules.
create function private.dm_verified_classmates(a uuid,b uuid,code text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.course_enrollments e
 where e.user_id=a and (code is null or e.course_code||' '||e.course_number=code)
 and private.is_current_course_professor_member(a,e.course_code||' '||e.course_number,e.section,e.professor_first_name,e.professor_last_name)
 and private.is_current_course_professor_member(b,e.course_code||' '||e.course_number,e.section,e.professor_first_name,e.professor_last_name));
$$;

-- A real established thread is a basis, not a way to bypass preferences or blocks.
-- A private recipient's own pending request is intentional disclosure to this caller only.
create or replace function private.dm_contact(caller uuid,peer uuid,code text) returns boolean
language sql stable security definer set search_path='' as $$
 select caller is not null and peer is not null and caller<>peer
 and private.dm_eligible(caller) and private.dm_eligible(peer)
 and not private.students_blocked(caller,peer)
 and exists(select 1 from public.profiles p where p.id=peer and (
  exists(select 1 from public.dm_conversations c where c.user_low=least(caller,peer) and c.user_high=greatest(caller,peer) and c.last_sequence>0)
  or private.student_friend(caller,peer)
  or (p.is_private and exists(select 1 from public.friend_requests r where r.sender_id=peer and r.recipient_id=caller and r.status='pending'))
  or (not p.is_private and (
   exists(select 1 from public.friend_requests r where r.status='pending' and least(r.sender_id,r.recipient_id)=least(caller,peer) and greatest(r.sender_id,r.recipient_id)=greatest(caller,peer))
   or private.dm_verified_classmates(caller,peer,code)))));
$$;

create function private.dm_send_reason(caller uuid,peer uuid,code text) returns text
language plpgsql stable security definer set search_path='' as $$
declare own_permission text; peer_permission text; friends boolean;
begin
 if not coalesce(private.dm_contact(caller,peer,code),false) then return 'unavailable'; end if;
 select dm_permission into own_permission from public.profiles where id=caller;
 select dm_permission into peer_permission from public.profiles where id=peer;
 friends:=private.student_friend(caller,peer);
 if own_permission='no_one' then return 'own_closed'; end if;
 if own_permission='friends_only' and not friends then return 'friendship_required'; end if;
 -- Peer restrictions deliberately share a generic reason; never disclose their settings/block direction.
 if peer_permission='no_one' or (peer_permission='friends_only' and not friends) then return 'closed'; end if;
 if own_permission is null or peer_permission is null then return 'unavailable'; end if;
 return null;
end; $$;
revoke all on function private.dm_verified_classmates(uuid,uuid,text),private.dm_contact(uuid,uuid,text),private.dm_send_reason(uuid,uuid,text)
from public,anon,authenticated,service_role;

create or replace function public.dm_contact_state(p_student_id uuid,p_course_code text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=auth.uid(); c public.dm_conversations; reason text; code text:=private.dm_code(p_course_code); student_name text;
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_student_id is null or p_student_id=caller then return null; end if;
 select * into c from public.dm_conversations where user_low=least(caller,p_student_id) and user_high=greatest(caller,p_student_id);
 if c.id is null and not coalesce(private.dm_contact(caller,p_student_id,code),false) then return null; end if;
 reason:=private.dm_send_reason(caller,p_student_id,code);
 select case when private.dm_eligible(p_student_id) and not private.students_blocked(caller,p_student_id) then name else 'Unavailable student' end
 into student_name from public.profiles where id=p_student_id;
 return jsonb_build_object('student_id',p_student_id,'name',coalesce(student_name,'Unavailable student'),
 'conversation_id',c.id,'can_send',reason is null,'reason',reason);
end; $$;

create or replace function public.dm_send_message(p_student_id uuid,p_body text,p_client_message_id uuid,p_course_code text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); c public.dm_conversations; m public.dm_messages; code text:=private.dm_code(p_course_code); whitespace text;
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_student_id is null or caller=p_student_id or p_client_message_id is null then raise exception 'Invalid recipient or request' using errcode='22023'; end if;
 whitespace:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
 if p_body is null or char_length(p_body)>2000 or translate(p_body,whitespace,'')='' then raise exception 'Text must contain 1 to 2000 characters' using errcode='22023'; end if;
 perform private.student_pair_lock(caller,p_student_id);
 select * into m from public.dm_messages where sender_id=caller and client_message_id=p_client_message_id;
 if found then
  select * into c from public.dm_conversations where id=m.conversation_id;
  if p_student_id not in(c.user_low,c.user_high) or m.body<>p_body then raise exception 'Request identifier already used' using errcode='23505'; end if;
  return to_jsonb(m);
 end if;
 -- Pair -> profile rows in UUID order -> conversation. Direct owner UPDATEs
 -- serialize on these profile rows; never acquire pair locks from a profile trigger.
 perform 1 from public.profiles where id in(caller,p_student_id) order by id for update;
 if private.dm_send_reason(caller,p_student_id,code) is not null then raise exception 'Messaging is unavailable for this contact' using errcode='42501'; end if;
 select * into c from public.dm_conversations where user_low=least(caller,p_student_id) and user_high=greatest(caller,p_student_id) for update;
 if c.id is null then
  insert into public.dm_conversations(user_low,user_high) values(least(caller,p_student_id),greatest(caller,p_student_id)) returning * into c;
 end if;
 insert into public.dm_messages(conversation_id,sequence,sender_id,client_message_id,body)
 values(c.id,c.last_sequence+1,caller,p_client_message_id,p_body) returning * into m;
 update public.dm_conversations set last_sequence=m.sequence,last_message_at=m.created_at where id=c.id;
 return to_jsonb(m);
end; $$;

-- Retain the installed Stage 2A trigger and expand it to the same common rule.
-- No client INSERT grants are added. Even a privileged backend insertion must pass consent.
create or replace function private.dm_block_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.dm_conversations; peer uuid;
begin
 select * into c from public.dm_conversations where id=new.conversation_id;
 if c.id is null or new.sender_id not in(c.user_low,c.user_high) or new.sender_id is null then raise exception 'Contact unavailable' using errcode='42501'; end if;
 if auth.uid() is not null and auth.uid()<>new.sender_id then raise exception 'Contact unavailable' using errcode='42501'; end if;
 peer:=case when new.sender_id=c.user_low then c.user_high else c.user_low end;
 perform private.student_pair_lock(new.sender_id,peer);
 perform 1 from public.profiles where id in(new.sender_id,peer) order by id for update;
 if private.dm_send_reason(new.sender_id,peer,null) is not null then raise exception 'Contact unavailable' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function private.dm_block_guard() from public,anon,authenticated,service_role;

create or replace function public.unfriend(p_student_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();
begin
 if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
 if p_student_id is null or p_student_id=caller then raise exception 'Invalid friend' using errcode='22023'; end if;
 perform private.student_pair_lock(caller,p_student_id);
 delete from public.friendships where user_id=least(caller,p_student_id) and friend_id=greatest(caller,p_student_id);
end; $$;
revoke all on function public.dm_send_message(uuid,text,uuid,text),public.dm_contact_state(uuid,text),public.unfriend(uuid) from public,anon,authenticated;
grant execute on function public.dm_send_message(uuid,text,uuid,text),public.dm_contact_state(uuid,text),public.unfriend(uuid) to authenticated;

-- Group consent cutover follows below. Creator/friend rules and membership mechanics stay unchanged.

CREATE OR REPLACE FUNCTION private.group_mutate(p_group uuid, p_members uuid[], p_name text, p_request uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); ids uuid[]; student uuid; payload jsonb; receipt private.group_mutation_receipts; g public.group_conversations; clean_name text:=nullif(btrim(p_name),''); is_open boolean; pair record;
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_request is null or p_members is null or cardinality(p_members) not between (case when p_group is null then 2 else 1 end) and 49 or array_position(p_members,null) is not null or caller=any(p_members) or char_length(clean_name)>80 then raise exception 'Invalid group members or name' using errcode='22023'; end if;
 select array_agg(x order by x) into ids from (select distinct unnest(p_members) x)s;
 if cardinality(ids)<>cardinality(p_members) then raise exception 'Duplicate members' using errcode='22023'; end if;
 payload:=jsonb_build_object('group_id',p_group,'members',to_jsonb(ids),'name',clean_name);
 perform pg_advisory_xact_lock(hashtextextended('group-mutation:'||caller::text||p_request::text,0));
 select * into receipt from private.group_mutation_receipts where user_id=caller and request_id=p_request;
 if found then
  if receipt.payload<>payload then raise exception 'Request identifier already used' using errcode='23505'; end if;
  return receipt.group_id;
 end if;
 if p_group is not null then
  select * into g from public.group_conversations where id=p_group for update;
  if g.creator_id is distinct from caller then raise exception 'Creator required' using errcode='42501'; end if;
  if (select count(*) from public.group_members where group_id=g.id)+cardinality(ids)>50 then raise exception 'Group limit is 50' using errcode='22023'; end if;
  if exists(select 1 from public.group_members where group_id=g.id and user_id=any(ids)) then raise exception 'Already a member' using errcode='22023'; end if;
 end if;
 -- Acquire pair locks before existing friendship key-share locks to match block ordering.
 for pair in
  with members as (
   select unnest(ids||array[caller]) id
   union select user_id from public.group_members where group_id=p_group
  ) select a.id low,b.id high from members a join members b on a.id<b.id order by a.id,b.id
 loop
  perform private.student_pair_lock(pair.low,pair.high);
 end loop;
 foreach student in array ids loop
  select allow_group_additions into is_open from public.profiles where id=student for update;
  if not found or not private.dm_eligible(student) then raise exception 'Friend unavailable' using errcode='42501'; end if;
  perform 1 from public.friendships where user_id=least(caller,student) and friend_id=greatest(caller,student) for key share;
  if not found then raise exception 'Accepted friend required' using errcode='42501'; end if;
  if not is_open then raise exception 'Group additions are closed for a selected friend' using errcode='P0001'; end if;
 end loop;
 if p_group is null then
  insert into public.group_conversations(creator_id,name) values(caller,clean_name) returning * into g;
  insert into public.group_members(group_id,user_id,joined_after_sequence,last_read_sequence) values(g.id,caller,0,0);
 end if;
 insert into public.group_members(group_id,user_id,joined_after_sequence,last_read_sequence) select g.id,x,g.last_sequence,g.last_sequence from unnest(ids)x;
 update public.group_conversations set metadata_revision=metadata_revision+1 where id=g.id;
 insert into private.group_mutation_receipts values(caller,p_request,payload,g.id);
 return g.id;
end; $function$;

CREATE OR REPLACE FUNCTION public.group_friend_candidates(p_group_id uuid DEFAULT NULL::uuid, p_search text DEFAULT ''::text, p_before_name text DEFAULT NULL::text, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if auth.uid() is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_group_id is not null and not exists(select 1 from public.group_conversations where id=p_group_id and creator_id=auth.uid()) then raise exception 'Creator required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 or p_search is null or char_length(p_search)>100 or (p_before_name is null)<>(p_before_id is null) then raise exception 'Invalid page' using errcode='22023'; end if;
 if p_before_id is not null and not exists(select 1 from public.friendships where user_id=least(auth.uid(),p_before_id) and friend_id=greatest(auth.uid(),p_before_id)) then raise exception 'Invalid page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x.row order by x.name,x.id),'[]'::jsonb) into result from (
 select p.name,p.id,jsonb_build_object('student_id',p.id,'name',p.name,'major',p.major,
 'can_add',private.dm_eligible(p.id) and p.allow_group_additions,'reason',case when not private.dm_eligible(p.id) then 'unavailable' when not p.allow_group_additions then 'closed' else null end) row
 from public.friendships f join public.profiles p on p.id=case when f.user_id=auth.uid() then f.friend_id else f.user_id end
 where auth.uid() in(f.user_id,f.friend_id) and position(lower(btrim(p_search)) in lower(p.name))>0
 and (p_group_id is null or not exists(select 1 from public.group_members where group_id=p_group_id and user_id=p.id))
 and (p_before_id is null or (p.name,p.id)>(p_before_name,p_before_id)) order by p.name,p.id limit p_limit)x;
 return result;
end; $function$
;

-- Effective permissions must remain narrow, including inherited grants.
do $$
declare signature text;
begin
 foreach signature in array array['public.dm_contact_state(uuid,text)','public.dm_send_message(uuid,text,uuid,text)','public.unfriend(uuid)'] loop
  if has_function_privilege('anon',signature,'execute') or not has_function_privilege('authenticated',signature,'execute') then
   raise exception 'Unsafe DM RPC permissions: %',signature;
  end if;
 end loop;
 foreach signature in array array['private.dm_contact(uuid,uuid,text)','private.dm_send_reason(uuid,uuid,text)','private.dm_verified_classmates(uuid,uuid,text)'] loop
  if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute') then
   raise exception 'Unsafe DM helper permissions: %',signature;
  end if;
 end loop;
end; $$;
commit;
