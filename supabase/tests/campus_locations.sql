-- Disposable local PostgreSQL ONLY, after bootstrap + minimal prerequisites + campus migrations.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
create function pg_temp.reject(sql text, expected text) returns void language plpgsql as $$
begin
 begin execute sql; exception when others then if sqlstate = expected then return; end if; raise; end;
 raise exception 'Expected rejection: %',sql;
end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000031','editor@stonybrook.edu',now()),
 ('00000000-0000-0000-0000-000000000032','student@stonybrook.edu',now()),
 ('00000000-0000-0000-0000-000000000033','outsider@example.com',now());
insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true)
 from auth.users where id::text like '%00000000003_';
insert into private.campus_location_editors values
 ('00000000-0000-0000-0000-000000000031'),('00000000-0000-0000-0000-000000000033');
select pg_temp.assert(not has_table_privilege('authenticated','private.campus_location_editors','SELECT'), 'membership private');
select pg_temp.assert(not has_table_privilege('authenticated','public.campus_locations','TRUNCATE'), 'no truncate');
select pg_temp.assert(not has_table_privilege('authenticated','public.campus_locations','TRIGGER'), 'no trigger privilege');
select pg_temp.assert(not has_function_privilege('anon','public.campus_locations_can_manage()','EXECUTE'), 'anon cannot probe capability');
select pg_temp.assert(not has_function_privilege('authenticated','private.bump_campus_location_revision()','EXECUTE'), 'trigger function not directly granted');
select pg_temp.assert(not has_column_privilege('authenticated','public.campus_locations','revision','UPDATE'), 'revision not client writable');
select pg_temp.assert(has_column_privilege('authenticated','public.campus_locations','name','UPDATE'), 'editable column granted');
select pg_temp.assert((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='private.can_manage_campus_locations()'::regprocedure), 'private capability has fixed definer context');

-- Historical fixture makes the timestamp trigger observable within this transaction.
insert into public.campus_locations(name,category,latitude,longitude,directions,status,source_note,verified_at,created_at,updated_at)
 values ('Printer','printer',40.91,-73.12,'Second floor','published','Checked on site',now(),'2000-01-01Z','2000-01-01Z');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
select pg_temp.assert(public.campus_locations_can_manage(), 'eligible editor capability');
insert into public.campus_locations(name,category,latitude,longitude,directions,status,source_note,verified_at)
 values ('Water','drinking_water',40.91,-73.12,'Ground floor','published','Checked on site',now()),
 ('Residential draft','microwave',40.93,-73.13,'Common room','draft',null,null);
select pg_temp.assert((select count(*)=3 from public.campus_locations),'editor sees all, duplicates/residential accepted');
select pg_temp.assert((select description is null and revision=1 and created_at is not null from public.campus_locations where name='Printer'),'generated fields and optional description');
select pg_temp.reject($q$update public.campus_locations set directions=' '$q$,'23514');
select pg_temp.reject($q$update public.campus_locations set name=' '$q$,'23514');
select pg_temp.reject($q$update public.campus_locations set description=repeat('x',2001)$q$,'23514');
select pg_temp.reject($q$update public.campus_locations set category='unknown'$q$,'23514');
select pg_temp.reject($q$update public.campus_locations set latitude='NaN'$q$,'23514');
select pg_temp.reject($q$update public.campus_locations set longitude='Infinity'$q$,'23514');
select pg_temp.reject($q$update public.campus_locations set latitude=-91$q$,'23514');
select pg_temp.reject($q$update public.campus_locations set source_url='javascript:alert(1)'$q$,'23514');
select pg_temp.reject($q$update public.campus_locations set source_url='https://'$q$,'23514');
select pg_temp.reject($q$update public.campus_locations set status='published' where name='Residential draft'$q$,'23514');
select pg_temp.reject($q$update public.campus_locations set verified_at='infinity'$q$,'23514');
select pg_temp.reject($q$update public.campus_locations set revision=99$q$,'42501');
select pg_temp.reject($q$update public.campus_locations set id=gen_random_uuid()$q$,'42501');
select pg_temp.reject($q$update public.campus_locations set created_at=now()$q$,'42501');
select pg_temp.reject($q$update public.campus_locations set updated_at=now()$q$,'42501');
select pg_temp.reject($q$insert into public.campus_locations(id,name,category,latitude,longitude,directions) values(gen_random_uuid(),'Spoof','printer',0,0,'Here')$q$,'42501');
select pg_temp.reject($q$insert into public.campus_locations(revision,name,category,latitude,longitude,directions) values(99,'Spoof','printer',0,0,'Here')$q$,'42501');
select pg_temp.reject($q$insert into public.campus_locations(created_at,name,category,latitude,longitude,directions) values(now(),'Spoof','printer',0,0,'Here')$q$,'42501');
select pg_temp.reject($q$insert into public.campus_locations(updated_at,name,category,latitude,longitude,directions) values(now(),'Spoof','printer',0,0,'Here')$q$,'42501');
select pg_temp.reject($q$insert into private.campus_location_editors values ('00000000-0000-0000-0000-000000000032')$q$,'42501');
select pg_temp.reject($q$select public.campus_locations_can_manage('00000000-0000-0000-0000-000000000031')$q$,'42883');

-- Store the verified timestamp outside the update and check revision-based CAS.
select verified_at as original_verified from public.campus_locations where name='Printer' \gset
update public.campus_locations set description='Corrected' where name='Printer' and revision=1;
select pg_temp.assert((select revision=2 and description='Corrected' and verified_at=:'original_verified'::timestamptz from public.campus_locations where name='Printer'),'edit persists and preserves verification');
select pg_temp.assert((select updated_at=now() and created_at='2000-01-01Z'::timestamptz from public.campus_locations where name='Printer'),'timestamp trigger runs without changing creation time');
with changed as (update public.campus_locations set description='Stale' where name='Printer' and revision=1 returning id)
 select pg_temp.assert((select count(*)=0 from changed),'stale update cannot overwrite');
with removed as (delete from public.campus_locations where name='Printer' and revision=1 returning id)
 select pg_temp.assert((select count(*)=0 from removed),'stale removal cannot delete');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000032',true);
select pg_temp.assert(not public.campus_locations_can_manage(),'student capability false');
select pg_temp.assert((select count(*)=2 from public.campus_locations),'student sees only published');
select pg_temp.reject($q$insert into public.campus_locations(name,category,latitude,longitude,directions) values('Bad','printer',0,0,'Here')$q$,'42501');
with changed as (update public.campus_locations set name='Stolen' returning id)
 select pg_temp.assert((select count(*)=0 from changed),'student update denied by RLS');
with removed as (delete from public.campus_locations returning id)
 select pg_temp.assert((select count(*)=0 from removed),'student deletion denied by RLS');
select pg_temp.reject('select * from private.campus_location_editors','42501');
select pg_temp.reject('delete from private.campus_location_editors','42501');
select pg_temp.reject('truncate public.campus_locations','42501');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000033',true);
select pg_temp.assert(not public.campus_locations_can_manage(),'ineligible allowlist member cannot edit');
select pg_temp.assert((select count(*)=0 from public.campus_locations),'ineligible cannot read');
select pg_temp.reject($q$insert into public.campus_locations(name,category,latitude,longitude,directions) values('Bad','printer',0,0,'Here')$q$,'42501');
with changed as (update public.campus_locations set name='Bad' returning id)
 select pg_temp.assert((select count(*)=0 from changed),'ineligible update denied');
with removed as (delete from public.campus_locations returning id)
 select pg_temp.assert((select count(*)=0 from removed),'ineligible delete denied');

reset role;
delete from private.campus_location_editors where user_id='00000000-0000-0000-0000-000000000031';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
select pg_temp.assert(not public.campus_locations_can_manage(),'revocation effective without JWT refresh');
select pg_temp.assert((select count(*)=2 from public.campus_locations),'revoked editor loses drafts');
select pg_temp.reject($q$insert into public.campus_locations(name,category,latitude,longitude,directions) values('Bad','printer',0,0,'Here')$q$,'42501');
with changed as (update public.campus_locations set name='Bad' returning id)
 select pg_temp.assert((select count(*)=0 from changed),'revoked update denied');
with removed as (delete from public.campus_locations returning id)
 select pg_temp.assert((select count(*)=0 from removed),'revoked delete denied');
reset role;
insert into private.campus_location_editors values ('00000000-0000-0000-0000-000000000031');
set local role authenticated;
with removed as (delete from public.campus_locations where name='Printer' and revision=2 returning id)
 select pg_temp.assert((select count(*)=1 from removed),'editor confirmed delete');
select pg_temp.assert((select count(*)=2 from public.campus_locations),'other resources retained');
reset role;
set local role anon;
select pg_temp.reject('select * from public.campus_locations','42501');
select pg_temp.reject('insert into public.campus_locations(name) values (''Bad'')','42501');
select pg_temp.reject('update public.campus_locations set name=''Bad''','42501');
select pg_temp.reject('delete from public.campus_locations','42501');
select pg_temp.reject('select public.campus_locations_can_manage()','42501');
reset role;
rollback;
