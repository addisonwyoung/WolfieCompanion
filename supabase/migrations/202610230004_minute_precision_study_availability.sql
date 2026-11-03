-- Permit exact-minute recurring availability such as 10:35.
-- Existing 15-minute values remain valid and are preserved.
begin;

alter table public.study_group_availability
  drop constraint if exists study_group_availability_start_minute_check,
  drop constraint if exists study_group_availability_check;

alter table public.study_group_availability
  add constraint study_group_availability_start_minute_range
    check (start_minute between 0 and 1439),
  add constraint study_group_availability_end_minute_range
    check (end_minute between 1 and 1440 and end_minute > start_minute);

create or replace function public.save_study_group_availability(p_group_id uuid, p_windows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); item record;
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if not exists(select 1 from public.study_group_members where group_id=p_group_id and user_id=caller and status='accepted') then
    raise exception 'Accepted group membership required' using errcode='42501';
  end if;
  if p_windows is null or jsonb_typeof(p_windows)<>'array' then raise exception 'Availability must be a list of weekly time windows' using errcode='22023'; end if;
  if jsonb_array_length(p_windows)>56 then raise exception 'Provide at most 56 availability windows' using errcode='22023'; end if;
  for item in select * from jsonb_to_recordset(p_windows) as x(day text,start_minute integer,end_minute integer) loop
    if item.day is null or item.day not in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
      or item.start_minute is null or item.end_minute is null or item.start_minute<0 or item.start_minute>1439
      or item.end_minute<1 or item.end_minute>1440 or item.start_minute>=item.end_minute then
      raise exception 'Availability must use valid minute-based weekly time windows' using errcode='22023';
    end if;
  end loop;
  delete from public.study_group_availability where group_id=p_group_id and user_id=caller;
  insert into public.study_group_availability(group_id,user_id,day,start_minute,end_minute)
    select p_group_id,caller,x.day,x.start_minute,x.end_minute
    from jsonb_to_recordset(p_windows) as x(day text,start_minute integer,end_minute integer);
end; $$;

commit;
