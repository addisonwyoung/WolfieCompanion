-- Study group invitations follow the section-scoped classmate visibility rules.
begin;

alter table public.study_groups
  add column if not exists course_section text;

alter table public.study_groups
  drop constraint if exists study_groups_course_code_check;
alter table public.study_groups
  add constraint study_groups_course_code_check
  check (course_code ~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$');

-- Remove the course-only entry point so callers cannot bypass section checks.
revoke all on function public.create_study_group(text,text,uuid[]) from public,anon,authenticated;
drop function public.create_study_group(text,text,uuid[]);

create function public.create_study_group(p_course_code text,p_section text,p_name text,p_invitees uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  code text := regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
  section_value text := upper(btrim(p_section));
  group_id uuid;
  invitee uuid;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  if code is null or code !~ '^[A-Z]{2,5} [0-9]{3}[A-Z]?$'
    or section_value is null or section_value !~ '^[A-Z0-9-]{1,20}$' then
    raise exception 'Invalid course section' using errcode='22023';
  end if;
  if not private.is_current_course_section_member(caller,code,section_value) then
    raise exception 'Current course section membership required' using errcode='42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Group name must be 1 to 80 characters' using errcode='22023';
  end if;
  if p_invitees is null or cardinality(p_invitees) not between 1 and 7
    or array_position(p_invitees,null) is not null
    or (select count(distinct x) from unnest(p_invitees) x) <> cardinality(p_invitees) then
    raise exception 'Invite 1 to 7 different classmates' using errcode='22023';
  end if;
  foreach invitee in array p_invitees loop
    if not private.can_view_classmate_in_section(caller,invitee,code,section_value) then
      raise exception 'Every invitee must be a visible classmate in this section' using errcode='42501';
    end if;
  end loop;
  insert into public.study_groups(course_code,course_section,name,created_by)
    values(code,section_value,btrim(p_name),caller) returning id into group_id;
  insert into public.study_group_members(group_id,user_id,role,status)
    values(group_id,caller,'owner','accepted');
  insert into public.study_group_members(group_id,user_id,role,status)
    select group_id,invited_id,'member','pending' from unnest(p_invitees) as invited(invited_id);
  return group_id;
end;
$$;
revoke all on function public.create_study_group(text,text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.create_study_group(text,text,text,uuid[]) to authenticated;

create or replace function public.respond_to_study_group_invite(p_group_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid:=auth.uid(); code text; section_value text;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  if p_accept is null then raise exception 'Choose whether to accept or decline' using errcode='22023'; end if;
  select g.course_code,g.course_section into code,section_value
  from public.study_groups g join public.study_group_members m on m.group_id=g.id
  where g.id=p_group_id and m.user_id=caller and m.status='pending' for update of m;
  if not found then raise exception 'Pending invitation not found' using errcode='42501'; end if;
  if p_accept and section_value is not null
    and not private.is_current_course_section_member(caller,code,section_value) then
    raise exception 'Current course section membership required to join' using errcode='42501';
  end if;
  if p_accept and section_value is null
    and not exists(select 1 from public.user_courses where user_id=caller and course_code=code) then
    raise exception 'Save this course before joining the group' using errcode='42501';
  end if;
  if p_accept then
    update public.study_group_members set status='accepted' where group_id=p_group_id and user_id=caller;
  else
    delete from public.study_group_members where group_id=p_group_id and user_id=caller;
  end if;
end;
$$;
revoke all on function public.respond_to_study_group_invite(uuid,boolean) from public,anon,authenticated;
grant execute on function public.respond_to_study_group_invite(uuid,boolean) to authenticated;

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
      'user_id',m.user_id,'name',p.name,'status',m.status,'role',m.role
    ) order by (m.role='owner') desc,p.name),'[]'::jsonb)
      from public.study_group_members m join public.profiles p on p.id=m.user_id where m.group_id=g.id),
    'availability',case when mine.status='accepted' then
      (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id',a.user_id,'day',a.day,'start_minute',a.start_minute,'end_minute',a.end_minute
      ) order by a.user_id,a.day,a.start_minute),'[]'::jsonb)
       from public.study_group_availability a join public.study_group_members m
         on m.group_id=a.group_id and m.user_id=a.user_id
       where a.group_id=g.id and m.status='accepted')
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
