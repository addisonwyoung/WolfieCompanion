-- Owner-reviewed manual deployment only; requires installed DM/unread/friend migrations.
begin;
create table public.group_conversations (
 id uuid primary key default gen_random_uuid(), creator_id uuid references auth.users(id) on delete set null,
 name text check(name is null or (name=btrim(name) and char_length(name) between 1 and 80)),
 created_at timestamptz not null default clock_timestamp(), last_message_at timestamptz not null default clock_timestamp(),
 last_sequence bigint not null default 0 check(last_sequence>=0), metadata_revision bigint not null default 0
);
create table public.group_members (
 group_id uuid not null references public.group_conversations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default clock_timestamp(), joined_after_sequence bigint not null check(joined_after_sequence>=0),
 last_read_sequence bigint not null check(last_read_sequence>=joined_after_sequence), primary key(group_id,user_id)
);
create index group_members_user on public.group_members(user_id,group_id);
create table public.group_messages (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.group_conversations(id) on delete cascade,
 sequence bigint not null check(sequence>0), sender_id uuid references auth.users(id) on delete set null,
 client_message_id uuid not null, body text not null check(char_length(body) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp(), unique(group_id,sequence),unique(sender_id,client_message_id)
);
create index group_history_sequence on public.group_messages(group_id,sequence desc);
create table private.group_mutation_receipts (
 user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null, payload jsonb not null,
 group_id uuid not null references public.group_conversations(id) on delete cascade, primary key(user_id,request_id)
);
revoke all on private.group_mutation_receipts from public,anon,authenticated;

-- Only this caller-derived helper is executable by authenticated policies.
create function private.group_floor(p_group uuid) returns bigint language sql stable security definer set search_path='' as $$
 select joined_after_sequence from public.group_members where group_id=p_group and user_id=auth.uid() and private.is_eligible();
$$;
revoke all on function private.group_floor(uuid) from public,anon,authenticated;
grant execute on function private.group_floor(uuid) to authenticated;
alter table public.group_conversations enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;
create policy group_member_read on public.group_conversations for select to authenticated using(private.group_floor(id) is not null);
create policy group_post_join_read on public.group_messages for select to authenticated using(sequence>private.group_floor(group_id));
revoke all on public.group_conversations,public.group_members,public.group_messages from anon,authenticated;
grant select on public.group_conversations,public.group_messages to authenticated;

create function private.group_name(p_group uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce(g.name,'Group with '||coalesce((select string_agg(x.name,', ' order by x.name,x.user_id) from (
 select m.user_id,case when private.dm_eligible(m.user_id) then p.name else 'Unavailable student' end name
 from public.group_members m join public.profiles p on p.id=m.user_id where m.group_id=g.id order by name,m.user_id limit 2)x),'members'))
 from public.group_conversations g where id=p_group;
$$;
create function public.group_detail(p_group_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare floor bigint; result jsonb;
begin
 floor:=private.group_floor(p_group_id);
 if floor is null then raise exception 'Group unavailable' using errcode='42501'; end if;
 select jsonb_build_object('group_id',g.id,'name',private.group_name(g.id),'creator_id',g.creator_id,
 'joined_after_sequence',floor,'last_read_sequence',v.last_read_sequence,
 'members',(select coalesce(jsonb_agg(jsonb_build_object('student_id',m.user_id,'name',case when private.dm_eligible(m.user_id) then p.name else 'Unavailable student' end) order by m.user_id),'[]'::jsonb)
 from public.group_members m join public.profiles p on p.id=m.user_id where m.group_id=g.id)) into result
 from public.group_conversations g join public.group_members v on v.group_id=g.id and v.user_id=auth.uid() where g.id=p_group_id;
 return result;
end; $$;
create function public.group_friend_candidates(p_group_id uuid default null,p_search text default '',p_before_name text default null,p_before_id uuid default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_group_id is not null and not exists(select 1 from public.group_conversations where id=p_group_id and creator_id=auth.uid()) then raise exception 'Creator required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 or p_search is null or char_length(p_search)>100 or (p_before_name is null)<>(p_before_id is null) then raise exception 'Invalid page' using errcode='22023'; end if;
 if p_before_id is not null and not exists(select 1 from public.friendships where user_id=least(auth.uid(),p_before_id) and friend_id=greatest(auth.uid(),p_before_id)) then raise exception 'Invalid page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x.row order by x.name,x.id),'[]'::jsonb) into result from (
 select p.name,p.id,jsonb_build_object('student_id',p.id,'name',p.name,'major',p.major,
 'can_add',private.dm_eligible(p.id) and p.allow_new_dms,'reason',case when not private.dm_eligible(p.id) then 'unavailable' when not p.allow_new_dms then 'closed' else null end) row
 from public.friendships f join public.profiles p on p.id=case when f.user_id=auth.uid() then f.friend_id else f.user_id end
 where auth.uid() in(f.user_id,f.friend_id) and position(lower(btrim(p_search)) in lower(p.name))>0
 and (p_group_id is null or not exists(select 1 from public.group_members where group_id=p_group_id and user_id=p.id))
 and (p_before_id is null or (p.name,p.id)>(p_before_name,p_before_id)) order by p.name,p.id limit p_limit)x;
 return result;
end; $$;

create function private.group_mutate(p_group uuid,p_members uuid[],p_name text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); ids uuid[]; student uuid; payload jsonb; receipt private.group_mutation_receipts; g public.group_conversations; clean_name text:=nullif(btrim(p_name),''); is_open boolean;
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
 foreach student in array ids loop
  select allow_new_dms into is_open from public.profiles where id=student for update;
  if not found or not private.dm_eligible(student) then raise exception 'Friend unavailable' using errcode='42501'; end if;
  perform 1 from public.friendships where user_id=least(caller,student) and friend_id=greatest(caller,student) for key share;
  if not found then raise exception 'Accepted friend required' using errcode='42501'; end if;
  if not is_open then raise exception 'New messages are closed for a selected friend' using errcode='P0001'; end if;
 end loop;
 if p_group is null then
  insert into public.group_conversations(creator_id,name) values(caller,clean_name) returning * into g;
  insert into public.group_members(group_id,user_id,joined_after_sequence,last_read_sequence) values(g.id,caller,0,0);
 end if;
 insert into public.group_members(group_id,user_id,joined_after_sequence,last_read_sequence) select g.id,x,g.last_sequence,g.last_sequence from unnest(ids)x;
 update public.group_conversations set metadata_revision=metadata_revision+1 where id=g.id;
 insert into private.group_mutation_receipts values(caller,p_request,payload,g.id);
 return g.id;
end; $$;
create function public.group_create(p_members uuid[],p_request_id uuid,p_name text default null) returns jsonb
language plpgsql security definer set search_path='' as $$ declare id uuid; begin id:=private.group_mutate(null,p_members,p_name,p_request_id);return public.group_detail(id);end; $$;
create function public.group_add_members(p_group_id uuid,p_members uuid[],p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare id uuid; begin id:=private.group_mutate(p_group_id,p_members,null,p_request_id);return public.group_detail(id);end; $$;

create function private.group_message_json(m public.group_messages) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(m)||jsonb_build_object('sender_name',case when m.sender_id is not null and private.dm_eligible(m.sender_id) then (select name from public.profiles where id=m.sender_id) else 'Unavailable student' end);
$$;
create function public.group_send_message(p_group_id uuid,p_body text,p_client_message_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); g public.group_conversations; m public.group_messages; whitespace text;
begin
 if private.group_floor(p_group_id) is null then raise exception 'Group unavailable' using errcode='42501'; end if;
 whitespace:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
 if p_client_message_id is null or p_body is null or char_length(p_body)>2000 or translate(p_body,whitespace,'')='' then raise exception 'Text must contain 1 to 2000 characters' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('group-send:'||caller::text||p_client_message_id::text,0));
 select * into g from public.group_conversations where id=p_group_id for update;
 select * into m from public.group_messages where sender_id=caller and client_message_id=p_client_message_id;
 if found then
  if m.group_id<>p_group_id or m.body<>p_body then raise exception 'Request identifier already used' using errcode='23505'; end if;
  return private.group_message_json(m);
 end if;
 insert into public.group_messages(group_id,sequence,sender_id,client_message_id,body) values(g.id,g.last_sequence+1,caller,p_client_message_id,p_body) returning * into m;
 update public.group_conversations set last_sequence=m.sequence,last_message_at=m.created_at where id=g.id;
 return private.group_message_json(m);
end; $$;
create function public.group_history(p_group_id uuid,p_before_sequence bigint default null,p_after_sequence bigint default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare floor bigint:=private.group_floor(p_group_id); result jsonb;
begin
 if floor is null then raise exception 'Group unavailable' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 or (p_before_sequence is not null and p_after_sequence is not null)
 or p_before_sequence<=floor or p_after_sequence<floor then raise exception 'Invalid page' using errcode='22023'; end if;
 if p_before_sequence is not null and not exists(select 1 from public.group_messages where group_id=p_group_id and sequence=p_before_sequence) then raise exception 'Invalid page' using errcode='22023'; end if;
 if p_after_sequence is not null and p_after_sequence<>floor and not exists(select 1 from public.group_messages where group_id=p_group_id and sequence=p_after_sequence) then raise exception 'Invalid page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x.row order by x.sequence),'[]'::jsonb) into result from (
 select m.sequence,private.group_message_json(m) row from public.group_messages m where group_id=p_group_id and sequence>floor
 and (p_before_sequence is null or sequence<p_before_sequence) and (p_after_sequence is null or sequence>p_after_sequence)
 order by case when p_after_sequence is not null then sequence end asc,sequence desc limit p_limit)x;
 return result;
end; $$;
create function public.group_mark_read(p_group_id uuid,p_sequence bigint) returns void language plpgsql security definer set search_path='' as $$
declare floor bigint:=private.group_floor(p_group_id);
begin
 if floor is null then raise exception 'Group unavailable' using errcode='42501'; end if;
 if p_sequence is null or p_sequence<=floor or not exists(select 1 from public.group_messages where group_id=p_group_id and sequence=p_sequence) then raise exception 'Invalid sequence' using errcode='22023'; end if;
 update public.group_members set last_read_sequence=greatest(last_read_sequence,p_sequence) where group_id=p_group_id and user_id=auth.uid();
end; $$;

-- A private projection shared by the combined keyset cursor and page query.
create function private.messaging_rows() returns table(kind text,conversation_id uuid,student_id uuid,name text,member_count bigint,last_message_at timestamptz,message_time timestamptz,preview text)
language sql stable security definer set search_path='' as $$
 select 'direct'::text,c.id,p.id,case when private.dm_eligible(p.id) then p.name else 'Unavailable student' end,null::bigint,c.last_message_at,m.created_at,left(m.body,120)
 from public.dm_conversations c join public.profiles p on p.id=case when c.user_low=auth.uid() then c.user_high else c.user_low end
 join public.dm_messages m on m.conversation_id=c.id and m.sequence=c.last_sequence where auth.uid() in(c.user_low,c.user_high)
 union all
 select 'group'::text,g.id,null::uuid,private.group_name(g.id),(select count(*) from public.group_members where group_id=g.id),
 coalesce(m.created_at,v.joined_at),m.created_at,left(m.body,120)
 from public.group_members v join public.group_conversations g on g.id=v.group_id
 left join public.group_messages m on m.group_id=g.id and m.sequence=g.last_sequence and m.sequence>v.joined_after_sequence where v.user_id=auth.uid();
$$;
create function public.messaging_inbox(p_before_activity timestamptz default null,p_before_kind text default null,p_before_id uuid default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 or num_nonnulls(p_before_activity,p_before_kind,p_before_id) not in(0,3) then raise exception 'Invalid page' using errcode='22023'; end if;
 if p_before_id is not null and not exists(select 1 from private.messaging_rows() where conversation_id=p_before_id and kind=p_before_kind) then raise exception 'Invalid page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.last_message_at desc,x.kind desc,x.conversation_id desc),'[]'::jsonb) into result from (
 select * from private.messaging_rows() where p_before_activity is null or (last_message_at,kind,conversation_id)<(p_before_activity,p_before_kind,p_before_id)
 order by last_message_at desc,kind desc,conversation_id desc limit p_limit)x;
 return result;
end; $$;
create function public.messaging_unread() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(x.row),'[]'::jsonb) into result from (
 select jsonb_build_object('kind','direct','conversation_id',d->>'conversation_id','count',d->'count') row from jsonb_array_elements(public.dm_unread()) d
 union all
 select jsonb_build_object('kind','group','conversation_id',v.group_id,'count',count(*)) row
 from public.group_members v join public.group_messages m on m.group_id=v.group_id
 where v.user_id=auth.uid() and m.sender_id is distinct from auth.uid() and m.sequence>v.last_read_sequence group by v.group_id)x;
 return result;
end; $$;
revoke all on function private.group_name(uuid),private.group_mutate(uuid,uuid[],text,uuid),private.group_message_json(public.group_messages),private.messaging_rows() from public,anon,authenticated;
revoke all on function public.group_detail(uuid),public.group_friend_candidates(uuid,text,text,uuid,integer),public.group_create(uuid[],uuid,text),public.group_add_members(uuid,uuid[],uuid),public.group_send_message(uuid,text,uuid),public.group_history(uuid,bigint,bigint,integer),public.group_mark_read(uuid,bigint),public.messaging_inbox(timestamptz,text,uuid,integer),public.messaging_unread() from public,anon,authenticated;
grant execute on function public.group_detail(uuid),public.group_friend_candidates(uuid,text,text,uuid,integer),public.group_create(uuid[],uuid,text),public.group_add_members(uuid,uuid[],uuid),public.group_send_message(uuid,text,uuid),public.group_history(uuid,bigint,bigint,integer),public.group_mark_read(uuid,bigint),public.messaging_inbox(timestamptz,text,uuid,integer),public.messaging_unread() to authenticated;
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['group_conversations','group_messages'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
 end if;
end $$;
commit;
