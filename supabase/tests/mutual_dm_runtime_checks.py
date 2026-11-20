"""Stage 2B checks; connections are supplied ONLY by the verified disposable runner."""
import concurrent.futures
import hashlib
import json
import time
import uuid
from privacy_runtime_checks import as_student, denied, require, snapshot


def verify_stage2b(db, repo):
    path = repo / 'supabase/migrations/202611200001_mutual_dm_authorization.sql'
    migration = path.read_text(encoding='utf-8')
    db.report['stage2b_sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    # Deliberate divergence is not evidence that canonical choices are accidental.
    db.query("update public.profiles set dm_permission='friends_only' where id='d3000000-0000-0000-0000-000000000001';")
    before = snapshot(db)
    for name, setup, cleanup, expected in [
        ('missing-stage2a-guard', 'alter table public.dm_messages disable trigger dm_block_guard', 'alter table public.dm_messages enable trigger dm_block_guard', 'Enabled Stage 2A DM block guard required'),
        ('unaudited-dm-overload', 'create function public.dm_contact_state(uuid) returns jsonb language sql as $$ select null::jsonb $$', 'drop function public.dm_contact_state(uuid)', 'Unexpected DM overload'),
        ('unsafe-direct-write', 'grant insert on public.dm_messages to authenticated', 'revoke insert on public.dm_messages from authenticated', 'Unexpected direct client DM write privileges'),
        ('inherited-helper-grant', 'create role dm_unsafe nologin; grant dm_unsafe to authenticated; grant execute on function private.dm_contact(uuid,uuid,text) to dm_unsafe', 'revoke dm_unsafe from authenticated; revoke all on function private.dm_contact(uuid,uuid,text) from dm_unsafe; drop role dm_unsafe', 'Unsafe DM helper permissions'),
    ]:
        db.query(setup)
        result = db.file('stage2b-reject-' + name, migration, expected_success=False)
        assert expected in result.stderr, result.stderr
        require(db, "select to_regprocedure('private.dm_send_reason(uuid,uuid,text)') is null;", 't', name + ' transaction rollback')
        db.query(cleanup)
        assert before == snapshot(db), name + ' changed existing data'
    db.file('stage2b', migration)
    assert before == snapshot(db), 'Stage 2B changed existing settings/data'
    db.report['stage2b_preservation_verified'] = True
    db.file('mutual-dm-fixtures', (repo / 'supabase/tests/mutual_dm_authorization.sql').read_text(encoding='utf-8'))
    assert before == snapshot(db), 'Stage 2B fixtures did not roll back'
    db.report['stage2b_fixture_rollback_verified'] = True
    run_races(db)


def run_races(db):
    ids = [f'd5000000-0000-0000-0000-{n:012d}' for n in range(1, 8)]
    a, b, c, d, e, f, g = ids
    joined = ','.join("'" + v + "'" for v in ids)
    db.query(f"""
insert into auth.users(id,email,email_confirmed_at) select id::uuid,'mutualrace'||n||'@stonybrook.edu',now() from unnest(array[{joined}]) with ordinality u(id,n);
insert into auth.identities(user_id,provider,identity_data) select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id in({joined});
insert into public.friendships(user_id,friend_id) values('{a}','{b}'),('{a}','{c}'),('{a}','{d}'),('{a}','{e}'),('{a}','{f}'),('{a}','{g}');
""")
    results = []

    def race(name, holder, holder_sql, contender, contender_sql, reject):
        marker = 'mutual-' + uuid.uuid4().hex
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            hold = pool.submit(as_student, db, holder, holder_sql + f'; select pg_sleep(2) /*{marker}-hold*/')

            def barrier(suffix, event):
                deadline = time.monotonic() + 6
                while time.monotonic() < deadline:
                    if db.query(f"select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and query like '%{marker}-{suffix}%' and {event});").stdout.strip() == 't':
                        return
                    if hold.done():
                        hold.result()
                    time.sleep(.015)
                raise AssertionError('Missing observed barrier: ' + name)

            barrier('hold', "wait_event='PgSleep'")
            pending = pool.submit(as_student, db, contender, f'/*{marker}-contender*/ ' + contender_sql, False)
            barrier('contender', "wait_event_type='Lock'")
            hold.result(timeout=15)
            outcome = pending.result(timeout=15)
            if reject:
                if name == 'group-consent-before-create':
                    assert outcome.returncode != 0 and 'P0001' in outcome.stderr, outcome.stderr
                else:
                    denied(outcome)
            else:
                assert outcome.returncode == 0, outcome.stderr
        results.append({'name': name, 'observed_wait': True, 'contender_rejected': reject, 'result': 'PASS'})
        print('mutual concurrency', name, 'PASS', flush=True)

    send = lambda peer: f"select public.dm_send_message('{peer}','Race message',gen_random_uuid())"
    race('recipient-no-one-before-first-send', b, f"update public.profiles set dm_permission='no_one' where id='{b}'", a, send(b), True)
    require(db, f"select count(*) from public.dm_conversations where user_low='{a}' and user_high='{b}';", '0', 'no empty thread')
    as_student(db, a, send(c))
    race('sender-no-one-before-existing-send', a, f"update public.profiles set dm_permission='no_one' where id='{a}'", a, send(c), True)
    as_student(db, a, f"update public.profiles set dm_permission='eligible_students' where id='{a}'")
    race('send-before-preference-revocation', a, send(c), c, f"update public.profiles set dm_permission='no_one' where id='{c}'", False)
    denied(as_student(db, a, send(c), False))
    as_student(db, a, f"update public.profiles set dm_permission='friends_only' where id='{a}'")
    race('unfriend-before-send', d, f"select public.unfriend('{a}')", a, send(d), True)
    race('send-before-unfriend', a, send(e), e, f"select public.unfriend('{a}')", False)
    denied(as_student(db, a, send(e), False))
    as_student(db, a, f"update public.profiles set dm_permission='eligible_students' where id='{a}'")
    race('block-before-mutual-send', f, f"select public.block_student('{a}')", a, send(f), True)
    race('group-consent-before-create', g, f"update public.profiles set allow_group_additions=false where id='{g}'", a,
         f"select public.group_create(array['{b}'::uuid,'{g}'::uuid],gen_random_uuid(),'Consent race')", True)
    # Simultaneous opposite directions share one canonical pair/conversation/sequence.
    as_student(db, b, f"update public.profiles set dm_permission='eligible_students' where id='{b}'")
    race('opposite-direction-sends', a, send(b), b, send(a), False)
    require(db, f"select last_sequence from public.dm_conversations where user_low='{a}' and user_high='{b}';", '2', 'serialized opposite sends')
    # A private student's request can be intentionally withdrawn/declined before first DM.
    as_student(db, d, f"update public.profiles set is_private=true where id='{d}'")
    request = as_student(db, d, f"select public.send_friend_request_to_student('{g}')").stdout.strip()
    race('pending-context-decline-before-first-send', g, f"select public.respond_to_friend_request('{request}','decline')", g, send(d), True)
    db.report['stage2b_concurrency'] = results
