-- Owner-reviewed manual application only. Requires accounts and academic_items.
begin;
create function private.valid_reminder_offsets(v text[]) returns boolean language sql immutable set search_path='' as $$
 select v is not null and cardinality(v)<=4 and array_position(v,null) is null and v <@ array['week','three_days','day','three_hours']::text[] and cardinality(v)=(select count(distinct x) from unnest(v)x);
$$;
revoke all on function private.valid_reminder_offsets(text[]) from public,anon,authenticated;
-- CHECK constraints need caller execution; this pure validation helper exposes no data.
grant execute on function private.valid_reminder_offsets(text[]) to authenticated;
create table public.academic_reminder_preferences(
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 assignment text[] not null default array['day'], exam text[] not null default array['week','day'],
 quiz text[] not null default array['day'], project text[] not null default array['week','day'],
 check(private.valid_reminder_offsets(assignment) and private.valid_reminder_offsets(exam) and private.valid_reminder_offsets(quiz) and private.valid_reminder_offsets(project))
);
alter table public.academic_reminder_preferences enable row level security;
create policy reminder_preferences_owner on public.academic_reminder_preferences to authenticated using(user_id=auth.uid() and private.is_eligible()) with check(user_id=auth.uid() and private.is_eligible());
revoke all on public.academic_reminder_preferences from public,anon,authenticated;
grant select on public.academic_reminder_preferences to authenticated;
-- All preference writes through scoped RPC; owner cannot be reassigned.
alter table public.academic_items add column reminder_offsets text[] default null,
 add column reminder_revision bigint not null default 1,
 add column reminder_activated_at timestamptz not null default clock_timestamp(),
 add constraint academic_reminder_offsets_valid check(reminder_offsets is null or (private.valid_reminder_offsets(reminder_offsets) and (due_time is not null or not ('three_hours'=any(reminder_offsets)))));
revoke insert,update on public.academic_items from authenticated;
grant insert(id,user_course_id,title,type,due_date,due_time,notes,location,completed_at,reminder_offsets),
 update(user_course_id,title,type,due_date,due_time,notes,location,completed_at,reminder_offsets) on public.academic_items to authenticated;
create sequence private.academic_delivery_order;
create table public.academic_reminder_occurrences(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 item_id uuid not null references public.academic_items(id) on delete cascade,
 revision bigint not null, offset_key text not null check(offset_key in('week','three_days','day','three_hours')),
 due_at timestamptz not null, activated_at timestamptz not null,
 state text not null check(state in('scheduled','delivered','skipped','cancelled')),
 delivered_at timestamptz, delivery_order bigint unique, read_at timestamptz, dismissed_at timestamptz,
 title text not null, course_code text not null, item_type text not null, deadline_date date not null, deadline_time time,
 unique(item_id,revision,offset_key)
);
create index academic_reminder_pending on public.academic_reminder_occurrences(user_id,due_at) where state='scheduled';
create index academic_reminder_inbox on public.academic_reminder_occurrences(user_id,delivered_at desc,id desc) where state='delivered' and dismissed_at is null;
alter table public.academic_reminder_occurrences enable row level security;
create policy reminder_occurrence_owner on public.academic_reminder_occurrences for select to authenticated using(user_id=auth.uid() and private.is_eligible());
revoke all on public.academic_reminder_occurrences from public,anon,authenticated;
grant select on public.academic_reminder_occurrences to authenticated;

create function private.reminder_lock(p_owner uuid) returns void language sql volatile set search_path='' as $$ select pg_advisory_xact_lock(hashtextextended('academic-reminders:'||p_owner::text,0)); $$;
create function private.reminder_instant(p_date date,p_time time,p_offset text) returns timestamptz language sql immutable set search_path='' as $$
 select case when p_time is null then ((p_date-case p_offset when 'week' then 7 when 'three_days' then 3 else 1 end)+time '09:00') at time zone 'America/New_York'
 else ((p_date+p_time) at time zone 'America/New_York')-make_interval(hours=>case p_offset when 'week' then 168 when 'three_days' then 72 when 'day' then 24 else 3 end) end;
$$;
create function private.reminder_schedule(p_item public.academic_items,p_now timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare prefs public.academic_reminder_preferences; offsets text[]; k text; instant timestamptz; code text;
begin
 select * into prefs from public.academic_reminder_preferences where user_id=p_item.user_id;
 offsets:=coalesce(p_item.reminder_offsets,case p_item.type when 'exam' then coalesce(prefs.exam,array['week','day']) when 'project' then coalesce(prefs.project,array['week','day']) when 'quiz' then coalesce(prefs.quiz,array['day']) else coalesce(prefs.assignment,array['day']) end);
 if p_item.due_time is null then offsets:=array_remove(offsets,'three_hours');end if;
 select course_code into code from public.user_courses where id=p_item.user_course_id;
 update public.academic_reminder_occurrences set title=p_item.title,course_code=code,item_type=p_item.type where item_id=p_item.id and revision=p_item.reminder_revision;
 update public.academic_reminder_occurrences set state='cancelled',dismissed_at=case when delivered_at is not null then coalesce(dismissed_at,p_now) else dismissed_at end
 where item_id=p_item.id and (revision<>p_item.reminder_revision or p_item.completed_at is not null);
 update public.academic_reminder_occurrences set state='cancelled' where item_id=p_item.id and state='scheduled' and (not(offset_key=any(offsets)) or not coalesce(prefs.enabled,true));
 if p_item.completed_at is not null or not coalesce(prefs.enabled,true) then return;end if;
 foreach k in array offsets loop
  instant:=private.reminder_instant(p_item.due_date,p_item.due_time,k);
  insert into public.academic_reminder_occurrences(user_id,item_id,revision,offset_key,due_at,activated_at,state,title,course_code,item_type,deadline_date,deadline_time)
  values(p_item.user_id,p_item.id,p_item.reminder_revision,k,instant,p_now,case when instant>p_now then 'scheduled' else 'skipped' end,p_item.title,code,p_item.type,p_item.due_date,p_item.due_time)
  on conflict(item_id,revision,offset_key) do update set state=case when academic_reminder_occurrences.due_at>p_now then 'scheduled' else 'skipped' end,activated_at=p_now
  where academic_reminder_occurrences.state='cancelled' and academic_reminder_occurrences.delivered_at is null;
 end loop;
end; $$;
create function private.reminder_item_before() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.due_date,new.due_time) is distinct from (old.due_date,old.due_time) then new.reminder_revision:=old.reminder_revision+1;new.reminder_activated_at:=clock_timestamp();end if;
 return new;
end; $$;
create function private.reminder_item_after() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.reminder_lock(new.user_id);
 perform private.reminder_schedule(new,clock_timestamp());return new;
end; $$;
create trigger academic_reminder_before before update on public.academic_items for each row execute function private.reminder_item_before();
create trigger academic_reminder_after after insert or update on public.academic_items for each row execute function private.reminder_item_after();
create function private.reminder_preferences_after() returns trigger language plpgsql security definer set search_path='' as $$
declare item public.academic_items;
begin
 perform private.reminder_lock(new.user_id);
 for item in select * from public.academic_items where user_id=new.user_id loop perform private.reminder_schedule(item,clock_timestamp());end loop;
 return new;
end; $$;
create trigger academic_preferences_after after insert or update on public.academic_reminder_preferences for each row execute function private.reminder_preferences_after();
-- Existing coursework gets future schedules only; no historical delivery/backfill.
do $$ declare item public.academic_items;begin for item in select * from public.academic_items loop perform private.reminder_schedule(item,clock_timestamp());end loop;end $$;

create function private.reminder_authorize() returns uuid language plpgsql stable security definer set search_path='' as $$
begin if auth.uid() is null or not private.is_eligible() then raise exception 'Eligible student required' using errcode='42501';end if;return auth.uid();end; $$;
create function public.academic_reminder_settings() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.reminder_authorize();result jsonb;
begin
 select to_jsonb(p)-'user_id' into result from public.academic_reminder_preferences p where user_id=caller;
 return coalesce(result,'{"enabled":true,"assignment":["day"],"exam":["week","day"],"quiz":["day"],"project":["week","day"]}'::jsonb);
end; $$;
create function public.academic_reminder_settings_save(p_settings jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.reminder_authorize();v public.academic_reminder_preferences;
begin
 if p_settings is null or jsonb_typeof(p_settings)<>'object' or (select count(*) from jsonb_object_keys(p_settings))<>5 or jsonb_typeof(p_settings->'enabled')<>'boolean' then raise exception 'Invalid settings' using errcode='22023';end if;
 select * into v from jsonb_populate_record(null::public.academic_reminder_preferences,p_settings);
 if v.enabled is null or not coalesce(private.valid_reminder_offsets(v.assignment) and private.valid_reminder_offsets(v.exam) and private.valid_reminder_offsets(v.quiz) and private.valid_reminder_offsets(v.project),false) then raise exception 'Invalid offsets' using errcode='22023';end if;
 insert into public.academic_reminder_preferences(user_id,enabled,assignment,exam,quiz,project) values(caller,v.enabled,v.assignment,v.exam,v.quiz,v.project)
 on conflict(user_id) do update set enabled=excluded.enabled,assignment=excluded.assignment,exam=excluded.exam,quiz=excluded.quiz,project=excluded.project;
 return public.academic_reminder_settings();
end; $$;
create function public.academic_reminders_refresh() returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.reminder_authorize();moment timestamptz;row public.academic_reminder_occurrences;
begin
 perform private.reminder_lock(caller);moment:=clock_timestamp();
 -- Queries following the owner lock see committed source state under READ COMMITTED.
 update public.academic_reminder_occurrences o set state='skipped' from public.academic_items i
 where o.user_id=caller and o.item_id=i.id and o.state='scheduled' and o.due_at<=moment and
 (i.completed_at is not null or (i.due_time is null and i.due_date<(moment at time zone 'America/New_York')::date) or (i.due_time is not null and (i.due_date+i.due_time) at time zone 'America/New_York'<moment));
 for row in select distinct on(item_id) * from public.academic_reminder_occurrences where user_id=caller and state='scheduled' and due_at<=moment order by item_id,due_at desc,id desc loop
  update public.academic_reminder_occurrences set state='skipped' where user_id=caller and item_id=row.item_id and state='scheduled' and due_at<=moment and id<>row.id;
  update public.academic_reminder_occurrences set state='delivered',delivered_at=moment,delivery_order=nextval('private.academic_delivery_order') where id=row.id;
 end loop;
end; $$;
create function private.reminder_json(o public.academic_reminder_occurrences) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',o.id,'item_id',o.item_id,'title',o.title,'course_code',o.course_code,'item_type',o.item_type,'offset_key',o.offset_key,'due_at',o.due_at,'delivered_at',o.delivered_at,'read_at',o.read_at,'deadline_date',o.deadline_date,'deadline_time',o.deadline_time);
$$;
create function public.academic_reminders_list(p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.reminder_authorize();rows jsonb;unread bigint;
begin
 if (p_before is null)<>(p_before_id is null) or (p_before_id is not null and not exists(select 1 from public.academic_reminder_occurrences where id=p_before_id and user_id=caller and delivered_at=p_before)) then raise exception 'Invalid cursor' using errcode='22023';end if;
 select coalesce(jsonb_agg(x.row order by x.delivered_at desc,x.id desc),'[]'::jsonb) into rows from (select o.id,o.delivered_at,private.reminder_json(o) row from public.academic_reminder_occurrences o where user_id=caller and state='delivered' and dismissed_at is null and (p_before is null or (delivered_at,id)<(p_before,p_before_id)) order by delivered_at desc,id desc limit 20)x;
 select count(*) into unread from public.academic_reminder_occurrences where user_id=caller and state='delivered' and dismissed_at is null and read_at is null;
 return jsonb_build_object('rows',rows,'unread',unread);
end; $$;
create function public.academic_reminder_read(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.reminder_authorize();begin perform private.reminder_lock(caller);update public.academic_reminder_occurrences set read_at=coalesce(read_at,clock_timestamp()) where id=p_id and user_id=caller and delivered_at is not null;if not found then raise exception 'Reminder unavailable' using errcode='42501';end if;end; $$;
create function public.academic_reminder_clear(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.reminder_authorize();begin perform private.reminder_lock(caller);update public.academic_reminder_occurrences set dismissed_at=coalesce(dismissed_at,clock_timestamp()) where id=p_id and user_id=caller and delivered_at is not null;if not found then raise exception 'Reminder unavailable' using errcode='42501';end if;end; $$;
create function public.academic_reminders_bound() returns bigint language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.reminder_authorize();bound bigint;begin perform private.reminder_lock(caller);select coalesce(max(delivery_order),0) into bound from public.academic_reminder_occurrences where user_id=caller;return bound;end; $$;
create function public.academic_reminders_clear_all(p_bound bigint) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.reminder_authorize();begin if p_bound is null or p_bound<0 then raise exception 'Invalid clear boundary' using errcode='22023';end if;perform private.reminder_lock(caller);update public.academic_reminder_occurrences set dismissed_at=coalesce(dismissed_at,clock_timestamp()) where user_id=caller and delivered_at is not null and delivery_order<=p_bound;end; $$;
-- Atomic single-statement item writes already include trigger scheduling; retain the existing RLS CRUD boundary.
revoke all on function private.reminder_lock(uuid),private.reminder_instant(date,time,text),private.reminder_schedule(public.academic_items,timestamptz),private.reminder_item_before(),private.reminder_item_after(),private.reminder_preferences_after(),private.reminder_authorize(),private.reminder_json(public.academic_reminder_occurrences) from public,anon,authenticated;
revoke all on sequence private.academic_delivery_order from public,anon,authenticated;
revoke all on function public.academic_reminder_settings(),public.academic_reminder_settings_save(jsonb),public.academic_reminders_refresh(),public.academic_reminders_list(timestamptz,uuid),public.academic_reminder_read(uuid),public.academic_reminder_clear(uuid),public.academic_reminders_bound(),public.academic_reminders_clear_all(bigint) from public,anon,authenticated;
grant execute on function public.academic_reminder_settings(),public.academic_reminder_settings_save(jsonb),public.academic_reminders_refresh(),public.academic_reminders_list(timestamptz,uuid),public.academic_reminder_read(uuid),public.academic_reminder_clear(uuid),public.academic_reminders_bound(),public.academic_reminders_clear_all(bigint) to authenticated;
commit;
