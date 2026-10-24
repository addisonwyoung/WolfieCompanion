-- Owner-reviewed manual deployment only. Do not apply from the application.
-- Removes the active friendship row while preserving friend request history.
begin;

create or replace function public.unfriend(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode = '42501';
  end if;
  if p_student_id is null or p_student_id = caller then
    raise exception 'Invalid friend' using errcode = '22023';
  end if;

  delete from public.friendships
  where user_id = least(caller, p_student_id)
    and friend_id = greatest(caller, p_student_id);
end;
$$;

revoke all on function public.unfriend(uuid) from public, anon, authenticated;
grant execute on function public.unfriend(uuid) to authenticated;

commit;
