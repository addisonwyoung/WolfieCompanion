-- Apply after 202610250001_group_messaging.sql. Keeps saved messages intact.
begin;
create function public.group_remove_member(p_group_id uuid,p_member_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.group_conversations;
begin
 if auth.uid() is null or not private.is_eligible() then raise exception 'Student account required' using errcode='42501'; end if;
 select * into g from public.group_conversations where id=p_group_id for update;
 if not found or g.creator_id is distinct from auth.uid() or private.group_floor(p_group_id) is null then raise exception 'Creator required' using errcode='42501'; end if;
 if p_member_id is null or p_member_id=auth.uid() then raise exception 'The creator cannot be removed' using errcode='22023'; end if;
 -- Deleting an already absent member is safe to retry after a lost response.
 delete from public.group_members where group_id=p_group_id and user_id=p_member_id;
 if found then update public.group_conversations set metadata_revision=metadata_revision+1 where id=p_group_id; end if;
 return public.group_detail(p_group_id);
end; $$;
revoke all on function public.group_remove_member(uuid,uuid) from public,anon,authenticated;
grant execute on function public.group_remove_member(uuid,uuid) to authenticated;
-- Recheck membership after acquiring the same group lock as removal/addition.
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
  return private.group_message_json(m);
 end if;
 insert into public.group_messages(group_id,sequence,sender_id,client_message_id,body) values(g.id,g.last_sequence+1,caller,p_client_message_id,p_body) returning * into m;
 update public.group_conversations set last_sequence=m.sequence,last_message_at=m.created_at where id=g.id;
 return private.group_message_json(m);
end; $$;
commit;
