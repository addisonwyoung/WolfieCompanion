"""Focused Stage 3B gate: only a NEW verified loopback PostgreSQL 17 cluster.

Uses the audited baseline builder, not blind historical migration replay.
No production URLs, credentials or connection settings accepted.
"""
import argparse
import hashlib
import json
from pathlib import Path
from run_privacy_runtime import Disposable, REPO
from privacy_runtime_checks import snapshot


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--audit-directory', type=Path, required=True)
    parser.add_argument('--postgres-bin', type=Path, required=True)
    parser.add_argument('--skip-concurrency',action='store_true',help='Run installation/fixtures only when the unchanged concurrency gate already passed')
    args = parser.parse_args()
    db = Disposable(args.audit_directory, args.postgres_bin, 17)
    try:
        db.validate_tools(); db.start(); db.file('baseline', db.baseline)
        for name in ['202611190001_student_privacy_foundation.sql', '202611190002_student_privacy_authorization.sql',
                     '202611200001_mutual_dm_authorization.sql', '202611210001_group_membership_controls.sql']:
            db.file(name[:12], (REPO / 'supabase/migrations' / name).read_text(encoding='utf-8'))
        # Model the supplied live inventory with synthetic identities and contents.
        db.query("""
insert into auth.users(id,email,email_confirmed_at)
select ('d8100000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'legacy'||n||'@stonybrook.edu',now() from generate_series(1,4)n;
insert into auth.identities(user_id,provider,identity_data)
select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id::text like 'd8100000-%';
insert into public.study_groups(id,course_code,course_section,name,created_by,created_at)
values('c61b70c9-3db6-498b-831f-8f6cbea3964c','CSE 416',null,'Legacy retained workspace','d8100000-0000-0000-0000-000000000001','2026-10-23 19:17:00.825378+00');
insert into public.study_group_members(group_id,user_id,role,status)
select 'c61b70c9-3db6-498b-831f-8f6cbea3964c',id,case when right(id::text,1)='1' then 'owner' else 'member' end,'accepted' from auth.users where id::text like 'd8100000-%';
insert into public.study_group_tasks(group_id,created_by,title) values('c61b70c9-3db6-498b-831f-8f6cbea3964c','d8100000-0000-0000-0000-000000000001','Retained task');
insert into public.study_group_availability(group_id,user_id,day,start_minute,end_minute)
select group_id,user_id,d,600,660 from public.study_group_members cross join unnest(array['Monday','Tuesday']) d;
""")
        before = {t:json.loads(v) for t,v in snapshot(db).items()}
        security_query="select coalesce(jsonb_agg(pg_get_functiondef(p.oid) order by p.oid),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and (p.proname like 'group_%' or p.proname like 'dm_%' or p.proname in('block_student','unblock_student','student_visible','resolve_current_semester'));"
        unchanged_security=db.query(security_query).stdout
        path = REPO / 'supabase/migrations/202611210002_study_buddies_authorization.sql'
        migration = path.read_text(encoding='utf-8')
        db.query('alter table public.study_group_members disable trigger study_admission_block_guard')
        rejected=db.file('reject-study-guard',migration,False)
        assert 'prerequisites required' in rejected.stderr
        db.query('alter table public.study_group_members enable trigger study_admission_block_guard')
        db.query('grant select on public.study_group_members to authenticated')
        rejected=db.file('reject-study-direct-access',migration,False)
        assert 'Unexpected direct client Study privileges' in rejected.stderr
        db.query('revoke select on public.study_group_members from authenticated')
        db.file('stage3b',migration)
        assert db.query(security_query).stdout==unchanged_security,'Changed existing messaging/privacy/calendar helpers'
        db.report['unchanged_stage1_3a_functions']=True
        added={'public.study_groups':{'professor_first_name','professor_last_name','semester','academic_year'},
               'public.study_group_members':{'invitation_id','invited_by','invitation_issued_at'}}
        def unchanged():
            after={t:json.loads(v) for t,v in snapshot(db).items()}
            for table,rows in before.items():
                projected=[{k:v for k,v in row.items() if k not in added.get(table,set())} for row in after[table]]
                assert sorted(rows,key=lambda v:json.dumps(v,sort_keys=True))==sorted(projected,key=lambda v:json.dumps(v,sort_keys=True)),table
        unchanged()
        db.report['stage3b_preserved_original_data']=True
        db.report['stage3b_sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
        fixture=REPO / 'supabase/tests/study_buddies_authorization.sql'
        db.file('study-fixtures',fixture.read_text(encoding='utf-8')); unchanged()
        db.report['fixture_rollback_verified']=True
        from study_buddies_runtime_checks import concurrency
        if not args.skip_concurrency: concurrency(db)
        else: db.report['concurrency_skipped']=True
        db.report['outcome']='PASS'
    except Exception as error:
        db.report.update(outcome='FAIL',error=str(error)); raise
    finally:
        db.stop(); print('Results:',db.directory / 'results.json',flush=True)


if __name__=='__main__': main()
