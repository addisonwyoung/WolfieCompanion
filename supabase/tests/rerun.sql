-- Isolated test database only: bootstrap.sql and the initial migration must exist.
\set ON_ERROR_STOP on
insert into auth.users(id,email,email_confirmed_at) values ('00000000-0000-0000-0000-000000000006','rerun@stonybrook.edu',now());
insert into auth.identities values ('00000000-0000-0000-0000-000000000006','google','{"email":"rerun@stonybrook.edu","email_verified":true}');
update public.profiles set name='Preserve saved edits',major='Mathematics' where id='00000000-0000-0000-0000-000000000006';
insert into public.user_courses(id,user_id,course_code) values ('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000006','CSE 310');
insert into public.user_course_sections values ('00000000-0000-0000-0000-000000000106','01');
insert into storage.objects(bucket_id,name) values ('avatars','00000000-0000-0000-0000-000000000006/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png');
\ir ../migrations/202610160001_accounts.sql
\ir ../migrations/202610160001_accounts.sql
do $$ begin
 if not exists (select 1 from public.profiles where id='00000000-0000-0000-0000-000000000006' and name='Preserve saved edits' and major='Mathematics') then raise exception 'Profile data lost on rerun'; end if;
 if (select count(*) from public.user_courses where user_id='00000000-0000-0000-0000-000000000006') <> 1 then raise exception 'Courses lost or duplicated on rerun'; end if;
 if not exists (select 1 from public.user_course_sections where user_course_id='00000000-0000-0000-0000-000000000106' and section='01') then raise exception 'Section lost on rerun'; end if;
 if not exists (select 1 from storage.objects where name='00000000-0000-0000-0000-000000000006/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png') then raise exception 'Stored object lost on rerun'; end if;
 if (select public from storage.buckets where id='avatars') then raise exception 'Avatar bucket became public'; end if;
end $$;
delete from storage.objects where name='00000000-0000-0000-0000-000000000006/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png';
delete from auth.identities where user_id='00000000-0000-0000-0000-000000000006';
delete from auth.users where id='00000000-0000-0000-0000-000000000006';
