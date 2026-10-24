-- Disposable local PostgreSQL ONLY, after bootstrap + minimal campus prerequisites.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;

select pg_temp.assert(has_schema_privilege('authenticated','private','USAGE'), 'authenticated helper access');
select pg_temp.assert(not has_schema_privilege('authenticated','private','CREATE'), 'clients cannot create private objects');
select pg_temp.assert(not has_schema_privilege('anon','private','USAGE'), 'anonymous schema access denied');
select pg_temp.assert(has_function_privilege('authenticated','private.is_eligible()','EXECUTE'), 'authenticated eligibility execution');
select pg_temp.assert(not has_function_privilege('anon','private.is_eligible()','EXECUTE'), 'anonymous eligibility execution denied');
select pg_temp.assert(not has_function_privilege('authenticated','private.touch_updated_at()','EXECUTE'), 'no direct client trigger execution');
select pg_temp.assert(not has_function_privilege('anon','private.touch_updated_at()','EXECUTE'), 'no anonymous trigger execution');
select pg_temp.assert((select prorettype='boolean'::regtype and prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='private.is_eligible()'::regprocedure), 'eligibility signature and fixed definer context');
select pg_temp.assert((select prorettype='trigger'::regtype and not prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='private.touch_updated_at()'::regprocedure), 'timestamp signature and fixed invoker context');

-- Include user-editable metadata claiming verification; it must not grant eligibility.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000041','Student@StonyBrook.edu',now(),'{}'),
 ('00000000-0000-0000-0000-000000000042','unconfirmed@stonybrook.edu',null,'{}'),
 ('00000000-0000-0000-0000-000000000043','unverified@stonybrook.edu',now(),'{"email_verified":true}'),
 ('00000000-0000-0000-0000-000000000044','mismatch@stonybrook.edu',now(),'{}'),
 ('00000000-0000-0000-0000-000000000045','other@stonybrook.edu',now(),'{}'),
 ('00000000-0000-0000-0000-000000000046','sub@dept.stonybrook.edu',now(),'{}'),
 ('00000000-0000-0000-0000-000000000047','missing@stonybrook.edu',now(),'{"email_verified":true}');
insert into auth.identities(user_id,provider,identity_data) values
 ('00000000-0000-0000-0000-000000000041','google','{"email":"student@stonybrook.edu","email_verified":true}'),
 ('00000000-0000-0000-0000-000000000042','google','{"email":"unconfirmed@stonybrook.edu","email_verified":true}'),
 ('00000000-0000-0000-0000-000000000043','google','{"email":"unverified@stonybrook.edu","email_verified":false}'),
 ('00000000-0000-0000-0000-000000000044','google','{"email":"someoneelse@stonybrook.edu","email_verified":true}'),
 ('00000000-0000-0000-0000-000000000045','email','{"email":"other@stonybrook.edu","email_verified":true}'),
 ('00000000-0000-0000-0000-000000000046','google','{"email":"sub@dept.stonybrook.edu","email_verified":true}');

set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert(not private.is_eligible(), 'no caller is ineligible');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000041',true);
select pg_temp.assert(private.is_eligible(), 'confirmed matching Google identity, case insensitive');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000042',true);
select pg_temp.assert(not private.is_eligible(), 'unconfirmed account denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000043',true);
select pg_temp.assert(not private.is_eligible(), 'unverified Google identity denied despite user metadata');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000044',true);
select pg_temp.assert(not private.is_eligible(), 'mismatched identity email denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000045',true);
select pg_temp.assert(not private.is_eligible(), 'non-Google provider denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000046',true);
select pg_temp.assert(not private.is_eligible(), 'subdomain denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000047',true);
select pg_temp.assert(not private.is_eligible(), 'missing identity denied despite user metadata');
reset role;
rollback;
