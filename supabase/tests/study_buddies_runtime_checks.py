"""Focused races on the caller-supplied verified disposable connection only."""
import concurrent.futures
import time
import uuid
from privacy_runtime_checks import as_student, denied, require


def concurrency(db):
    ids=[f'd8300000-0000-0000-0000-{n:012d}' for n in range(1,13)]
    values=','.join("'"+v+"'" for v in ids)
    a,b,c,d,e=ids[:5]
    db.query(f"""
insert into auth.users(id,email,email_confirmed_at) select id::uuid,'studyrace'||n||'@stonybrook.edu',now() from unnest(array[{values}]) with ordinality u(id,n);
insert into auth.identities(user_id,provider,identity_data) select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id in({values});
insert into public.course_offerings(id,course_code,course_title,professor_name,section,professor_first_name,professor_last_name,semester,academic_year)
select 'study-race','CSE 416','Study race','Ada Lovelace','01','Ada','Lovelace',semester,academic_year from private.resolve_current_semester(now());
insert into public.course_enrollments(user_id,course_code,course_number,section,professor_first_name,professor_last_name,semester,academic_year,verification_status,course_offering_id)
select id,'CSE','416','01','Ada','Lovelace',t.semester,t.academic_year,'verified','study-race' from auth.users cross join private.resolve_current_semester(now()) t where id in({values});
""")
    def create(targets):
        targets=','.join("'"+v+"'::uuid" for v in targets)
        return as_student(db,a,f"select public.study_create('CSE 416','01','Ada','Lovelace','Race',array[{targets}],gen_random_uuid())").stdout.strip()
    def token(group,user):
        return db.query(f"select invitation_id from public.study_group_members where group_id='{group}' and user_id='{user}'").stdout.strip()
    def accept(group,user):
        return as_student(db,user,f"select public.study_respond('{group}','{token(group,user)}',true,gen_random_uuid())")
    results=[]
    def race(name,holder,sql,actor,other,reject=False):
        marker='study-race-'+uuid.uuid4().hex
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            held=pool.submit(as_student,db,holder,sql+f'; select pg_sleep(2) /*{marker}-holder*/')
            def barrier(suffix,condition):
                until=time.monotonic()+8
                while time.monotonic()<until:
                    if db.query(f"select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and query like '%{marker}-{suffix}%' and {condition})").stdout.strip()=='t':return
                    if held.done():held.result()
                    time.sleep(.02)
                raise AssertionError('Missing observed lock wait: '+name)
            barrier('holder',"wait_event='PgSleep'")
            contender=pool.submit(as_student,db,actor,f'/*{marker}-contender*/ '+other,False)
            barrier('contender',"wait_event_type='Lock'")
            held.result(timeout=15); result=contender.result(timeout=15)
            if reject:denied(result)
            else:assert result.returncode==0,result.stderr
        results.append({'name':name,'observed_wait':True,'rejected':reject,'result':'PASS'})
        print('Study concurrency',name,'PASS',flush=True)
    group=create(ids[1:7]); accept(group,b)
    race('last-reserved-place',a,f"select public.study_invite('{group}',array['{ids[7]}'::uuid],gen_random_uuid())",b,f"select public.study_invite('{group}',array['{ids[8]}'::uuid],gen_random_uuid())",True)
    require(db,f"select private.study_occupied('{group}',clock_timestamp())",'8','capacity serialized')
    group=create([b,c]); accept(group,b)
    race('member-leave-before-invite',b,f"select public.study_leave('{group}',gen_random_uuid())",b,f"select public.study_invite('{group}',array['{d}'::uuid],gen_random_uuid())",True)
    group=create([d]); generation=token(group,d)
    race('block-before-accept',a,f"select public.block_student('{d}')",d,f"select public.study_respond('{group}','{generation}',true,gen_random_uuid())",True)
    as_student(db,a,f"select public.unblock_student('{d}')")
    group=create([b]); generation=token(group,b)
    db.query(f"alter table public.study_group_members disable trigger study_admission_block_guard; update public.study_group_members set invitation_issued_at=clock_timestamp()-interval '168 hours'+interval '1 second' where group_id='{group}' and user_id='{b}'; alter table public.study_group_members enable trigger study_admission_block_guard;")
    race('expiry-during-group-lock',a,f"select public.save_study_group_availability('{group}','[]'::jsonb)",b,f"select public.study_respond('{group}','{generation}',true,gen_random_uuid())",True)
    group=create([b]); accept(group,b)
    task=as_student(db,b,f"select public.add_study_group_task('{group}','Retained task','')").stdout.strip()
    race('leave-before-task-completion',b,f"select public.study_leave('{group}',gen_random_uuid())",b,f"select public.set_study_group_task_complete('{task}',true)",True)
    group=create([b]); generation=token(group,b)
    race('last-owner-leave-before-accept',a,f"select public.study_leave('{group}',gen_random_uuid())",b,f"select public.study_respond('{group}','{generation}',true,gen_random_uuid())",True)
    group=create([b,c]); accept(group,b); generation=token(group,c)
    race('inviter-leave-before-accept',a,f"select public.study_leave('{group}',gen_random_uuid())",c,f"select public.study_respond('{group}','{generation}',true,gen_random_uuid())")
    group=create([e]); generation=token(group,e)
    db.query(f"alter table public.study_group_members disable trigger study_admission_block_guard; update public.study_group_members set invitation_issued_at=clock_timestamp()-interval '169 hours' where group_id='{group}' and user_id='{e}'; alter table public.study_group_members enable trigger study_admission_block_guard;")
    race('reissue-before-stale-decline',a,f"select public.study_invite('{group}',array['{e}'::uuid],gen_random_uuid())",e,f"select public.study_respond('{group}','{generation}',false,gen_random_uuid())",True)
    db.report['stage3b_concurrency']=results
