-- Isolated local Supabase/Postgres test only. Requires academic reminders,
-- and migrations through 202611280002_delete_owned_review_on_course_removal.sql.
-- NEVER run against hosted data.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000071','course-owner@stonybrook.edu',now(),'{}'),
 ('00000000-0000-0000-0000-000000000072','course-other@stonybrook.edu',now(),'{}');
insert into auth.identities(user_id,provider,identity_data)
select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users
where id in ('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000072');
insert into public.course_offerings(id,course_code,course_number,course_title,professor_name,
  professor_first_name,professor_last_name,section,semester,academic_year,catalog_verified)
select 'zzz-992-test','ZZZ 992','992','Test Course','Unlisted Professor',
  'Unlisted','Professor','01',semester,academic_year,true
from private.resolve_current_semester(now());

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000071',true);
select public.ensure_profile();
select pg_temp.assert(public.account_is_eligible(),'owner is eligible');
select public.save_enrollments('[{"code":"ZZZ 990","section":"01","professor_first_name":"Unlisted","professor_last_name":"Professor"}]');
select set_config('test.old_enrollment',(select enrollment_id::text from public.my_current_enrollments() where code='ZZZ 990'),true);
select set_config('test.old_course',(select legacy_course_id::text from public.my_current_enrollments() where code='ZZZ 990'),true);
select pg_temp.assert((select verification_status='pending' from public.my_current_enrollments() where code='ZZZ 990'),'unknown course stays pending');

insert into public.academic_items(user_course_id,title,type,due_date)
values(current_setting('test.old_course')::uuid,'Keep this assignment','assignment',current_date+5);

-- A different owner cannot edit another student's enrollment.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000072',true);
do $$ begin
  begin perform public.edit_current_course_enrollment(current_setting('test.old_enrollment')::uuid,'ZZZ 991','02','Professor','Unlisted');
    raise exception 'another owner edited the course';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000071',true);
select public.save_enrollments('[{"code":"ZZZ 991","section":"02","professor_first_name":"Unlisted","professor_last_name":"Professor"}]');
-- The duplicate edit above must raise and roll back; catch it explicitly and
-- confirm the old enrollment is still current before correcting the course.
do $$ begin
  begin perform public.edit_current_course_enrollment(current_setting('test.old_enrollment')::uuid,'ZZZ 991','03','Unlisted','Professor');
    raise exception 'duplicate course code was accepted';
  exception when unique_violation then null; end;
end $$;
select pg_temp.assert((select count(*)=1 from public.my_current_enrollments() where enrollment_id=current_setting('test.old_enrollment')::uuid),'duplicate attempt leaves original active');

select public.edit_current_course_enrollment(current_setting('test.old_enrollment')::uuid,'ZZZ 992','01','Unlisted','Professor');
select pg_temp.assert(not exists(select from public.my_current_enrollments() where code='ZZZ 990'),'old course is absent after edit');
select pg_temp.assert((select verification_status='pending' from public.my_current_enrollments() where code='ZZZ 992'),'edited unrecognized offering remains pending');
select pg_temp.assert((select u.course_code='ZZZ 992' and a.title='Keep this assignment'
  from public.academic_items a join public.user_courses u on u.id=a.user_course_id),'assignment follows corrected course');

select set_config('test.new_enrollment',(select enrollment_id::text from public.my_current_enrollments() where code='ZZZ 992'),true);
-- Link a test-only verified offering so the removal RPC can target its review.
reset role;
update public.course_enrollments set verification_status='verified',course_offering_id='zzz-992-test'
where id=current_setting('test.new_enrollment')::uuid;
insert into public.course_reviews(offering_id,user_id,weekly_hours,difficulty,review)
values('zzz-992-test','00000000-0000-0000-0000-000000000071',5,3,'Owner review to remove'),
      ('zzz-992-test','00000000-0000-0000-0000-000000000072',4,2,'Other owner review to keep');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000071',true);
select set_config('test.new_course',(select legacy_course_id::text from public.my_current_enrollments() where enrollment_id=current_setting('test.new_enrollment')::uuid),true);
select set_config('test.item_id',(select id::text from public.academic_items where user_course_id=current_setting('test.new_course')::uuid and title='Keep this assignment'),true);
select public.remove_current_course_enrollment(current_setting('test.new_enrollment')::uuid);
select pg_temp.assert(not exists(select from public.my_current_enrollments() where enrollment_id=current_setting('test.new_enrollment')::uuid),'removed membership is hidden from current enrollments');
reset role;
select pg_temp.assert(not exists(select from public.academic_items where id=current_setting('test.item_id')::uuid),'course assignment is deleted on removal');
select pg_temp.assert(not exists(select from public.academic_reminder_occurrences where item_id=current_setting('test.item_id')::uuid),'course reminders cascade with assignment deletion');
select pg_temp.assert(not exists(select from public.course_reviews where user_id='00000000-0000-0000-0000-000000000071' and offering_id='zzz-992-test'),'owner review for removed offering is deleted');
select pg_temp.assert(exists(select from public.course_reviews where user_id='00000000-0000-0000-0000-000000000072' and offering_id='zzz-992-test'),'another owner review remains untouched');

-- A removed identity can be added again because only active enrollments take
-- part in current uniqueness and duplicate-course checks.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000071',true);
select public.save_enrollments('[{"code":"ZZZ 992","section":"01","professor_first_name":"Unlisted","professor_last_name":"Professor"}]');
select pg_temp.assert((select count(*)=1 from public.my_current_enrollments() where code='ZZZ 992'),'removed course can be added again');

reset role;
select pg_temp.assert(not private.is_current_course_member('00000000-0000-0000-0000-000000000071','ZZZ 990'),'revoked course code no longer grants membership');
select pg_temp.assert(not private.is_current_course_professor_member('00000000-0000-0000-0000-000000000071','ZZZ 990','01','Unlisted','Professor'),'revoked professor/section no longer grants access');
rollback;
