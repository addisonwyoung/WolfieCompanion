-- Additive migration for manual owner review/application; never applied by the app.
begin;

create table private.campus_location_editors (
 user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on private.campus_location_editors from public, anon, authenticated;
alter table private.campus_location_editors enable row level security;

create function private.can_manage_campus_locations() returns boolean
language sql stable security definer set search_path = '' as $$
 select private.is_eligible() and exists (
   select 1 from private.campus_location_editors where user_id = auth.uid()
 );
$$;
revoke all on function private.can_manage_campus_locations() from public, anon;
grant execute on function private.can_manage_campus_locations() to authenticated;

create function public.campus_locations_can_manage() returns boolean
language sql stable security invoker set search_path = '' as $$
 select private.can_manage_campus_locations();
$$;
revoke all on function public.campus_locations_can_manage() from public, anon;
grant execute on function public.campus_locations_can_manage() to authenticated;

create table public.campus_locations (
 id uuid primary key default gen_random_uuid(),
 name text not null check (name = btrim(name) and length(name) between 1 and 160),
 category text not null check (category in ('microwave','outdoor_lounge','study_spot','printer','drinking_water')),
 -- PostgreSQL NaN sorts above finite values, so these ranges also reject NaN/infinity.
 latitude double precision not null check (latitude between -90 and 90),
 longitude double precision not null check (longitude between -180 and 180),
 building text check (building = btrim(building) and length(building) between 1 and 160),
 floor text check (floor = btrim(floor) and length(floor) between 1 and 40),
 directions text not null check (directions = btrim(directions) and length(directions) between 1 and 1000),
 description text check (description = btrim(description) and length(description) between 1 and 2000),
 access_note text check (access_note = btrim(access_note) and length(access_note) between 1 and 500),
 source_url text check (length(source_url) <= 2000 and source_url ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$'),
 source_note text check (source_note = btrim(source_note) and length(source_note) between 1 and 1000),
 verified_at timestamptz check (isfinite(verified_at)),
 status text not null default 'draft' check (status in ('draft','published')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 revision integer not null default 1 check (revision > 0),
 constraint campus_locations_publication check (status <> 'published' or
   (verified_at is not null and (source_url is not null or source_note is not null)))
);

create function private.bump_campus_location_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
 new.revision := old.revision + 1;
 return new;
end; $$;
revoke all on function private.bump_campus_location_revision() from public, anon, authenticated;
-- The migration owner can attach this trigger without granting client EXECUTE.
-- Trigger assignment to NEW does not require client UPDATE on revision; the
-- column grants below still prohibit clients from supplying generated values.
create trigger campus_locations_revision before update on public.campus_locations
 for each row execute function private.bump_campus_location_revision();
create trigger campus_locations_updated before update on public.campus_locations
 for each row execute function private.touch_updated_at();

alter table public.campus_locations enable row level security;
create policy campus_locations_read on public.campus_locations for select to authenticated
 using ((select private.is_eligible()) and (status = 'published' or (select private.can_manage_campus_locations())));
create policy campus_locations_insert on public.campus_locations for insert to authenticated
 with check ((select private.can_manage_campus_locations()));
create policy campus_locations_update on public.campus_locations for update to authenticated
 using ((select private.can_manage_campus_locations())) with check ((select private.can_manage_campus_locations()));
create policy campus_locations_delete on public.campus_locations for delete to authenticated
 using ((select private.can_manage_campus_locations()));

revoke all on public.campus_locations from public, anon, authenticated;
grant select, delete on public.campus_locations to authenticated;
-- Generated ID, timestamps and revision cannot be supplied or changed by clients.
-- Revision conflict protection requires the caller's UPDATE/DELETE predicate
-- to include both id and the revision read previously (as the typed API does).
grant insert (name,category,latitude,longitude,building,floor,directions,description,access_note,source_url,source_note,verified_at,status),
 update (name,category,latitude,longitude,building,floor,directions,description,access_note,source_url,source_note,verified_at,status)
 on public.campus_locations to authenticated;
commit;
