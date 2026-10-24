-- Minimal Campus Explorer prerequisites for the existing shared database.
-- Owner review and final hosted verification are required before manual execution.
-- Apply before 202610230001_campus_locations.sql, not the full accounts migration.
-- Fail on an existing private schema rather than replace unexpected objects.
begin;

create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- Only trusted Auth records establish eligibility; profile metadata is never authority.
create function private.is_eligible() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
   select 1 from auth.users u join auth.identities i on i.user_id = u.id
   where u.id = auth.uid() and u.email_confirmed_at is not null
     and lower(split_part(u.email, '@', 2)) = 'stonybrook.edu'
     and u.email ~ '^[^@]+@[^@]+$' and i.provider = 'google'
     and i.identity_data->>'email_verified' = 'true'
     and lower(i.identity_data->>'email') = lower(u.email)
 );
$$;
revoke all on function private.is_eligible() from public, anon, authenticated;
grant execute on function private.is_eligible() to authenticated;

-- Only the later Campus Explorer migration attaches this function to a table.
create function private.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 new.updated_at = pg_catalog.now();
 return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

commit;
