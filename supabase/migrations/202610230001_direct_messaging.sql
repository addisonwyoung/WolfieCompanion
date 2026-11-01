-- Owner-reviewed manual deployment only. Requires accounts, profile visibility and friendships.
begin;
alter table public.profiles add column if not exists allow_new_dms boolean not null default true;
create table if not exists public.dm_conversations (
 id uuid primary key default gen_random_uuid(),
 user_low uuid not null references auth.users(id) on delete cascade,
 user_high uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 last_message_at timestamptz not null default clock_timestamp(),
 last_sequence bigint not null default 0 check(last_sequence>=0),
 check(user_low<user_high), unique(user_low,user_high)
);
create table if not exists public.dm_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
 sequence bigint not null check(sequence>0),
 sender_id uuid not null references auth.users(id) on delete cascade,
 client_message_id uuid not null,
 body text not null check(char_length(body) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp(),
 unique(sender_id,client_message_id), unique(conversation_id,sequence)
);
create index if not exists dm_low_activity on public.dm_conversations(user_low,last_message_at desc,id desc);
create index if not exists dm_high_activity on public.dm_conversations(user_high,last_message_at desc,id desc);
create index if not exists dm_history_sequence on public.dm_messages(conversation_id,sequence desc);

create or replace function private.dm_eligible(student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join auth.identities i on i.user_id=u.id
 where u.id=student and u.email_confirmed_at is not null and lower(split_part(u.email,'@',2))='stonybrook.edu'
 and u.email ~ '^[^@]+@[^@]+$' and i.provider='google' and i.identity_data->>'email_verified'='true'
 and lower(i.identity_data->>'email')=lower(u.email));
$$;
create or replace function private.dm_code(code text) returns text
language plpgsql immutable set search_path='' as $$
begin
 if code is null then return null; end if;
 if upper(btrim(code)) !~ '^[A-Z]{2,4}\s*[0-9]{3}$' then raise exception 'Invalid course' using errcode='22023'; end if;
 return regexp_replace(upper(btrim(code)),'^([A-Z]{2,4})\s*([0-9]{3})$','\1 \2');
end; $$;
create or replace function private.dm_contact(caller uuid,peer uuid,code text) returns boolean
language sql stable security definer set search_path='' as $$
 select caller<>peer and private.dm_eligible(caller) and private.dm_eligible(peer) and (
 exists(select 1 from public.friendships where user_id=least(caller,peer) and friend_id=greatest(caller,peer))
 or exists(select 1 from public.friend_requests where status='pending' and sender_id in(caller,peer) and recipient_id in(caller,peer))
 or coalesce(private.can_view_classmate(caller,peer,code),false));
$$;
revoke all on function private.dm_eligible(uuid),private.dm_code(text),private.dm_contact(uuid,uuid,text) from public,anon,authenticated;

alter table public.dm_conversations enable row level security;
alter table public.dm_messages enable row level security;
create policy dm_participant_read on public.dm_conversations for select to authenticated
 using ((select auth.uid()) in(user_low,user_high) and (select private.is_eligible()));
create policy dm_message_read on public.dm_messages for select to authenticated
 using ((select private.is_eligible()) and exists(select 1 from public.dm_conversations c where c.id=conversation_id and (select auth.uid()) in(c.user_low,c.user_high)));
revoke all on public.dm_conversations,public.dm_messages from anon,authenticated;
grant select on public.dm_conversations,public.dm_messages to authenticated;

create or replace function public.dm_contact_state(p_student_id uuid,p_course_code text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=auth.uid(); c public.dm_conversations; p public.profiles; eligible boolean; code text:=private.dm_code(p_course_code);
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_student_id is null or p_student_id=caller then return null; end if;
 select * into c from public.dm_conversations where user_low=least(caller,p_student_id) and user_high=greatest(caller,p_student_id);
 if c.id is null and not private.dm_contact(caller,p_student_id,code) then return null; end if;
 select * into p from public.profiles where id=p_student_id;
 eligible:=private.dm_eligible(p_student_id);
 return jsonb_build_object('student_id',p_student_id,'name',case when eligible then p.name else 'Unavailable student' end,
 'conversation_id',c.id,'can_send',eligible and (c.id is not null or p.allow_new_dms),
 'reason',case when not eligible then 'unavailable' when c.id is null and not p.allow_new_dms then 'closed' else null end);
end; $$;

create or replace function public.dm_send_message(p_student_id uuid,p_body text,p_client_message_id uuid,p_course_code text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); c public.dm_conversations; m public.dm_messages; open boolean; code text:=private.dm_code(p_course_code); whitespace text;
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_student_id is null or caller=p_student_id or p_client_message_id is null then raise exception 'Invalid recipient or request' using errcode='22023'; end if;
 -- Explicit ECMAScript whitespace set, matching the client, including Unicode spaces.
 whitespace:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
 if p_body is null or char_length(p_body)>2000 or translate(p_body,whitespace,'')='' then raise exception 'Text must contain 1 to 2000 characters' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(least(caller,p_student_id)::text||greatest(caller,p_student_id)::text,0));
 select * into m from public.dm_messages where sender_id=caller and client_message_id=p_client_message_id;
 if found then
  select * into c from public.dm_conversations where id=m.conversation_id;
  if p_student_id not in(c.user_low,c.user_high) or m.body<>p_body then raise exception 'Request identifier already used' using errcode='23505'; end if;
  return to_jsonb(m);
 end if;
 if not private.dm_eligible(p_student_id) then raise exception 'Contact unavailable' using errcode='42501'; end if;
 select * into c from public.dm_conversations where user_low=least(caller,p_student_id) and user_high=greatest(caller,p_student_id) for update;
 if c.id is null then
  if not private.dm_contact(caller,p_student_id,code) then raise exception 'Contact unavailable' using errcode='42501'; end if;
  select allow_new_dms into open from public.profiles where id=p_student_id for update;
  if open is distinct from true then raise exception 'New direct messages are closed' using errcode='P0001'; end if;
  insert into public.dm_conversations(user_low,user_high) values(least(caller,p_student_id),greatest(caller,p_student_id)) returning * into c;
 end if;
 insert into public.dm_messages(conversation_id,sequence,sender_id,client_message_id,body)
 values(c.id,c.last_sequence+1,caller,p_client_message_id,p_body) returning * into m;
 update public.dm_conversations set last_sequence=m.sequence,last_message_at=m.created_at where id=c.id;
 return to_jsonb(m);
end; $$;

create or replace function public.dm_inbox(p_before_activity timestamptz default null,p_before_id uuid default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=auth.uid(); result jsonb;
begin
 if caller is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 or (p_before_activity is null)<>(p_before_id is null) then raise exception 'Invalid page' using errcode='22023'; end if;
 if p_before_id is not null and not exists(select 1 from public.dm_conversations where id=p_before_id and caller in(user_low,user_high)) then raise exception 'Invalid page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x.row order by x.activity desc,x.id desc),'[]'::jsonb) into result from (
  select c.id,c.last_message_at activity,jsonb_build_object('conversation_id',c.id,'student_id',p.id,
  'name',case when private.dm_eligible(p.id) then p.name else 'Unavailable student' end,
  'last_message_at',c.last_message_at,'preview',left(m.body,120)) row
  from public.dm_conversations c join public.profiles p on p.id=case when c.user_low=caller then c.user_high else c.user_low end
  join public.dm_messages m on m.conversation_id=c.id and m.sequence=c.last_sequence
  where caller in(c.user_low,c.user_high) and (p_before_activity is null or (c.last_message_at,c.id)<(p_before_activity,p_before_id))
  order by c.last_message_at desc,c.id desc limit p_limit
 ) x;
 return result;
end; $$;
create or replace function public.dm_history(p_conversation_id uuid,p_before_sequence bigint default null,p_after_sequence bigint default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if not exists(select 1 from public.dm_conversations where id=p_conversation_id and auth.uid() in(user_low,user_high)) then raise exception 'Conversation unavailable' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 or (p_before_sequence is not null and p_after_sequence is not null) or p_before_sequence<=0 or p_after_sequence<0 then raise exception 'Invalid page' using errcode='22023'; end if;
 if p_before_sequence is not null and not exists(select 1 from public.dm_messages where conversation_id=p_conversation_id and sequence=p_before_sequence) then raise exception 'Invalid page' using errcode='22023'; end if;
 if p_after_sequence is not null and p_after_sequence<>0 and not exists(select 1 from public.dm_messages where conversation_id=p_conversation_id and sequence=p_after_sequence) then raise exception 'Invalid page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.sequence),'[]'::jsonb) into result from (
  select * from public.dm_messages where conversation_id=p_conversation_id
  and (p_before_sequence is null or sequence<p_before_sequence) and (p_after_sequence is null or sequence>p_after_sequence)
  order by case when p_after_sequence is not null then sequence end asc,sequence desc limit p_limit
 ) x;
 return result;
end; $$;
revoke all on function public.dm_contact_state(uuid,text),public.dm_send_message(uuid,text,uuid,text),public.dm_inbox(timestamptz,uuid,integer),public.dm_history(uuid,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.dm_contact_state(uuid,text),public.dm_send_message(uuid,text,uuid,text),public.dm_inbox(timestamptz,uuid,integer),public.dm_history(uuid,bigint,bigint,integer) to authenticated;
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['dm_conversations','dm_messages'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
 end if;
end $$;
commit;
