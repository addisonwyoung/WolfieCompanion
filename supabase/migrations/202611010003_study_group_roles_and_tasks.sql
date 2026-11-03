-- Add member project roles and a shared task board to accepted study groups.
-- Owner review and manual application only; the client never runs this SQL.
begin;

alter table public.study_group_members
  add column if not exists study_role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.study_group_members'::regclass
      and conname = 'study_group_members_study_role_check'
  ) then
    alter table public.study_group_members
      add constraint study_group_members_study_role_check
      check (study_role is null or (study_role = btrim(study_role) and length(study_role) between 1 and 60));
  end if;
end;
$$;

create table if not exists public.study_group_tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (title = btrim(title) and length(title) between 1 and 160),
  details text not null default '' check (length(details) <= 1000),
  is_complete boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists study_group_tasks_recent
  on public.study_group_tasks(group_id, created_at desc, id);

alter table public.study_group_tasks enable row level security;
revoke all on public.study_group_tasks from public, anon, authenticated;

create function public.set_study_group_member_role(p_group_id uuid, p_member_id uuid, p_study_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); caller_role text; role_value text;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  select role into caller_role from public.study_group_members
    where group_id=p_group_id and user_id=caller and status='accepted';
  if not found then raise exception 'Accepted group membership required' using errcode='42501'; end if;
  if p_member_id is null or (caller_role <> 'owner' and p_member_id <> caller) then
    raise exception 'Only the group owner or the member can assign this role' using errcode='42501';
  end if;
  role_value := nullif(btrim(p_study_role), '');
  if role_value is not null and length(role_value) > 60 then
    raise exception 'Project role must be at most 60 characters' using errcode='22023';
  end if;
  update public.study_group_members set study_role=role_value
    where group_id=p_group_id and user_id=p_member_id and status='accepted';
  if not found then raise exception 'Accepted group member not found' using errcode='42501'; end if;
end;
$$;
revoke all on function public.set_study_group_member_role(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_study_group_member_role(uuid,uuid,text) to authenticated;

create function public.add_study_group_task(p_group_id uuid, p_title text, p_details text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); task_id uuid; detail_value text;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 160
    or p_details is not null and length(btrim(p_details)) > 1000 then
    raise exception 'Task title must be 1 to 160 characters and details at most 1,000 characters' using errcode='22023';
  end if;
  perform 1 from public.study_groups where id=p_group_id for update;
  if not found or not exists(select 1 from public.study_group_members
    where group_id=p_group_id and user_id=caller and status='accepted') then
    raise exception 'Accepted group membership required' using errcode='42501';
  end if;
  if (select count(*) from public.study_group_tasks where group_id=p_group_id) >= 100 then
    raise exception 'This group has reached its 100 task limit' using errcode='22023';
  end if;
  detail_value := coalesce(btrim(p_details), '');
  insert into public.study_group_tasks(group_id,created_by,title,details)
    values(p_group_id,caller,btrim(p_title),detail_value) returning id into task_id;
  return task_id;
end;
$$;
revoke all on function public.add_study_group_task(uuid,text,text) from public,anon,authenticated;
grant execute on function public.add_study_group_task(uuid,text,text) to authenticated;

create function public.set_study_group_task_complete(p_task_id uuid, p_is_complete boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); group_value uuid;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  if p_is_complete is null then raise exception 'Choose whether the task is complete' using errcode='22023'; end if;
  select t.group_id into group_value from public.study_group_tasks t
    join public.study_group_members m on m.group_id=t.group_id and m.user_id=caller and m.status='accepted'
    where t.id=p_task_id;
  if not found then raise exception 'Task in an accepted group not found' using errcode='42501'; end if;
  update public.study_group_tasks set is_complete=p_is_complete where id=p_task_id;
end;
$$;
revoke all on function public.set_study_group_task_complete(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_study_group_task_complete(uuid,boolean) to authenticated;

create function public.delete_study_group_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); creator uuid; member_role text;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  select t.created_by,m.role into creator,member_role from public.study_group_tasks t
    join public.study_group_members m on m.group_id=t.group_id and m.user_id=caller and m.status='accepted'
    where t.id=p_task_id;
  if not found then raise exception 'Task in an accepted group not found' using errcode='42501'; end if;
  if creator <> caller and member_role <> 'owner' then
    raise exception 'Only the task author or group owner can delete this task' using errcode='42501';
  end if;
  delete from public.study_group_tasks where id=p_task_id;
end;
$$;
revoke all on function public.delete_study_group_task(uuid) from public,anon,authenticated;
grant execute on function public.delete_study_group_task(uuid) to authenticated;

create or replace function public.my_study_groups()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller uuid:=auth.uid(); result jsonb;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'group_id',g.id,'course_code',g.course_code,'course_section',g.course_section,
    'name',g.name,'owner_id',g.created_by,'created_at',g.created_at,'my_status',mine.status,
    'members',(select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'name',p.name,'status',m.status,'role',m.role,
      'study_role',case when mine.status='accepted' then m.study_role else null end
    ) order by (m.role='owner') desc,p.name),'[]'::jsonb)
      from public.study_group_members m join public.profiles p on p.id=m.user_id where m.group_id=g.id),
    'availability',case when mine.status='accepted' then
      (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id',a.user_id,'day',a.day,'start_minute',a.start_minute,'end_minute',a.end_minute
      ) order by a.user_id,a.day,a.start_minute),'[]'::jsonb)
       from public.study_group_availability a join public.study_group_members m
         on m.group_id=a.group_id and m.user_id=a.user_id
       where a.group_id=g.id and m.status='accepted')
      else '[]'::jsonb end,
    'tasks',case when mine.status='accepted' then
      (select coalesce(jsonb_agg(jsonb_build_object(
        'id',t.id,'title',t.title,'details',t.details,'is_complete',t.is_complete,
        'created_by',t.created_by,'created_by_name',coalesce(p.name,'Group member'),'created_at',t.created_at
      ) order by t.created_at desc,t.id),'[]'::jsonb)
       from public.study_group_tasks t left join public.profiles p on p.id=t.created_by
       where t.group_id=g.id)
      else '[]'::jsonb end
  ) order by g.created_at desc),'[]'::jsonb) into result
  from public.study_groups g join public.study_group_members mine on mine.group_id=g.id
  where mine.user_id=caller;
  return result;
end;
$$;
revoke all on function public.my_study_groups() from public,anon,authenticated;
grant execute on function public.my_study_groups() to authenticated;

commit;
