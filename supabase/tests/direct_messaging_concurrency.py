"""Synthetic multi-session tests. ONLY the disposable local database at 127.0.0.1:55449.
Run after bootstrap and prerequisite/messaging migrations, never with hosted credentials.
"""
import concurrent.futures
import subprocess
import time
import uuid

PSQL = ['psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', '55449', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
IDS = [f'60000000-0000-0000-0000-{n:012d}' for n in range(1, 5)]
def query(sql, check=True):
    result = subprocess.run(PSQL, input=sql, text=True, capture_output=True)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result

def send(sender, peer, request, body='Concurrent text', check=True):
    return query(f"begin; set local role authenticated; select set_config('request.jwt.claim.sub','{sender}',true); select public.dm_send_message('{peer}','{body}','{request}','CSE310'); commit;", check)

try:
    for n, student in enumerate(IDS):
        query(f"insert into auth.users(id,email,email_confirmed_at) values('{student}','race{n}@stonybrook.edu',now()); insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id='{student}'; insert into public.user_courses(user_id,course_code) values('{student}','CSE 310');")
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        jobs = [pool.submit(send, IDS[0], IDS[1], str(uuid.uuid4())), pool.submit(send, IDS[1], IDS[0], str(uuid.uuid4()))]
        for job in jobs: job.result(timeout=10)
    assert query(f"select count(*) from public.dm_conversations where user_low='{IDS[0]}' and user_high='{IDS[1]}';").stdout.strip() == '1'
    request = str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        jobs = [pool.submit(send, IDS[0], IDS[1], request) for _ in range(2)]
        for job in jobs: job.result(timeout=10)
    assert query(f"select count(*) from public.dm_messages where sender_id='{IDS[0]}' and client_message_id='{request}';").stdout.strip() == '1'
    assert query(f"select last_sequence from public.dm_conversations where user_low='{IDS[0]}' and user_high='{IDS[1]}';").stdout.strip() == '3'
    # Wait until the preference UPDATE owns its row lock before starting the first send.
    writer = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    writer.stdin.write(f"/*dm-close-race*/ begin; update public.profiles set allow_new_dms=false where id='{IDS[3]}'; select pg_sleep(2) /*dm-close-race*/; commit;")
    writer.stdin.close()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if query("select exists(select 1 from pg_stat_activity where wait_event='PgSleep' and query like '%dm-close-race%');").stdout.strip() == 't': break
        time.sleep(.02)
    else: raise AssertionError('Preference writer did not acquire lock')
    rejected = send(IDS[2], IDS[3], str(uuid.uuid4()), check=False)
    assert rejected.returncode and 'New direct messages are closed' in rejected.stderr, rejected.stderr
    assert writer.wait(timeout=10) == 0
    assert query(f"select count(*) from public.dm_conversations where user_low='{IDS[2]}' and user_high='{IDS[3]}';").stdout.strip() == '0'
    print('PASS: reciprocal creation, duplicate request retry, and closure-before-first-send race')
finally:
    joined = ','.join("'" + student + "'" for student in IDS)
    query(f"delete from auth.identities where user_id in({joined}); delete from auth.users where id in({joined});", check=False)
