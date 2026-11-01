"""Multi-session synthetic group tests, hardcoded disposable local PG only (55459)."""
import concurrent.futures
import json
import subprocess
import time
import uuid

PSQL=['/opt/homebrew/opt/postgresql@18/bin/psql','-X','-qAt','-h','127.0.0.1','-p','55459','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
IDS=[f'a0000000-0000-0000-0000-{n:012d}' for n in range(1,61)]
def query(sql,check=True):
    r=subprocess.run(PSQL,input=sql,text=True,capture_output=True,timeout=15)
    if check and r.returncode: raise AssertionError(r.stderr)
    return r

def auth(sql,student=None,check=True):
    r=query(f"begin;set local role authenticated;select set_config('request.jwt.claim.sub','{student or IDS[0]}',true);{sql};commit;",check)
    return r

def array(ids): return 'array['+','.join("'"+i+"'::uuid" for i in ids)+']'
def create(ids=None,request=None):
    r=auth(f"select public.group_create({array(ids or IDS[1:3])},'{request or uuid.uuid4()}')->>'group_id'")
    return r.stdout.strip().splitlines()[-1]
def add(group,ids,request=None,check=True): return auth(f"select public.group_add_members('{group}',{array(ids)},'{request or uuid.uuid4()}')",check=check)
def send(group,request=None): return auth(f"select public.group_send_message('{group}','Concurrent text','{request or uuid.uuid4()}')")
def parallel(*jobs):
    with concurrent.futures.ThreadPoolExecutor(len(jobs)) as pool:
        return [r.result(timeout=20) for r in [pool.submit(job) for job in jobs]]
def locked_writer(sql,marker):
    writer=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    writer.stdin.write(f"begin;{sql};select pg_sleep(1.2) /*{marker}*/;commit;");writer.stdin.close()
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        if query(f"select exists(select 1 from pg_stat_activity where wait_event='PgSleep' and query like '%{marker}%')").stdout.strip()=='t': return writer
        time.sleep(.02)
    raise AssertionError('Writer lock not acquired')
try:
    for n,student in enumerate(IDS):
        query(f"insert into auth.users(id,email,email_confirmed_at) values('{student}','grouprace{n}@stonybrook.edu',now());insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id='{student}'")
    query(f"insert into public.friendships(user_id,friend_id) select '{IDS[0]}',id from auth.users where id::text like 'a0000000-%' and id<>'{IDS[0]}'")
    request=str(uuid.uuid4());groups=parallel(lambda:create(request=request),lambda:create(request=request));assert groups[0]==groups[1];group=groups[0]
    request=str(uuid.uuid4());parallel(lambda:add(group,[IDS[3]],request),lambda:add(group,[IDS[3]],request))
    assert query(f"select count(*) from public.group_members where group_id='{group}' and user_id='{IDS[3]}'").stdout.strip()=='1'
    # A membership mutation and message share the group lock: floor 0 or 1 is consistent.
    parallel(lambda:add(group,[IDS[4]]),lambda:send(group))
    floor=int(query(f"select joined_after_sequence from public.group_members where group_id='{group}' and user_id='{IDS[4]}'").stdout.strip())
    visible=json.loads(auth(f"select public.group_history('{group}')",IDS[4]).stdout.strip().splitlines()[-1]);assert len(visible)==1-floor
    request=str(uuid.uuid4());parallel(lambda:send(group,request),lambda:send(group,request))
    assert query(f"select count(*) from public.group_messages where group_id='{group}'").stdout.strip()=='2'
    # Closure is ordered before addition: batch rejected and no membership inserted.
    writer=locked_writer(f"update public.profiles set allow_new_dms=false where id='{IDS[5]}'",'group-close-race')
    rejected=add(group,[IDS[5]],check=False);assert rejected.returncode and 'New messages are closed' in rejected.stderr;assert writer.wait(timeout=10)==0
    assert query(f"select count(*) from public.group_members where group_id='{group}' and user_id='{IDS[5]}'").stdout.strip()=='0'
    writer=locked_writer(f"delete from public.friendships where user_id='{IDS[0]}' and friend_id='{IDS[6]}'",'group-unfriend-race')
    rejected=add(group,[IDS[6]],check=False);assert rejected.returncode and 'Accepted friend required' in rejected.stderr;assert writer.wait(timeout=10)==0
    query(f"update public.profiles set allow_new_dms=true where id='{IDS[5]}';insert into public.friendships values('{IDS[0]}','{IDS[6]}',now())")
    big=create(IDS[1:49]);results=parallel(lambda:add(big,[IDS[49]],check=False),lambda:add(big,[IDS[50]],check=False))
    assert sum(r.returncode==0 for r in results)==1
    assert query(f"select count(*) from public.group_members where group_id='{big}'").stdout.strip()=='50'
    # Removal commits while another sender waits on the group row. Its earlier
    # membership check must not authorize the send after the lock is released.
    writer=locked_writer(f"set local role authenticated;select set_config('request.jwt.claim.sub','{IDS[0]}',true);select public.group_remove_member('{group}','{IDS[1]}')",'group-remove-send-race')
    rejected=auth(f"select public.group_send_message('{group}','Must not send after removal','{uuid.uuid4()}')",IDS[1],check=False)
    assert rejected.returncode and 'Group unavailable' in rejected.stderr;assert writer.wait(timeout=10)==0
    print('PASS: duplicate create/add/send, join/send boundary, closure/unfriend/removal-send races, and 50-member capacity race')
finally:
    query(f"delete from public.group_conversations where id in(select group_id from private.group_mutation_receipts where user_id='{IDS[0]}');delete from auth.identities where user_id::text like 'a0000000-%';delete from auth.users where id::text like 'a0000000-%'",check=False)
