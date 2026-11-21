"""Stage 3A checks accepting only the existing verified disposable connection."""
import concurrent.futures
import hashlib
import json
import time
import uuid
from privacy_runtime_checks import as_student, denied, require, snapshot


def verify_stage3a(db, repo):
    path = repo / 'supabase/migrations/202611210001_group_membership_controls.sql'
    migration = path.read_text(encoding='utf-8')
    before = snapshot(db)
    # Existing columns/data, including Study tables and canonical settings, must not change.
    def old_snapshot():
        current = snapshot(db)
        current['public.group_conversations'] = db.query("select coalesce(jsonb_agg(to_jsonb(t)-'addition_permission'-'creator_departed' order by (to_jsonb(t)-'addition_permission'-'creator_departed')::text),'[]') from public.group_conversations t;").stdout.strip()
        return current
    db.query('alter table public.group_members disable trigger group_admission_block_guard')
    result = db.file('stage3a-reject-disabled-guard', migration, expected_success=False)
    assert 'Enabled Stage 2A group admission guard required' in result.stderr
    db.query('alter table public.group_members enable trigger group_admission_block_guard')
    db.query('grant insert on public.group_members to authenticated')
    result = db.file('stage3a-reject-direct-write', migration, expected_success=False)
    assert 'Unexpected direct client group write privileges' in result.stderr
    db.query('revoke insert on public.group_members from authenticated')
    db.query('create role stage3a_inherited; grant stage3a_inherited to authenticated; alter default privileges in schema private grant execute on functions to stage3a_inherited')
    result = db.file('stage3a-reject-inherited-helper', migration, expected_success=False)
    assert 'Unsafe group helper privileges' in result.stderr
    db.query('alter default privileges in schema private revoke execute on functions from stage3a_inherited; revoke stage3a_inherited from authenticated; drop role stage3a_inherited')
    db.file('stage3a', migration)
    assert before == old_snapshot(), 'Stage 3A changed original table data'
    require(db, "select count(*) from public.group_conversations where addition_permission<>'all_members';", '0', 'existing all-members default')
    db.file('group-membership-fixtures', (repo / 'supabase/tests/group_membership_authorization.sql').read_text(encoding='utf-8'))
    assert before == old_snapshot(), 'Stage 3A fixture rollback failed'
    db.report['stage3a_sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    db.report['stage3a_preservation_verified'] = True
    db.report['stage3a_fixture_rollback_verified'] = True
    races(db)


def races(db):
    ids = [f'd7000000-0000-0000-0000-{n:012d}' for n in range(1, 56)]
    a,b,c,d,e=ids[:5]
    joined=','.join("'"+v+"'" for v in ids)
    db.query(f"insert into auth.users(id,email,email_confirmed_at) select id::uuid,'grouprace'||n||'@stonybrook.edu',now() from unnest(array[{joined}]) with ordinality u(id,n); insert into auth.identities(user_id,provider,identity_data) select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id in({joined});")
    def create(members):
        return json.loads(as_student(db,a,"select public.group_create(array["+','.join("'"+x+"'::uuid" for x in members)+"],gen_random_uuid(),'Race')").stdout.strip())['group_id']
    group=create([b,c]); results=[]
    def race(name, holder, sql, actor, other, reject=False):
        marker='stage3a-'+uuid.uuid4().hex
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            held=pool.submit(as_student,db,holder,sql+f'; select pg_sleep(2) /*{marker}-holder*/')
            def barrier(suffix, condition):
                until=time.monotonic()+6
                while time.monotonic()<until:
                    if db.query(f"select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and query like '%{marker}-{suffix}%' and {condition});").stdout.strip()=='t':return
                    if held.done():held.result()
                    time.sleep(.015)
                raise AssertionError('Missing lock barrier '+name)
            barrier('holder',"wait_event='PgSleep'")
            future=pool.submit(as_student,db,actor,f'/*{marker}-contender*/ '+other,False)
            barrier('contender',"wait_event_type='Lock'");held.result(timeout=15);outcome=future.result(timeout=15)
            if reject:
                if name=='capacity-last-place':assert outcome.returncode!=0 and '22023' in outcome.stderr,outcome.stderr
                else:denied(outcome)
            else:assert outcome.returncode==0,outcome.stderr
        results.append({'name':name,'observed_wait':True,'result':'PASS','rejected':reject});print('group concurrency',name,'PASS',flush=True)
    race('permission-before-member-add',a,f"select public.group_set_addition_permission('{group}','creator_only',gen_random_uuid())",b,f"select public.group_add_members('{group}',array['{d}'::uuid],gen_random_uuid())",True)
    race('creator-leave-before-setting',a,f"select public.group_leave('{group}',gen_random_uuid())",a,f"select public.group_set_addition_permission('{group}','creator_only',gen_random_uuid())",True)
    race('add-after-creator-departure',b,f"select public.group_add_members('{group}',array['{a}'::uuid],gen_random_uuid())",c,f"select public.group_add_members('{group}',array['{d}'::uuid],gen_random_uuid())")
    race('leave-before-send-minimum',b,f"select public.group_leave('{group}',gen_random_uuid()); select public.group_leave('{group}',gen_random_uuid())",b,f"select public.group_send_message('{group}','Departed',gen_random_uuid())",True)
    group2=create([b,c])
    race('third-leaves-before-send',c,f"select public.group_leave('{group2}',gen_random_uuid())",a,f"select public.group_send_message('{group2}','Too small',gen_random_uuid())",True)
    group3=create([b,c])
    race('block-before-direct-add',e,f"select public.block_student('{b}')",b,f"select public.group_add_members('{group3}',array['{e}'::uuid],gen_random_uuid())",True)
    # 49 existing memberships, only one simultaneous addition may reach 50.
    large=create(ids[1:49])
    race('capacity-last-place',a,f"select public.group_add_members('{large}',array['{ids[49]}'::uuid],gen_random_uuid())",b,f"select public.group_add_members('{large}',array['{ids[50]}'::uuid],gen_random_uuid())",True)
    require(db,f"select count(*) from public.group_members where group_id='{large}';",'50','capacity serialized')
    db.report['stage3a_concurrency']=results
