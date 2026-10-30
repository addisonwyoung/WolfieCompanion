-- Owner-reviewed manual deployment after 202610230001_direct_messaging.sql.
begin;
create table public.dm_read_positions (
 user_id uuid not null references auth.users(id) on delete cascade,
 conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
 last_read_sequence bigint not null default 0 check(last_read_sequence>=0),
 primary key(user_id,conversation_id)
);
alter table public.dm_read_positions enable row level security;
revoke all on public.dm_read_positions from anon,authenticated;
-- Read positions stay private; only these caller-scoped functions access them.
create function public.dm_unread() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('conversation_id',x.conversation_id,'count',x.count)),'[]'::jsonb) into result from (
 select m.conversation_id,count(*) as count from public.dm_conversations c
 join public.dm_messages m on m.conversation_id=c.id
 left join public.dm_read_positions r on r.conversation_id=c.id and r.user_id=auth.uid()
 where auth.uid() in(c.user_low,c.user_high) and m.sender_id<>auth.uid() and m.sequence>coalesce(r.last_read_sequence,0)
 group by m.conversation_id
 )x;
 return result;
end; $$;
create function public.dm_mark_read(p_conversation_id uuid,p_sequence bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 if not exists(select 1 from public.dm_conversations where id=p_conversation_id and auth.uid() in(user_low,user_high)) then raise exception 'Conversation unavailable' using errcode='42501'; end if;
 if p_sequence is null or p_sequence<=0 or not exists(select 1 from public.dm_messages where conversation_id=p_conversation_id and sequence=p_sequence) then raise exception 'Invalid sequence' using errcode='22023'; end if;
 insert into public.dm_read_positions(user_id,conversation_id,last_read_sequence) values(auth.uid(),p_conversation_id,p_sequence)
 on conflict(user_id,conversation_id) do update set last_read_sequence=greatest(public.dm_read_positions.last_read_sequence,excluded.last_read_sequence);
end; $$;
revoke all on function public.dm_unread(),public.dm_mark_read(uuid,bigint) from public,anon,authenticated;
grant execute on function public.dm_unread(),public.dm_mark_read(uuid,bigint) to authenticated;
create index dm_incoming_sequence on public.dm_messages(conversation_id,sequence,sender_id);
commit;
