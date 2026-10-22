-- Prepared for manual owner review/application. Never applied by the application.
begin;

alter table public.user_courses add constraint user_courses_id_owner_key unique (id, user_id);

create table public.academic_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id),
 user_course_id uuid not null,
 title text not null check (title = btrim(title) and length(title) between 1 and 200),
 type text not null check (type in ('assignment','exam','quiz','project')),
 due_date date not null check (isfinite(due_date) and due_date between date '0001-01-01' and date '9999-12-31'),
 due_time time check (due_time < time '24:00'),
 notes text check (notes = btrim(notes) and length(notes) between 1 and 5000),
 location text check (location = btrim(location) and length(location) between 1 and 200),
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint academic_items_course_owner_fkey foreign key (user_course_id, user_id)
   references public.user_courses(id, user_id) on delete restrict on update restrict
);
create index academic_items_agenda on public.academic_items(user_id, due_date, due_time);
create index academic_items_course on public.academic_items(user_course_id, user_id);
create trigger academic_items_updated before update on public.academic_items
 for each row execute function private.touch_updated_at();

create function private.academic_item_owner_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.user_id is distinct from old.user_id then
   raise exception 'Academic item ownership cannot be changed' using errcode = '42501';
 end if;
 return new;
end; $$;
revoke all on function private.academic_item_owner_immutable() from public;
create trigger academic_items_owner_immutable before update on public.academic_items
 for each row execute function private.academic_item_owner_immutable();

alter table public.academic_items enable row level security;
create policy academic_items_owner on public.academic_items to authenticated
 using (user_id = (select auth.uid()) and (select private.is_eligible())
   and exists (select 1 from public.user_courses c where c.id = user_course_id and c.user_id = (select auth.uid())))
 with check (user_id = (select auth.uid()) and (select private.is_eligible())
   and exists (select 1 from public.user_courses c where c.id = user_course_id and c.user_id = (select auth.uid())));
revoke all on public.academic_items from public, anon, authenticated;
grant select, insert, update, delete on public.academic_items to authenticated;
commit;
