"""Runtime checks accepting only the runner's verified disposable connection.

No URLs, credentials, environment lookups or independent connection settings.
"""
import concurrent.futures
import json
import time
import uuid


def require(db, sql, expected, label):
    actual = db.query(sql).stdout.strip()
    if actual != expected:
        raise AssertionError(f'{label}: expected {expected!r}, got {actual!r}')


def seed_upgrade(db):
    db.query("""
insert into auth.users(id,email,email_confirmed_at)
select ('d3000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'upgrade'||n||'@stonybrook.edu',now() from generate_series(1,4)n;
insert into auth.identities(user_id,provider,identity_data)
select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id::text like 'd3000000-%';
update public.profiles set allow_new_dms=(right(id::text,1) in ('1','3')) where id::text like 'd3000000-%';
insert into public.friendships(user_id,friend_id) values('d3000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000002');
insert into public.friend_requests(sender_id,recipient_id) values('d3000000-0000-0000-0000-000000000003','d3000000-0000-0000-0000-000000000004');
insert into public.dm_conversations(id,user_low,user_high,last_sequence)
values('d3000000-0000-0000-0001-000000000001','d3000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000002',1);
insert into public.dm_messages(conversation_id,sequence,sender_id,client_message_id,body)
values('d3000000-0000-0000-0001-000000000001',1,'d3000000-0000-0000-0000-000000000001',gen_random_uuid(),'Upgrade history');
insert into public.dm_read_positions values('d3000000-0000-0000-0000-000000000002','d3000000-0000-0000-0001-000000000001',1);
insert into public.group_conversations(id,creator_id,last_sequence) values('d3000000-0000-0000-0002-000000000001','d3000000-0000-0000-0000-000000000001',1);
insert into public.group_members(group_id,user_id,joined_after_sequence,last_read_sequence)
select 'd3000000-0000-0000-0002-000000000001',id,0,1 from auth.users where id::text like 'd3000000-%' and right(id::text,1)<>'4';
insert into public.group_messages(group_id,sequence,sender_id,client_message_id,body)
values('d3000000-0000-0000-0002-000000000001',1,'d3000000-0000-0000-0000-000000000001',gen_random_uuid(),'Retained group history');
insert into public.study_groups(id,course_code,name,created_by,course_section) values('d3000000-0000-0000-0003-000000000001','CSE 310','Retained study group','d3000000-0000-0000-0000-000000000001','01');
insert into public.study_group_members(group_id,user_id,role,status) values
('d3000000-0000-0000-0003-000000000001','d3000000-0000-0000-0000-000000000001','owner','accepted'),
('d3000000-0000-0000-0003-000000000001','d3000000-0000-0000-0000-000000000002','member','pending'),
('d3000000-0000-0000-0003-000000000001','d3000000-0000-0000-0000-000000000003','member','accepted');
insert into public.study_group_tasks(group_id,created_by,title) values('d3000000-0000-0000-0003-000000000001','d3000000-0000-0000-0000-000000000001','Keep this task');
insert into public.study_group_availability(group_id,user_id,day,start_minute,end_minute) values('d3000000-0000-0000-0003-000000000001','d3000000-0000-0000-0000-000000000003','Monday',601,642);
""")


def snapshot(db):
    tables = db.query("select quote_ident(n.nspname)||'.'||quote_ident(c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in('public','private') order by 1;").stdout.splitlines()
    return {table: db.query(f"select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from {table} t;").stdout.strip() for table in tables}


def negative_migrations(db, migration):
    def fails(name, message):
        result = db.file(name, migration, expected_success=False)
        assert message in result.stderr, result.stderr
        require(db, "select to_regprocedure('public.block_student(uuid)') is null;", 't', name + ' rollback')

    db.query("update storage.buckets set public=true where id='avatars';")
    fails('reject-public-avatar-bucket', 'Private avatars bucket required')
    db.query("delete from storage.buckets where id='avatars';")
    fails('reject-missing-avatar-bucket', 'Private avatars bucket required')
    db.query("insert into storage.buckets values('avatars','avatars',false,5242880,array['image/jpeg','image/png']);")
    # Exercise effective inheritance, not just explicit role ACL strings.
    for name, signature, error in [
        ('reject-inherited-avatar-grant', 'public.resolve_friend_avatar(uuid,uuid)', 'Unsafe avatar resolver privileges'),
        ('reject-inherited-legacy-grant', 'public.find_classmates(text,text)', 'Unsafe retired RPC privileges'),
    ]:
        db.query(f'create role privacy_unsafe nologin; grant privacy_unsafe to authenticated; grant execute on function {signature} to privacy_unsafe;')
        fails(name, error)
        db.query(f'revoke privacy_unsafe from authenticated; revoke all on function {signature} from privacy_unsafe; drop role privacy_unsafe;')
    db.query("create function public.resolve_friend_avatar(uuid,uuid,text) returns text language sql security definer as $$ select null::text $$;")
    fails('reject-unaudited-avatar-overload', 'Unexpected discovery/avatar overload')
    db.query('drop function public.resolve_friend_avatar(uuid,uuid,text);')


def as_student(db, student, sql, check=True):
    return db.query(f"begin; set local role authenticated; set local request.jwt.claim.sub='{student}'; set local statement_timeout='12s'; set local lock_timeout='8s'; {sql}; commit;", check=check)


def denied(result):
    assert result.returncode != 0 and '42501' in result.stderr, result.stderr or result.stdout
    assert '40P01' not in result.stderr, 'Deadlock: ' + result.stderr


def concurrency(db):
    ids = [f'd2000000-0000-0000-0000-{n:012d}' for n in range(1, 12)]
    a, b, c, d, e, f, g, h, i, j, k = ids
    joined = ','.join("'" + student + "'" for student in ids)
    db.query(f"""
insert into auth.users(id,email,email_confirmed_at) select id::uuid,'race'||n||'@stonybrook.edu',now() from unnest(array[{joined}]) with ordinality u(id,n);
insert into auth.identities(user_id,provider,identity_data) select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id in({joined});
insert into public.friendships(user_id,friend_id) values('{a}','{b}'),('{a}','{c}'),('{a}','{d}'),('{a}','{e}'),('{a}','{f}'),('{c}','{d}');
insert into public.course_offerings(id,course_code,course_title,professor_name,section,professor_first_name,professor_last_name,semester,academic_year)
select 'privacy-race-cse-310','CSE 310','Race fixture','Ada Lovelace','01','Ada','Lovelace',semester,academic_year from private.resolve_current_semester(now());
insert into public.course_enrollments(user_id,course_code,course_number,section,professor_first_name,professor_last_name,semester,academic_year,verification_status,course_offering_id)
select u.id,'CSE','310','01','Ada','Lovelace',t.semester,t.academic_year,'verified','privacy-race-cse-310' from auth.users u cross join private.resolve_current_semester(now()) t where u.id in({joined});
""")
    group = json.loads(as_student(db, a, f"select public.group_create(array['{b}'::uuid,'{c}'::uuid],gen_random_uuid(),'Race group')").stdout.strip())['group_id']
    as_student(db, a, f"select public.dm_send_message('{b}','Before block',gen_random_uuid())")
    results = []

    def race(name, holder, holder_sql, contender, contender_sql, rejected):
        marker = 'privacy-' + uuid.uuid4().hex
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            hold = pool.submit(as_student, db, holder, holder_sql + f'; select pg_sleep(3) /*{marker}-hold*/')

            def wait_for(suffix, wait_kind):
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    test = db.query(f"select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and query like '%{marker}-{suffix}%' and {wait_kind});").stdout.strip()
                    if test == 't':
                        return
                    if hold.done() and suffix == 'hold':
                        hold.result()
                        raise AssertionError('Holder completed before barrier: ' + name)
                    time.sleep(.015)
                raise AssertionError('Did not observe ' + suffix + ' barrier: ' + name)

            wait_for('hold', "wait_event='PgSleep'")
            other = pool.submit(as_student, db, contender, f'/*{marker}-contender*/ ' + contender_sql, False)
            wait_for('contender', "wait_event_type='Lock'")
            hold.result(timeout=15)
            outcome = other.result(timeout=15)
            if rejected:
                denied(outcome)
            else:
                assert outcome.returncode == 0, outcome.stderr
        results.append({'name': name, 'result': 'PASS', 'observed_wait': True, 'contender_rejected': rejected})
        print('concurrency', name, 'PASS', flush=True)

    race('block-before-existing-DM', a, f"select public.block_student('{b}')", b,
         f"select public.dm_send_message('{a}','Must reject',gen_random_uuid())", True)
    require(db, f"select last_sequence from public.dm_conversations where user_low='{a}' and user_high='{b}';", '1', 'no blocked insertion')
    race('block-before-new-DM', c, f"select public.block_student('{d}')", d,
         f"select public.dm_send_message('{c}','Must reject',gen_random_uuid())", True)
    require(db, f"select count(*) from public.dm_conversations where user_low='{c}' and user_high='{d}';", '0', 'no empty conversation')
    request = as_student(db, d, f"select public.send_friend_request_to_student('{e}')").stdout.strip()
    race('block-before-friend-accept', e, f"select public.block_student('{d}')", e,
         f"select public.respond_to_friend_request('{request}','accept')", True)
    require(db, f"select status from public.friend_requests where id='{request}';", 'declined', 'pending invalidated')
    require(db, f"select count(*) from public.friendships where user_id='{d}' and friend_id='{e}';", '0', 'no friendship recreation')
    race('block-before-group-add', b, f"select public.block_student('{d}')", a,
         f"select public.group_add_members('{group}',array['{d}'::uuid],gen_random_uuid())", True)
    require(db, f"select count(*) from public.group_members where group_id='{group}';", '3', 'atomic admission rejection')
    # Existing blocked co-members A/B do not prevent unrelated safe admission.
    as_student(db, a, f"select public.group_add_members('{group}',array['{e}'::uuid],gen_random_uuid())")
    require(db, f"select count(*) from public.group_members where group_id='{group}';", '4', 'unrelated safe admission')
    race('group-add-before-block', a, f"select public.group_add_members('{group}',array['{f}'::uuid],gen_random_uuid())", c,
         f"select public.block_student('{f}')", False)
    require(db, f"select count(*) from public.group_members where group_id='{group}' and user_id='{f}';", '1', 'existing membership retained')
    assert json.loads(as_student(db, c, f"select public.group_member_identity('{group}','{f}')").stdout.strip())['student_id'] == f
    # A send already authorized before blocking remains history, then sending closes.
    as_student(db, a, f"select public.dm_send_message('{e}','Seed thread',gen_random_uuid())")
    race('DM-before-block', a, f"select public.dm_send_message('{e}','Before revocation',gen_random_uuid())", e,
         f"select public.block_student('{a}')", False)
    require(db, f"select last_sequence from public.dm_conversations where user_low='{a}' and user_high='{e}';", '2', 'earlier send retained')
    denied(as_student(db, a, f"select public.dm_send_message('{e}','Later rejection',gen_random_uuid())", False))
    request = as_student(db, d, f"select public.send_friend_request_to_student('{f}')").stdout.strip()
    race('friend-accept-before-block', f, f"select public.respond_to_friend_request('{request}','accept')", d,
         f"select public.block_student('{f}')", False)
    require(db, f"select count(*) from public.friendships where user_id='{d}' and friend_id='{f}';", '0', 'block removes earlier accepted friendship')
    study = as_student(db, g, f"select public.create_study_group('CSE 310','01','Study race',array['{h}'::uuid,'{i}'::uuid])").stdout.strip()
    as_student(db, h, f"select public.block_student('{i}')")
    race('blocked-pending-Study-accepts', h, f"select public.respond_to_study_group_invite('{study}',true)", i,
         f"select public.respond_to_study_group_invite('{study}',true)", True)
    require(db, f"select status from public.study_group_members where group_id='{study}' and user_id='{h}';", 'accepted', 'first Study accept')
    require(db, f"select status from public.study_group_members where group_id='{study}' and user_id='{i}';", 'pending', 'second Study remains pending')
    as_student(db, i, f"select public.respond_to_study_group_invite('{study}',false)")
    study = as_student(db, g, f"select public.create_study_group('CSE 310','01','Leave race',array['{j}'::uuid])").stdout.strip()
    race('Study-accept-before-owner-departure', j, f"select public.respond_to_study_group_invite('{study}',true)", g,
         f"select public.leave_study_group('{study}')", False)
    require(db, f"select created_by from public.study_groups where id='{study}';", j, 'existing ownership transfer preserved')
    as_student(db, j, f"select public.leave_study_group('{study}')")
    require(db, f"select count(*) from public.study_groups where id='{study}';", '0', 'final Study departure')
    race('private-mode-before-first-contact', b, f"update public.profiles set is_private=true where id='{b}'", k,
         f"select public.dm_send_message('{b}','Private first contact',gen_random_uuid())", True)
    require(db, f"select count(*) from public.dm_conversations where user_low='{b}' and user_high='{k}';", '0', 'no private empty conversation')
    require_result = as_student(db, k, 'select (public.ensure_profile()).is_private').stdout.strip()
    assert require_result == 'f', 'Existing owner profile RPC lost new public-default setting'
    db.report['concurrency'] = results
