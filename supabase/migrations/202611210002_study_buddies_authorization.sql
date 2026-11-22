-- Stage 3B only. Manual whole-file application after verified Stage 1-3A.
-- No calendar, enrollment, DM or regular group-chat changes.
begin;
set local lock_timeout='5s';
do $$ begin
 if to_regprocedure('private.is_current_course_professor_member(uuid,text,text,text,text)') is null
 or to_regprocedure('public.group_leave(uuid,uuid)') is null
 or not exists(select 1 from pg_trigger where tgrelid='public.study_group_members'::regclass and tgname='study_admission_block_guard' and tgenabled='O') then
  raise exception 'Verified Stage 1-3A/Study prerequisites required';
 end if;
 if exists(select 1 from unnest(array['anon','authenticated']) r cross join unnest(array['study_groups','study_group_members','study_group_availability','study_group_tasks']) t
 where has_any_column_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE') or has_table_privilege(r,'public.'||t,'DELETE')) then
  raise exception 'Unexpected direct client Study privileges';
 end if;
end; $$;

-- Null means legacy/unreconciled. Never infer the existing group's offering.
alter table public.study_groups add column professor_first_name text,
 add column professor_last_name text, add column semester text, add column academic_year integer,
 add constraint study_offering_context check(
 (professor_first_name is null and professor_last_name is null and semester is null and academic_year is null) or
 (course_section is not null and professor_first_name is not null and professor_last_name is not null
 and length(btrim(professor_first_name)) between 1 and 80 and length(btrim(professor_last_name)) between 1 and 80
 and semester is not null and semester in('Fall','Winter','Spring','Summer') and academic_year is not null and academic_year between 1000 and 9999));
alter table public.study_group_members add column invitation_id uuid,
 add column invited_by uuid, add column invitation_issued_at timestamptz,
 add constraint study_invitation_provenance check(
 (invitation_id is null and invited_by is null and invitation_issued_at is null) or
 (invitation_id is not null and invited_by is not null and invitation_issued_at is not null and invited_by<>user_id));
create unique index study_invitation_generation on public.study_group_members(invitation_id) where invitation_id is not null;
-- Inviter UUID is provenance, not a dependency on a departing membership/account.
-- Receipts intentionally do not cascade with groups or membership generations.
create table private.study_requests(
 actor uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, payload jsonb not null, group_id uuid not null,
 primary key(actor,request_id)
);
alter table private.study_requests enable row level security;
revoke all on private.study_requests from public,anon,authenticated,service_role;

create function private.study_member(p_group uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_eligible() and exists(select 1 from public.study_group_members where group_id=p_group and user_id=auth.uid() and status='accepted');
$$;
create function private.study_lock_member(p_group uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
 if not private.study_member(p_group) then raise exception 'Study group unavailable' using errcode='42501'; end if;
 perform 1 from public.study_groups where id=p_group for update;
 if not found or not private.study_member(p_group) then raise exception 'Study group unavailable' using errcode='42501'; end if;
end; $$;
create function private.study_offering_member(p_user uuid,p_group uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.dm_eligible(p_user) and exists(select 1 from public.study_groups g cross join private.resolve_current_semester(now()) t
 where g.id=p_group and g.semester=t.semester and g.academic_year=t.academic_year
 and private.is_current_course_professor_member(p_user,g.course_code,g.course_section,g.professor_first_name,g.professor_last_name));
$$;
create function private.study_occupied(p_group uuid,p_at timestamptz) returns bigint
language sql stable security definer set search_path='' as $$
 select count(*) from public.study_group_members where group_id=p_group and
 (status='accepted' or (status='pending' and invitation_id is not null and invited_by is not null and invitation_issued_at is not null and invitation_issued_at+interval '168 hours'>p_at));
$$;
create function private.study_replay(p_request uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$ declare r private.study_requests; begin
 if auth.uid() is null or not private.is_eligible() or p_request is null then raise exception 'Study group unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('study-request:'||auth.uid()::text||p_request::text,0));
 select * into r from private.study_requests where actor=auth.uid() and request_id=p_request;
 if found then
  if r.payload<>p_payload then raise exception 'Request identifier already used' using errcode='23505'; end if;
  return r.group_id;
 end if;
 return null;
end; $$;

create function private.study_issue(p_group uuid,p_targets uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare student uuid; ids uuid[]; existing public.study_group_members; current_time_value timestamptz;
begin
 perform private.study_lock_member(p_group);
 if p_targets is null or cardinality(p_targets) not between 1 and 7 or array_position(p_targets,null) is not null or auth.uid()=any(p_targets) then raise exception 'Invalid invitation selection' using errcode='22023'; end if;
 select array_agg(x order by x) into ids from (select distinct unnest(p_targets) x)s;
 if cardinality(ids)<>cardinality(p_targets) then raise exception 'Invalid invitation selection' using errcode='22023'; end if;
 foreach student in array ids loop perform private.student_pair_lock(auth.uid(),student); end loop;
 -- Same group -> pair -> sorted profile lock order as the supported messaging paths.
 perform 1 from public.profiles where id=any(ids||array[auth.uid()]) order by id for update;
 current_time_value:=clock_timestamp();
 if not private.study_offering_member(auth.uid(),p_group) or private.study_occupied(p_group,current_time_value)+cardinality(ids)>8 then
  raise exception 'Study invitation unavailable' using errcode='42501';
 end if;
 foreach student in array ids loop
  if not private.student_visible(auth.uid(),student,true) or not private.study_offering_member(student,p_group) then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
  select * into existing from public.study_group_members where group_id=p_group and user_id=student;
  if found and (existing.status='accepted' or (existing.invitation_id is not null and existing.invitation_issued_at+interval '168 hours'>current_time_value)) then
   raise exception 'Study invitation unavailable' using errcode='42501';
  end if;
 end loop;
 foreach student in array ids loop
  insert into public.study_group_members(group_id,user_id,role,status,invitation_id,invited_by,invitation_issued_at)
  values(p_group,student,'member','pending',gen_random_uuid(),auth.uid(),clock_timestamp())
  on conflict(group_id,user_id) do update set invitation_id=excluded.invitation_id,invited_by=excluded.invited_by,
   invitation_issued_at=excluded.invitation_issued_at,study_role=null;
 end loop;
end; $$;

-- Replace only the Study trigger. No all-co-member blocking rule remains.
create or replace function private.study_admission_block_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare g public.study_groups; at_time timestamptz; begin
 select * into g from public.study_groups where id=new.group_id for update;
 if g.id is null or auth.uid() is null or not private.is_eligible() then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
 if tg_op='UPDATE' and old.status='accepted' then
  if new.status<>old.status or new.invitation_id is distinct from old.invitation_id or new.invited_by is distinct from old.invited_by or new.invitation_issued_at is distinct from old.invitation_issued_at then
   raise exception 'Study invitation unavailable' using errcode='42501';
  end if;
  return new;
 end if;
 if tg_op='INSERT' and new.status='accepted' and new.user_id=auth.uid() and g.created_by=auth.uid()
 and new.role='owner' and new.invitation_id is null and not exists(select 1 from public.study_group_members where group_id=g.id)
 and private.study_offering_member(auth.uid(),g.id) then return new; end if;
 if new.status='pending' then
  if new.invitation_id is null or new.invited_by is distinct from auth.uid() or not private.study_member(g.id) then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
  perform private.student_pair_lock(auth.uid(),new.user_id);
  perform 1 from public.profiles where id in(auth.uid(),new.user_id) order by id for update;
  at_time:=clock_timestamp();
  if tg_op='UPDATE' and (new.invitation_id=old.invitation_id or (old.invitation_id is not null and old.invitation_issued_at+interval '168 hours'>at_time)) then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
  if not private.study_offering_member(auth.uid(),g.id) or not private.study_offering_member(new.user_id,g.id)
   or not private.student_visible(auth.uid(),new.user_id,true) or private.study_occupied(g.id,at_time)>=8 then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
  new.invitation_issued_at:=at_time;
 elsif new.status='accepted' then
  if tg_op<>'UPDATE' or new.user_id<>auth.uid() or old.invitation_id is null or new.invitation_id is distinct from old.invitation_id
   or new.invited_by is distinct from old.invited_by or new.invitation_issued_at is distinct from old.invitation_issued_at then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
  perform private.student_pair_lock(old.invited_by,new.user_id);
  perform 1 from public.profiles where id=new.user_id for update;
  at_time:=clock_timestamp();
  if old.invitation_issued_at+interval '168 hours'<=at_time or not private.study_offering_member(new.user_id,g.id)
   or private.students_blocked(old.invited_by,new.user_id) or private.study_occupied(g.id,at_time)>8
   or not exists(select 1 from public.study_group_members where group_id=g.id and status='accepted') then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
 else raise exception 'Study invitation unavailable' using errcode='42501';
 end if;
 return new;
end; $$;
drop trigger study_admission_block_guard on public.study_group_members;
create trigger study_admission_block_guard before insert or update of status,invitation_id,invited_by,invitation_issued_at
 on public.study_group_members for each row execute function private.study_admission_block_guard();

create function public.study_create(p_course_code text,p_section text,p_professor_first_name text,p_professor_last_name text,p_name text,p_invitees uuid[],p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
 section_value text:=upper(btrim(p_section)); first_value text:=lower(btrim(p_professor_first_name)); last_value text:=lower(btrim(p_professor_last_name));
 payload jsonb; id uuid; term record;
begin
 payload:=jsonb_build_object('op','create','course',code,'section',section_value,'first',first_value,'last',last_value,'name',btrim(p_name),'targets',to_jsonb(p_invitees));
 id:=private.study_replay(p_request_id,payload);
 if id is not null then
  if not private.study_member(id) then raise exception 'Study group unavailable' using errcode='42501'; end if;
  return id;
 end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'Group name must be 1 to 80 characters' using errcode='22023'; end if;
 if not private.is_current_course_professor_member(auth.uid(),code,section_value,first_value,last_value) then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
 select * into term from private.resolve_current_semester(now());
 insert into public.study_groups(course_code,course_section,name,created_by,professor_first_name,professor_last_name,semester,academic_year)
 values(code,section_value,btrim(p_name),auth.uid(),first_value,last_value,term.semester,term.academic_year) returning study_groups.id into id;
 insert into public.study_group_members(group_id,user_id,role,status) values(id,auth.uid(),'owner','accepted');
 perform private.study_issue(id,p_invitees);
 insert into private.study_requests values(auth.uid(),p_request_id,payload,id);
 return id;
end; $$;
create function public.study_invite(p_group_id uuid,p_invitees uuid[],p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_object('op','invite','group',p_group_id,'targets',to_jsonb(p_invitees)); replay uuid; begin
 replay:=private.study_replay(p_request_id,payload);
 if replay is not null then return; end if;
 perform private.study_issue(p_group_id,p_invitees);
 insert into private.study_requests values(auth.uid(),p_request_id,payload,p_group_id);
end; $$;
create function public.study_respond(p_group_id uuid,p_invitation_id uuid,p_accept boolean,p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m public.study_group_members; payload jsonb:=jsonb_build_object('op','respond','group',p_group_id,'generation',p_invitation_id,'accept',p_accept); begin
 if private.study_replay(p_request_id,payload) is not null then return; end if;
 if p_accept is null then raise exception 'Choose accept or decline' using errcode='22023'; end if;
 if not exists(select 1 from public.study_group_members where group_id=p_group_id and user_id=auth.uid() and status='pending') then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
 perform 1 from public.study_groups where id=p_group_id for update;
 select * into m from public.study_group_members where group_id=p_group_id and user_id=auth.uid() and status='pending' for update;
 if not found or m.invitation_id is distinct from p_invitation_id then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
 if p_accept then
  if m.invitation_id is null then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
  -- Trigger rechecks original-inviter pair, expiry, eligibility and offering after waits.
  update public.study_group_members set status='accepted' where group_id=p_group_id and user_id=auth.uid();
 else delete from public.study_group_members where group_id=p_group_id and user_id=auth.uid();
 end if;
 insert into private.study_requests values(auth.uid(),p_request_id,payload,p_group_id);
end; $$;
create function public.study_leave(p_group_id uuid,p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare next_owner uuid; payload jsonb:=jsonb_build_object('op','leave','group',p_group_id); begin
 if private.study_replay(p_request_id,payload) is not null then return; end if;
 perform private.study_lock_member(p_group_id);
 if exists(select 1 from public.study_group_members where group_id=p_group_id and user_id=auth.uid() and role='owner') then
  select user_id into next_owner from public.study_group_members where group_id=p_group_id and user_id<>auth.uid() and status='accepted' order by created_at,user_id limit 1;
  if next_owner is null then
   delete from public.study_groups where id=p_group_id;
  else
   update public.study_group_members set role='owner' where group_id=p_group_id and user_id=next_owner;
   update public.study_groups set created_by=next_owner where id=p_group_id;
   delete from public.study_group_members where group_id=p_group_id and user_id=auth.uid();
  end if;
 else delete from public.study_group_members where group_id=p_group_id and user_id=auth.uid();
 end if;
 insert into private.study_requests values(auth.uid(),p_request_id,payload,p_group_id);
end; $$;

create function public.study_invitation_candidates(p_course_code text,p_section text,p_professor_first_name text,p_professor_last_name text,p_group_id uuid default null,p_search text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare code text:=regexp_replace(upper(btrim(p_course_code)),'^([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)$','\1 \2');
 section_value text:=upper(btrim(p_section)); first_value text:=lower(btrim(p_professor_first_name)); last_value text:=lower(btrim(p_professor_last_name)); result jsonb; begin
 if auth.uid() is null or not private.is_eligible() or p_search is null or length(p_search)>100 then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
 if p_group_id is not null then
  if not private.study_member(p_group_id) or not private.study_offering_member(auth.uid(),p_group_id) then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
  select course_code,course_section,professor_first_name,professor_last_name into code,section_value,first_value,last_value from public.study_groups where id=p_group_id;
 elsif not private.is_current_course_professor_member(auth.uid(),code,section_value,first_value,last_value) then raise exception 'Study invitation unavailable' using errcode='42501'; end if;
 select coalesce(jsonb_agg(x.row order by x.name,x.id),'[]'::jsonb) into result from (
 select p.name,p.id,jsonb_build_object('student_id',p.id,'name',p.name,'major',p.major) row from public.profiles p
 where private.student_visible(auth.uid(),p.id,true) and private.is_current_course_professor_member(p.id,code,section_value,first_value,last_value)
 and position(lower(btrim(p_search)) in lower(p.name))>0
 and (p_group_id is null or not exists(select 1 from public.study_group_members m where m.group_id=p_group_id and m.user_id=p.id
 and (m.status='accepted' or (m.invitation_id is not null and m.invitation_issued_at+interval '168 hours'>clock_timestamp()))))
 order by p.name,p.id limit 50) x;
 return result;
end; $$;

create or replace function public.my_study_groups() returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare result jsonb; at_time timestamptz:=clock_timestamp(); begin
 if auth.uid() is null or not private.is_eligible() then raise exception 'Study group unavailable' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'group_id',g.id,'course_code',g.course_code,'course_section',g.course_section,'name',g.name,'created_at',g.created_at,
 'owner_id',case when mine.status='accepted' then g.created_by else null end,'my_status',mine.status,
 'professor_first_name',g.professor_first_name,'professor_last_name',g.professor_last_name,'semester',g.semester,'academic_year',g.academic_year,
 'can_invite',mine.status='accepted' and private.study_offering_member(auth.uid(),g.id),
 'pending_count',case when mine.status='accepted' then (select count(*) from public.study_group_members m where m.group_id=g.id and m.status='pending' and m.invitation_id is not null and m.invitation_issued_at+interval '168 hours'>at_time) else 0 end,
 'invitation_id',mine.invitation_id,'expires_at',mine.invitation_issued_at+interval '168 hours',
 'invitation_state',case when mine.status='accepted' then null when mine.invitation_id is null then 'unavailable' when mine.invitation_issued_at+interval '168 hours'<=at_time then 'expired' else 'pending' end,
 'inviter',case when mine.status='pending' and mine.invited_by is not null then jsonb_build_object('student_id',mine.invited_by,'name',coalesce((select name from public.profiles where id=mine.invited_by),'A classmate')) else null end,
 'members',case when mine.status='accepted' then (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.name,'status',m.status,'role',m.role,'study_role',m.study_role) order by m.created_at,m.user_id),'[]'::jsonb) from public.study_group_members m join public.profiles p on p.id=m.user_id where m.group_id=g.id and m.status='accepted') else '[]'::jsonb end,
 'availability',case when mine.status='accepted' then (select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'day',a.day,'start_minute',a.start_minute,'end_minute',a.end_minute) order by a.user_id,a.day,a.start_minute),'[]'::jsonb) from public.study_group_availability a join public.study_group_members m on m.group_id=a.group_id and m.user_id=a.user_id where a.group_id=g.id and m.status='accepted') else '[]'::jsonb end,
 'tasks',case when mine.status='accepted' then (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'details',t.details,'is_complete',t.is_complete,'created_by',t.created_by,'created_by_name',coalesce(p.name,'Group member'),'created_at',t.created_at) order by t.created_at desc,t.id),'[]'::jsonb) from public.study_group_tasks t left join public.profiles p on p.id=t.created_by where t.group_id=g.id) else '[]'::jsonb end,
 'outgoing_invitations',case when mine.status='accepted' then (select coalesce(jsonb_agg(jsonb_build_object('student_id',m.user_id,'name',coalesce(p.name,'A classmate'),'invitation_id',m.invitation_id,'expires_at',m.invitation_issued_at+interval '168 hours','state',case when m.invitation_id is null then 'unavailable' when m.invitation_issued_at+interval '168 hours'<=at_time then 'expired' else 'pending' end) order by m.user_id),'[]'::jsonb) from public.study_group_members m left join public.profiles p on p.id=m.user_id where m.group_id=g.id and m.status='pending' and m.invited_by=auth.uid()) else '[]'::jsonb end
 ) order by g.created_at desc),'[]'::jsonb) into result from public.study_groups g join public.study_group_members mine on mine.group_id=g.id where mine.user_id=auth.uid();
 return result;
end; $$;

-- Old callers cannot bypass offering/generation checks. Coordinated client cutover required.
create or replace function public.create_study_group(p_course_code text,p_section text,p_name text,p_invitees uuid[]) returns uuid language plpgsql security definer set search_path='' as $$ begin raise exception 'Refresh the application for Study invitations' using errcode='42501'; end; $$;
create or replace function public.respond_to_study_group_invite(p_group_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$ begin raise exception 'Refresh the application for Study invitations' using errcode='42501'; end; $$;
create or replace function public.leave_study_group(p_group_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin raise exception 'Refresh the application for Study groups' using errcode='42501'; end; $$;
revoke all on function public.create_study_group(text,text,text,uuid[]),public.respond_to_study_group_invite(uuid,boolean),public.leave_study_group(uuid) from public,anon,authenticated,service_role;

-- Shared resource replacements are appended below; transaction/grants finalize together.

create or replace function public.save_study_group_availability(p_group_id uuid, p_windows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); item record;
begin
  if caller is null or not private.is_eligible() then raise exception 'Eligible student account required' using errcode='42501'; end if;
  perform private.study_lock_member(p_group_id);
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

create or replace function public.set_study_group_member_role(p_group_id uuid, p_member_id uuid, p_study_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); caller_role text; role_value text;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  perform private.study_lock_member(p_group_id);
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

create or replace function public.add_study_group_task(p_group_id uuid, p_title text, p_details text)
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
  perform private.study_lock_member(p_group_id);
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

create or replace function public.set_study_group_task_complete(p_task_id uuid, p_is_complete boolean)
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
  perform private.study_lock_member(group_value);
  update public.study_group_tasks set is_complete=p_is_complete where id=p_task_id;
end;
$$;

create or replace function public.delete_study_group_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); creator uuid; member_role text; group_value uuid;
begin
  if caller is null or not private.is_eligible() then
    raise exception 'Eligible student account required' using errcode='42501';
  end if;
  select group_id into group_value from public.study_group_tasks where id=p_task_id;
  perform private.study_lock_member(group_value);
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

-- Narrow effective privileges, including inherited/default grants.
do $$ declare signature text; begin
 foreach signature in array array[
 'private.study_member(uuid)','private.study_lock_member(uuid)','private.study_offering_member(uuid,uuid)',
 'private.study_occupied(uuid,timestamp with time zone)','private.study_replay(uuid,jsonb)','private.study_issue(uuid,uuid[])',
 'private.study_admission_block_guard()'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',signature);
  if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE') or has_function_privilege('service_role',signature,'EXECUTE') then raise exception 'Unsafe Study helper grants: %',signature; end if;
 end loop;
 foreach signature in array array[
 'public.study_create(text,text,text,text,text,uuid[],uuid)','public.study_invite(uuid,uuid[],uuid)',
 'public.study_respond(uuid,uuid,boolean,uuid)','public.study_leave(uuid,uuid)',
 'public.study_invitation_candidates(text,text,text,text,uuid,text)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',signature);
  execute format('grant execute on function %s to authenticated',signature);
  if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('service_role',signature,'EXECUTE') or not has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'Unsafe Study RPC grants: %',signature; end if;
 end loop;
 foreach signature in array array['public.create_study_group(text,text,text,uuid[])','public.respond_to_study_group_invite(uuid,boolean)','public.leave_study_group(uuid)'] loop
  if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE') or has_function_privilege('service_role',signature,'EXECUTE') then raise exception 'Unsafe legacy Study grants: %',signature; end if;
 end loop;
end; $$;
commit;
