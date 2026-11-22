"""Stage 3C-1 gate on a NEW loopback-only disposable PostgreSQL 17 cluster.

No URLs, credentials, .env, installed clusters or hosted endpoints are accepted.
Uses the existing audited baseline builder and explicitly reviewed Stage 1-3B chain.
All generated data, SQL and logs go to ignored supabase/.temp/privacy-runtime/.
"""
import argparse
import hashlib
import json
from pathlib import Path
from run_privacy_runtime import Disposable, REPO
from privacy_runtime_checks import seed_upgrade, snapshot
from shared_group_warning_checks import functional, concurrency

MIGRATION = '202611210003_shared_group_privacy_warnings.sql'
PREREQUISITES = [
    '202611190001_student_privacy_foundation.sql',
    '202611190002_student_privacy_authorization.sql',
    '202611200001_mutual_dm_authorization.sql',
    '202611210001_group_membership_controls.sql',
    '202611210002_study_buddies_authorization.sql',
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--audit-directory', type=Path, required=True)
    parser.add_argument('--postgres-bin', type=Path, required=True)
    args = parser.parse_args()
    db = Disposable(args.audit_directory, args.postgres_bin, 17)
    hashes = {name: hashlib.sha256((REPO/'supabase/migrations'/name).read_bytes()).hexdigest() for name in PREREQUISITES}
    try:
        db.validate_tools(); db.start(); db.file('baseline', db.baseline)
        seed_upgrade(db)
        # Supplied Stage 3B inventory shape, synthetic people/content only.
        # Preserve the NULL section rather than inferring offering provenance.
        db.query("""
insert into auth.users(id,email,email_confirmed_at)
select ('d8100000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'legacywarning'||n||'@stonybrook.edu',now() from generate_series(1,4)n;
insert into auth.identities(user_id,provider,identity_data)
select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id::text like 'd8100000-%';
insert into public.study_groups(id,course_code,course_section,name,created_by)
values('c61b70c9-3db6-498b-831f-8f6cbea3964c','CSE 416',null,'Retained legacy workspace','d8100000-0000-0000-0000-000000000001');
insert into public.study_group_members(group_id,user_id,role,status)
select 'c61b70c9-3db6-498b-831f-8f6cbea3964c',id,case when right(id::text,1)='1' then 'owner' else 'member' end,'accepted' from auth.users where id::text like 'd8100000-%';
insert into public.study_group_tasks(group_id,created_by,title)
values('c61b70c9-3db6-498b-831f-8f6cbea3964c','d8100000-0000-0000-0000-000000000001','Preserved CSE 416 task');
insert into public.study_group_availability(group_id,user_id,day,start_minute,end_minute)
select group_id,user_id,d,600,660 from public.study_group_members cross join unnest(array['Monday','Tuesday']) d
where group_id='c61b70c9-3db6-498b-831f-8f6cbea3964c';
""")
        for name in PREREQUISITES:
            db.file(name[:12], (REPO/'supabase/migrations'/name).read_text(encoding='utf-8'))
        # Reproduce the hosted explicit ACLs without changing default privileges
        # or role memberships, even in this disposable cluster.
        db.query('grant execute on function public.block_student(uuid),public.unblock_student(uuid) to service_role')
        acl_checks=[]
        db.report['hosted_acl_checks']=acl_checks
        for name in ('block_student','unblock_student'):
            assert db.query(f"select p.proowner='postgres'::regrole and has_function_privilege('service_role',p.oid,'EXECUTE') and exists(select 1 from aclexplode(p.proacl) a where a.grantee='service_role'::regrole and a.privilege_type='EXECUTE') from pg_proc p where p.oid='public.{name}(uuid)'::regprocedure").stdout.strip()=='t'
            acl_checks.append(name+': hosted postgres ownership and explicit service EXECUTE reproduced')
        catalog_query="select jsonb_build_object('defaults',(select coalesce(jsonb_agg(to_jsonb(d) order by d.oid),'[]') from pg_default_acl d),'memberships',(select coalesce(jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor),'[]') from pg_auth_members m))"
        unchanged_catalog=db.query(catalog_query).stdout
        # Existing legacy block must remain unlabeled; no inferred historical identity.
        db.query("insert into public.student_blocks(blocker_id,blocked_id) values('d8100000-0000-0000-0000-000000000004','d8100000-0000-0000-0000-000000000001')")
        before = {t: json.loads(v) for t,v in snapshot(db).items()}
        function_query = "select coalesce(jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl) order by p.oid),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and not (n.nspname='public' and p.proname in('block_student','unblock_student'))"
        existing_functions = json.loads(db.query(function_query).stdout)
        block_before=db.query("select pg_get_functiondef('public.block_student(uuid)'::regprocedure)").stdout
        unblock_before=db.query("select pg_get_functiondef('public.unblock_student(uuid)'::regprocedure)").stdout
        block_acl_query="select jsonb_agg(jsonb_build_array(p.oid,p.proacl) order by p.oid) from pg_proc p where p.oid in('public.block_student(uuid)'::regprocedure,'public.unblock_student(uuid)'::regprocedure)"
        block_acls_before=db.query(block_acl_query).stdout
        path=REPO/'supabase/migrations'/MIGRATION
        migration=path.read_text(encoding='utf-8')
        def rejection(name, setup, cleanup, expected):
            db.query(setup)
            result=db.file(name,migration,False)
            assert expected in result.stderr, result.stderr
            assert db.query("select to_regclass('private.shared_group_warning_state') is null and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='student_blocks' and column_name='blocked_name_snapshot')").stdout.strip()=='t'
            assert db.query("select pg_get_functiondef('public.block_student(uuid)'::regprocedure)").stdout==block_before
            assert db.query(block_acl_query).stdout==block_acls_before, 'Failed migration changed block/unblock ACLs'
            db.query(cleanup)
            db.report.setdefault('warning_rollback_cases',[]).append(name)
        rejection('reject-disabled-study-guard','alter table public.study_group_members disable trigger study_admission_block_guard','alter table public.study_group_members enable trigger study_admission_block_guard','Verified block RLS and Study status guard required')
        rejection('reject-client-block-write','grant update on public.student_blocks to authenticated','revoke update on public.student_blocks from authenticated','Unexpected direct client block writes')
        rejection('reject-all-table-publication','create publication warning_unsafe for all tables','drop publication warning_unsafe','Privacy state must not be published')
        rejection('reject-private-schema-publication','create publication warning_unsafe for tables in schema private','drop publication warning_unsafe','Privacy state must not be published')
        rejection('reject-block-publication','create publication warning_unsafe for table public.student_blocks','drop publication warning_unsafe','Privacy state must not be published')
        db.file('stage3c1',migration)
        db.report['migration_sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
        after_functions=json.loads(db.query(function_query).stdout)
        assert all(row in after_functions for row in existing_functions), 'Changed unrelated function definition/ACL'
        db.report['existing_function_definitions_and_acls_preserved_except_block_body_and_block_unblock_acls']=True
        assert db.query("select pg_get_functiondef('public.unblock_student(uuid)'::regprocedure)").stdout==unblock_before
        acl_checks.append('unblock function definition unchanged')
        for name in ('block_student','unblock_student'):
            assert db.query(f"select has_function_privilege('authenticated','public.{name}(uuid)','EXECUTE') and not has_function_privilege('anon','public.{name}(uuid)','EXECUTE') and not has_function_privilege('service_role','public.{name}(uuid)','EXECUTE')").stdout.strip()=='t'
            acl_checks.append(name+': authenticated-only effective EXECUTE after migration')
            result=db.query(f"begin; set local role service_role; set local request.jwt.claim.sub='d8100000-0000-0000-0000-000000000001'; select public.{name}('d8100000-0000-0000-0000-000000000002'); commit;",check=False)
            assert result.returncode and '42501' in result.stderr and 'permission denied for function' in result.stderr, result.stderr
            acl_checks.append(name+': service-role call denied at EXECUTE boundary despite eligible user claim')
        assert db.query(catalog_query).stdout==unchanged_catalog
        acl_checks.append('default privileges and role memberships unchanged')
        def preserve(exact):
            after={t:json.loads(v) for t,v in snapshot(db).items()}
            for table,rows in before.items():
                projected=[{k:v for k,v in row.items() if not (table=='public.student_blocks' and k=='blocked_name_snapshot')} for row in after[table]]
                assert all(row in projected for row in rows), 'Lost or changed existing rows: '+table
                if exact: assert len(rows)==len(projected),table
        preserve(True)
        assert db.query('select bool_and(blocked_name_snapshot is null) from public.student_blocks').stdout.strip()=='t'
        db.report['existing_rows_preserved_and_legacy_labels_not_backfilled']=True
        # Reapplication is intentionally rejected atomically, not a destructive reset.
        installed=snapshot(db)
        db.file('reject-reapplication',migration,False)
        assert snapshot(db)==installed
        db.report['warning_rollback_cases'].append('reject-reapplication')
        for name in ['mutual_dm_authorization.sql','group_membership_authorization.sql','study_buddies_authorization.sql']:
            content=(REPO/'supabase/tests'/name).read_text(encoding='utf-8')
            if name=='mutual_dm_authorization.sql':
                # Stage 2B's picker-consent disclosure was explicitly retired in
                # Stage 3A. Keep the historical fixture unchanged; assert the
                # stronger current privacy contract in this final-baseline run.
                old="select not (x->>'can_add')::boolean"
                new="select x->'can_add'='true'::jsonb and x->'reason'='null'::jsonb and not x ? 'allow_group_additions'"
                assert content.count(old)==1, 'Re-review changed historical picker assertion'
                content=content.replace(old,new).replace("'picker uses independent consent'","'picker does not disclose independent consent'")
                old="exception when raise_exception then if sqlerrm='disabled group consent bypassed' then raise; end if; end;"
                assert content.count(old)==1, 'Re-review changed historical consent-denial assertion'
                content=content.replace(old,"exception when insufficient_privilege then null; end;")
                db.report['legacy_fixture_adaptations']=[{'fixture':name,'reason':'Stage 3A supersedes consent-disclosing picker response and uses 42501 for consent denial; actual mutation denial remains asserted'}]
            db.file(name[:-4],content)
            assert snapshot(db)==installed,'Regression fixture did not roll back: '+name
            db.report.setdefault('regression_assertion_call_sites',{})[name]=content.count('select pg_temp.assert(')
        checks=functional(db); concurrency(checks); preserve(False)
        assert all(hashlib.sha256((REPO/'supabase/migrations'/name).read_bytes()).hexdigest()==value for name,value in hashes.items())
        db.report['prerequisite_migration_hashes']=hashes
        db.report['outcome']='PASS'
    except Exception as error:
        db.report.update(outcome='FAIL',error=str(error)); raise
    finally:
        db.stop(); print('Results:',db.directory/'results.json',flush=True)


if __name__=='__main__': main()
