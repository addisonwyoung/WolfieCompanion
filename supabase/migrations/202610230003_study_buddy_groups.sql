-- Owner review and manual application only. Requires accounts, classmate discovery,
-- and classmate profile visibility migrations. Never applied by the application.
begin;

create table public.study_groups (
  id uuid primary key default gen_random_uuid(),
  course_code text not null check (course_code ~ '^[A-Z]{2,4} [0-9]{3}$'),
  name text not null check (name = btrim(name) and length(name) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.study_group_members (
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index study_group_members_user on public.study_group_members(user_id, status, created_at desc);

create table public.study_group_availability (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  user_id uuid not null,
  day text not null check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440 and end_minute > start_minute),
  created_at timestamptz not null default now(),
  constraint study_group_availability_member_fk foreign key (group_id,user_id)
    references public.study_group_members(group_id,user_id) on delete cascade
);
create index study_group_availability_member on public.study_group_availability(group_id,user_id,day,start_minute);

alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;
alter table public.study_group_availability enable row level security;
revoke all on public.study_groups, public.study_group_members, public.study_group_availability from public, anon, authenticated;

create function public.create_study_group(p_course_code text, p_name text, p_invitees uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); code text := upper(btrim(p_course_code)); group_id uuid; invitee uuid;
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if code is null or code !~ '^[A-Z]{2,4}\s*[0-9]{3}$' then raise exception 'Invalid course code' using errcode='22023'; end if;
  code := regexp_replace(code, '^([A-Z]{2,4})\s*([0-9]{3})$', '\1 \2');
  if not exists(select 1 from public.user_courses where user_id=caller and course_code=code) then raise exception 'Saved course membership required' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'Group name must be 1 to 80 characters' using errcode='22023'; end if;
  if p_invitees is null or cardinality(p_invitees) not between 1 and 7
    or array_position(p_invitees,null) is not null
    or (select count(distinct x) from unnest(p_invitees) x) <> cardinality(p_invitees) then
    raise exception 'Invite 1 to 7 different classmates' using errcode='22023';
  end if;
  foreach invitee in array p_invitees loop
    if invitee=caller or not private.can_view_classmate(caller,invitee,code) then
      raise exception 'Every invitee must be an eligible classmate in this course' using errcode='42501';
    end if;
  end loop;
  insert into public.study_groups(course_code,name,created_by) values(code,btrim(p_name),caller) returning id into group_id;
  insert into public.study_group_members(group_id,user_id,role,status) values(group_id,caller,'owner','accepted');
  insert into public.study_group_members(group_id,user_id,role,status)
    select group_id,invited_id,'member','pending' from unnest(p_invitees) as invited(invited_id);
  return group_id;
end; $$;
revoke all on function public.create_study_group(text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.create_study_group(text,text,uuid[]) to authenticated;

create function public.respond_to_study_group_invite(p_group_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); code text;
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if p_accept is null then raise exception 'Choose whether to accept or decline' using errcode='22023'; end if;
  select g.course_code into code from public.study_groups g join public.study_group_members m on m.group_id=g.id
    where g.id=p_group_id and m.user_id=caller and m.status='pending' for update of m;
  if not found then raise exception 'Pending invitation not found' using errcode='42501'; end if;
  if p_accept and not exists(select 1 from public.user_courses where user_id=caller and course_code=code) then
    raise exception 'Save this course before joining the group' using errcode='42501';
  end if;
  if p_accept then update public.study_group_members set status='accepted' where group_id=p_group_id and user_id=caller;
  else delete from public.study_group_members where group_id=p_group_id and user_id=caller; end if;
end; $$;
revoke all on function public.respond_to_study_group_invite(uuid,boolean) from public,anon,authenticated;
grant execute on function public.respond_to_study_group_invite(uuid,boolean) to authenticated;

create function public.my_study_groups()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := auth.uid(); result jsonb;
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'group_id',g.id,'course_code',g.course_code,'name',g.name,'owner_id',g.created_by,'created_at',g.created_at,'my_status',mine.status,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.name,'status',m.status,'role',m.role) order by (m.role='owner') desc,p.name), '[]'::jsonb)
      from public.study_group_members m join public.profiles p on p.id=m.user_id where m.group_id=g.id),
    'availability',case when mine.status='accepted' then
      (select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'day',a.day,'start_minute',a.start_minute,'end_minute',a.end_minute) order by a.user_id,a.day,a.start_minute),'[]'::jsonb)
       from public.study_group_availability a join public.study_group_members m on m.group_id=a.group_id and m.user_id=a.user_id
       where a.group_id=g.id and m.status='accepted') else '[]'::jsonb end
  ) order by g.created_at desc), '[]'::jsonb) into result
  from public.study_groups g join public.study_group_members mine on mine.group_id=g.id
  where mine.user_id=caller;
  return result;
end; $$;
revoke all on function public.my_study_groups() from public,anon,authenticated;
grant execute on function public.my_study_groups() to authenticated;

create function public.save_study_group_availability(p_group_id uuid, p_windows jsonb)
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
      or item.end_minute<1 or item.end_minute>1440 or item.start_minute>=item.end_minute then raise exception 'Availability must use valid minute-based weekly time windows' using errcode='22023'; end if;
  end loop;
  delete from public.study_group_availability where group_id=p_group_id and user_id=caller;
  insert into public.study_group_availability(group_id,user_id,day,start_minute,end_minute)
    select p_group_id,caller,x.day,x.start_minute,x.end_minute
    from jsonb_to_recordset(p_windows) as x(day text,start_minute integer,end_minute integer);
end; $$;
revoke all on function public.save_study_group_availability(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_study_group_availability(uuid,jsonb) to authenticated;

create function public.leave_study_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); next_owner uuid;
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  if not exists(select 1 from public.study_group_members where group_id=p_group_id and user_id=caller and status='accepted') then raise exception 'Accepted group membership required' using errcode='42501'; end if;
  if exists(select 1 from public.study_group_members where group_id=p_group_id and user_id=caller and role='owner') then
    select user_id into next_owner from public.study_group_members where group_id=p_group_id and user_id<>caller and status='accepted' order by created_at,user_id limit 1;
    if next_owner is null then delete from public.study_groups where id=p_group_id; return; end if;
    update public.study_group_members set role='owner' where group_id=p_group_id and user_id=next_owner;
    update public.study_groups set created_by=next_owner where id=p_group_id;
  end if;
  delete from public.study_group_members where group_id=p_group_id and user_id=caller;
end; $$;
revoke all on function public.leave_study_group(uuid) from public,anon,authenticated;
grant execute on function public.leave_study_group(uuid) to authenticated;

commit;
