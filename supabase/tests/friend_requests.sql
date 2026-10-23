-- Isolated local Postgres only. Never run this script against a hosted project.
-- Requires bootstrap.sql and migrations through course_classmate_recommendations.
\set ON_ERROR_STOP on
create function pg_temp.assert(ok boolean, message text) returns void
language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
\ir ../migrations/202610220004_friend_requests.sql
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('40000000-0000-0000-0000-000000000001','friend-caller@stonybrook.edu',now()),
 ('40000000-0000-0000-0000-000000000002','friend-peer@stonybrook.edu',now()),
 ('40000000-0000-0000-0000-000000000003','friend-outsider@stonybrook.edu',now()),
 ('40000000-0000-0000-0000-000000000004','friend-ineligible@gmail.com',now());
insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id::text like '40000000-%';
insert into public.user_courses(user_id,course_code) values
 ('40000000-0000-0000-0000-000000000001','CSE 310'),
 ('40000000-0000-0000-0000-000000000002','CSE 310'),
 ('40000000-0000-0000-0000-000000000003','AMS 210'),
 ('40000000-0000-0000-0000-000000000004','CSE 310');
insert into public.user_course_sections(user_course_id,section)
 select id,section from public.user_courses cross join (values('01'),('02')) s(section)
 where user_id='40000000-0000-0000-0000-000000000002';
update public.profiles set name='Friend Peer',major='Computer Science',year='Third year',interests=array['Music'],residence_status='dormer',share_year=false,share_interests=false,share_residence_status=false,share_avatar=false where id='40000000-0000-0000-0000-000000000002';
update public.profiles set name='Friend Caller',major='Computer Science' where id='40000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
select pg_temp.assert(public.send_friend_request('CSE310','40000000-0000-0000-0000-000000000002') is not null,'eligible shared-course request created');
do $$ begin
  begin perform public.send_friend_request('CSE 310','40000000-0000-0000-0000-000000000002'); raise exception 'duplicate request accepted';
  exception when unique_violation then null; end;
  begin perform public.send_friend_request('AMS 210','40000000-0000-0000-0000-000000000003'); raise exception 'unrelated course request accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.send_friend_request('CSE 310','40000000-0000-0000-0000-000000000001'); raise exception 'self request accepted';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.assert((select count(*)=0 from public.friend_request_inbox()),'sender cannot see incoming request inbox');
select pg_temp.assert((select relationship='outgoing_pending' from public.course_friend_relationships('CSE 310') where student_id='40000000-0000-0000-0000-000000000002'),'outgoing state returned');
select pg_temp.assert((select count(*)=1 from public.course_recommendation_profiles('CSE 310')),'pending peer remains recommended');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
do $$ begin
  begin perform public.send_friend_request('CSE 310','40000000-0000-0000-0000-000000000001'); raise exception 'reverse pending request accepted';
  exception when unique_violation then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000004',true);
do $$ begin
  begin perform public.send_friend_request('CSE 310','40000000-0000-0000-0000-000000000002'); raise exception 'ineligible caller accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=0 from public.friend_requests),'unrelated student cannot read either participant request');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
select pg_temp.assert((select count(*)=1 and min(sender_name)='Friend Caller' from public.friend_request_inbox()),'only incoming pending request appears');
select pg_temp.assert((public.get_friend_profile('40000000-0000-0000-0000-000000000001'::uuid)->>'name')='Friend Caller','request context allows sender profile lookup');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
do $$ declare request_id uuid; begin
  select id into request_id from public.friend_requests where sender_id='40000000-0000-0000-0000-000000000001';
  begin perform public.respond_to_friend_request(request_id,'accept'); raise exception 'sender accepted request';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
do $$ declare request_id uuid; begin
  select id into request_id from public.friend_requests where sender_id='40000000-0000-0000-0000-000000000001';
  perform public.respond_to_friend_request(request_id,'decline');
end $$;
select pg_temp.assert((select count(*)=0 from public.friend_request_inbox()),'declined request leaves inbox');
select pg_temp.assert(not exists(select 1 from public.friendships where user_id='40000000-0000-0000-0000-000000000001'),'decline creates no friendship');
select pg_temp.assert((select relationship='declined' from public.course_friend_relationships('CSE 310') where student_id='40000000-0000-0000-0000-000000000001'),'decline state visible');
select pg_temp.assert((select count(*)=1 from public.course_recommendation_profiles('CSE 310')),'declined peer remains recommended');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
select pg_temp.assert(public.send_friend_request('CSE 310','40000000-0000-0000-0000-000000000002') is not null,'retry after decline creates new request');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
do $$ declare request_id uuid; begin
  select id into request_id from public.friend_requests where sender_id='40000000-0000-0000-0000-000000000001' and status='pending';
  perform public.respond_to_friend_request(request_id,'accept');
end $$;
select pg_temp.assert((select count(*)=1 from public.friendships where user_id='40000000-0000-0000-0000-000000000001' and friend_id='40000000-0000-0000-0000-000000000002'),'accepted friendship stored once canonically');
select pg_temp.assert((select count(*)=1 from public.friends_in_course('CSE 310') where student_id='40000000-0000-0000-0000-000000000001'),'friend appears once despite multiple sections');
select pg_temp.assert((select count(*)=0 from public.course_recommendation_profiles('CSE 310')),'accepted friends excluded from recommendations');
select pg_temp.assert((select count(*)=1 from public.find_classmates('CSE 310')),'classmate discovery retains its original behavior');
select pg_temp.assert(not (public.get_friend_profile('40000000-0000-0000-0000-000000000001'::uuid) ? 'year') and not (public.get_friend_profile('40000000-0000-0000-0000-000000000001'::uuid) ? 'interests') and not (public.get_friend_profile('40000000-0000-0000-0000-000000000001'::uuid) ? 'residence_status'),'private optional fields omitted from friend profile');
reset role;
rollback;
