"""Stage 3C-1 checks; accepts only the verified disposable runner connection."""
import concurrent.futures
import json
import time
import uuid
from privacy_runtime_checks import as_student, denied


class Checks:
    def __init__(self, db):
        self.db = db
        self.results = []
        self.db.report['warning_assertions'] = self.results

    def ok(self, label, condition):
        assert condition, label
        self.results.append(label)

    def scalar(self, sql):
        return self.db.query(sql).stdout.strip()

    def student(self, actor, sql, allowed=True):
        result = as_student(self.db, actor, sql, check=allowed)
        if not allowed:
            denied(result)
        return result.stdout.strip()

    def setup(self):
        self.ids = [f'd9300000-0000-0000-0000-{n:012d}' for n in range(1, 8)]
        self.a, self.b, self.s, self.d, self.e, self.pending, self.ineligible = self.ids
        values = ','.join("'" + value + "'::uuid" for value in self.ids)
        self.db.query(f"""
insert into auth.users(id,email,email_confirmed_at)
select id,'warning'||n||'@stonybrook.edu',now() from unnest(array[{values}]) with ordinality u(id,n);
insert into auth.identities(user_id,provider,identity_data)
select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id in({values});
update public.profiles set name='Warning student '||right(id::text,1) where id in({values});
insert into public.course_offerings(id,course_code,course_title,professor_name,section,professor_first_name,professor_last_name,semester,academic_year)
select 'warning-fixture','CSE 416','Warning fixture','Ada Lovelace','01','Ada','Lovelace',semester,academic_year from private.resolve_current_semester(now());
insert into public.course_enrollments(user_id,course_code,course_number,section,professor_first_name,professor_last_name,semester,academic_year,verification_status,course_offering_id)
select id,'CSE','416','01','Ada','Lovelace',t.semester,t.academic_year,'verified','warning-fixture'
from auth.users cross join private.resolve_current_semester(now()) t where id in({values});
""")

    def block(self):
        self.student(self.a, f"select public.block_student('{self.b}')")

    def unblock(self):
        self.student(self.a, f"select public.unblock_student('{self.b}')")

    def chat(self):
        return json.loads(self.student(self.s, f"select public.group_create_configured(array['{self.a}'::uuid,'{self.b}'::uuid],gen_random_uuid(),'Warnings','all_members')"))['group_id']

    def study(self):
        return self.student(self.s, f"select public.study_create('CSE 416','01','Ada','Lovelace','Warning study',array['{self.a}'::uuid,'{self.b}'::uuid,'{self.d}'::uuid,'{self.pending}'::uuid],gen_random_uuid())")

    def accept(self, group, actor):
        token = self.scalar(f"select invitation_id from public.study_group_members where group_id='{group}' and user_id='{actor}'")
        self.student(actor, f"select public.study_respond('{group}','{token}',true,gen_random_uuid())")

    def warnings(self, group, actor=None, context='messaging'):
        return json.loads(self.student(actor or self.a, f"select coalesce(jsonb_agg(w),'[]') from public.shared_group_warnings('{context}','{group}') w"))

    def dismiss(self, identifier, actor=None):
        self.student(actor or self.a, f"select public.dismiss_shared_group_warning('{identifier}')")

    def leave(self, group, actor, context='messaging'):
        fn = 'group_leave' if context == 'messaging' else 'study_leave'
        self.student(actor, f"select public.{fn}('{group}',gen_random_uuid())")

    def add(self, group, actor):
        self.student(self.s, f"select public.group_add_members('{group}',array['{actor}'::uuid],gen_random_uuid())")

    def warning_count(self, group):
        return int(self.scalar(f"select count(*) from private.shared_group_warning_state where messaging_group_id='{group}' or study_group_id='{group}'"))

    def race(self, name, holder, first, actor, second, rejected=False, expect_wait=True):
        marker = 'warning-race-' + uuid.uuid4().hex
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            held = pool.submit(as_student, self.db, holder, first + f'; select pg_sleep(1.5) /*{marker}-holder*/')

            def barrier(suffix, condition):
                deadline = time.monotonic() + 8
                while time.monotonic() < deadline:
                    if self.scalar(f"select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and query like '%{marker}-{suffix}%' and {condition})") == 't':
                        return
                    if held.done():
                        held.result()
                    time.sleep(.02)
                raise AssertionError('Missing observed wait: ' + name)

            barrier('holder', "wait_event='PgSleep'")
            contender = pool.submit(as_student, self.db, actor, f'/*{marker}-contender*/ ' + second, False)
            if expect_wait:
                barrier('contender', "wait_event_type='Lock'")
            else:
                # Missing UUID dismissal intentionally returns without taking locks.
                contender.result(timeout=1)
                assert not held.done(), 'Expected overlapping transactions'
            held.result(timeout=15)
            result = contender.result(timeout=15)
            if rejected:
                denied(result)
            else:
                assert result.returncode == 0, result.stderr
        self.db.report.setdefault('warning_concurrency', []).append({'name': name, 'observed_wait': expect_wait, 'overlap_observed': True, 'result': 'PASS'})
        print('Warning concurrency', name, 'PASS', flush=True)


def functional(db):
    c = Checks(db)
    c.setup()
    a,b,s,d,e,pending,ineligible = c.ids
    c.block()
    c.ok('public creation-time label', c.scalar(f"select blocked_name_snapshot from public.student_blocks where blocker_id='{a}' and blocked_id='{b}'") == 'Warning student 2')
    c.ok('snapshot reads remain owner-only',c.student(a,"select count(*) from public.student_blocks")=='1'
         and c.student(s,"select count(*) from public.student_blocks")=='0')
    c.student(a,f"update public.student_blocks set blocked_name_snapshot='Forged' where blocked_id='{b}'",False)
    c.ok('snapshot cannot be forged by owner',True)
    db.query(f"update public.profiles set name='Changed',is_private=true where id='{b}'")
    c.block()
    c.ok('duplicate block preserves snapshot', c.scalar(f"select blocked_name_snapshot from public.student_blocks where blocker_id='{a}' and blocked_id='{b}'") == 'Warning student 2')
    c.unblock(); c.block()
    c.ok('hidden nonfriend snapshot absent', c.scalar(f"select blocked_name_snapshot is null from public.student_blocks where blocker_id='{a}' and blocked_id='{b}'") == 't')
    c.unblock()
    db.query(f"insert into public.friendships(user_id,friend_id) values('{a}','{b}')")
    db.query(f"insert into public.friend_requests(sender_id,recipient_id) values('{a}','{b}')")
    c.block()
    c.ok('private friend authorized snapshot', c.scalar(f"select blocked_name_snapshot from public.student_blocks where blocker_id='{a}' and blocked_id='{b}'") == 'Changed')
    c.ok('friendship removed', c.scalar(f"select count(*) from public.friendships where user_id='{a}' and friend_id='{b}'") == '0')
    c.ok('pending request cleaned up', c.scalar(f"select bool_and(status='declined') from public.friend_requests where sender_id='{a}' and recipient_id='{b}'") == 't')
    # Third-party admission of public blocked co-members is supported unchanged.
    db.query(f"update public.profiles set is_private=false where id='{b}'")
    group = c.chat()
    c.student(s,f"select public.group_send_message('{group}','Preserved warning history',gen_random_uuid())")
    group_before=c.scalar(f"select to_jsonb(g) from public.group_conversations g where id='{group}'")
    members_before=c.scalar(f"select jsonb_agg(to_jsonb(m) order by user_id) from public.group_members m where group_id='{group}'")
    first = c.warnings(group)
    c.ok('only outgoing blocker receives current contextual identity', len(first)==1 and first[0]['blocked_student_id']==b and first[0]['name']=='Changed')
    old = first[0]['warning_id']
    c.ok('repeat fetch stable ID', c.warnings(group)[0]['warning_id']==old)
    c.ok('blocked target sees no direction', c.warnings(group,b)==[])
    c.ok('independent inviter sees no direction', c.warnings(group,s)==[])
    c.student(e,f"select * from public.shared_group_warnings('messaging','{group}')",False)
    c.ok('outsider denied', True)
    c.dismiss(old,b)
    c.ok('foreign dismissal has no effect', len(c.warnings(group))==1)
    c.dismiss(str(uuid.uuid4()))
    c.ok('missing dismissal has no effect', len(c.warnings(group))==1)
    c.dismiss(old); c.dismiss(old)
    c.ok('idempotent dismissal survives new sessions', c.warnings(group)==[] and c.warning_count(group)==1)
    c.ok('warning reads and dismissal do not touch group activity or read state',
         c.scalar(f"select to_jsonb(g) from public.group_conversations g where id='{group}'")==group_before
         and c.scalar(f"select jsonb_agg(to_jsonb(m) order by user_id) from public.group_members m where group_id='{group}'")==members_before)
    c.block()
    c.ok('duplicate block does not rearm', c.warnings(group)==[])
    second_group=c.chat()
    c.ok('separate context independent', len(c.warnings(second_group))==1)
    c.unblock()
    c.ok('unblock cascades all own state', c.warning_count(group)==0 and c.warning_count(second_group)==0)
    c.block(); fresh=c.warnings(group)[0]['warning_id']; c.dismiss(old)
    c.ok('reblock fresh ID ignores stale dismiss', fresh!=old and len(c.warnings(group))==1)
    db.query(f"update public.profiles set is_private=true,dm_permission='no_one',allow_group_additions=false where id in('{a}','{b}')")
    c.ok('accepted warning independent of privacy DM and admission preferences', c.warnings(group)[0]['warning_id']==fresh)
    c.ok('warning grants no full profile access',c.student(a,f"select public.get_discoverable_profile('{b}') is null")=='t')
    db.query(f"update public.profiles set is_private=false,dm_permission='eligible_students',allow_group_additions=true where id in('{a}','{b}')")
    c.dismiss(fresh); c.leave(group,b)
    c.ok('target leave cascades dismissal', c.warning_count(group)==0)
    c.add(group,b); replacement=c.warnings(group)[0]['warning_id']; c.dismiss(fresh)
    c.ok('target rejoin rearms', replacement!=fresh and len(c.warnings(group))==1)
    floor=c.scalar(f"select joined_after_sequence from public.group_members where group_id='{group}' and user_id='{b}'")
    c.dismiss(replacement); c.leave(group,b); c.add(group,b)
    same_floor_id=c.warnings(group)[0]['warning_id']
    c.ok('same-floor new tenure still rearms',same_floor_id!=replacement and floor==c.scalar(f"select joined_after_sequence from public.group_members where group_id='{group}' and user_id='{b}'"))
    replacement=same_floor_id
    c.dismiss(replacement); c.leave(group,a)
    c.ok('viewer leave cascades', c.warning_count(group)==0)
    c.student(a,f"select * from public.shared_group_warnings('messaging','{group}')",False)
    c.add(group,a)
    c.ok('viewer rejoin rearms', c.warnings(group)[0]['warning_id']!=replacement)
    # Reverse direction is a separate block/owner/episode.
    c.student(b,f"select public.block_student('{a}')")
    c.ok('reverse-blocked target does not acquire snapshot',c.scalar(f"select blocked_name_snapshot is null from public.student_blocks where blocker_id='{b}' and blocked_id='{a}'")=='t')
    reverse=c.warnings(group,b)[0]['warning_id']
    c.unblock()
    c.ok('reverse block and warning retained on own unblock', c.warnings(group)==[] and c.warnings(group,b)[0]['warning_id']==reverse)
    c.student(b,f"select public.unblock_student('{a}')"); c.block()
    for actor in (a,b,s): c.leave(group,actor)
    c.ok('final messaging leave retains inactive parent but no warnings', c.warning_count(group)==0 and c.scalar(f"select count(*) from public.group_conversations where id='{group}'")=='1')
    c.ok('final leave preserves historical messages',c.scalar(f"select count(*) from public.group_messages where group_id='{group}'")=='1')
    c.student(a,f"select * from public.shared_group_warnings('messaging','{group}')",False)
    # Authoritative Study flows: pending never qualifies; accepted roles do not matter.
    study=c.study()
    c.ok('pending target excluded', c.warnings(study,s,'study')==[])
    c.student(a,f"select * from public.shared_group_warnings('study','{study}')",False)
    c.accept(study,a)
    c.ok('accepted viewer pending target excluded', c.warnings(study,a,'study')==[])
    c.accept(study,b); c.accept(study,d)
    c.student(a,f"select public.block_student('{pending}')")
    # Synthetic trusted-clock expiry only, in this disposable fixture; never hosted.
    db.query(f"begin; alter table public.study_group_members disable trigger study_admission_block_guard; update public.study_group_members set invitation_issued_at=clock_timestamp()-interval '169 hours' where group_id='{study}' and user_id='{pending}'; alter table public.study_group_members enable trigger study_admission_block_guard; commit;")
    c.ok('expired pending co-member has no warning',len(c.warnings(study,a,'study'))==1)
    c.student(pending,f"select * from public.shared_group_warnings('study','{study}')",False)
    generation=c.scalar(f"select invitation_id from public.study_group_members where group_id='{study}' and user_id='{pending}'")
    c.student(d,f"select public.study_invite('{study}',array['{pending}'::uuid],gen_random_uuid())")
    c.ok('pending reissue is not a warning episode',len(c.warnings(study,a,'study'))==1 and c.scalar(f"select invitation_id from public.study_group_members where group_id='{study}' and user_id='{pending}'")!=generation)
    sw=c.warnings(study,a,'study')[0]['warning_id']; c.dismiss(sw)
    c.ok('accepted blocked co-members equal academic access', bool(json.loads(c.student(b,"select public.my_study_groups()"))))
    c.leave(study,s,'study')
    c.ok('owner transfer preserves continuing dismissal', c.warnings(study,a,'study')==[] and c.warning_count(study)==1)
    # Pending invitees cannot use an existing real warning UUID either.
    c.dismiss(sw,pending)
    c.student(pending,f"select * from public.shared_group_warnings('study','{study}')",False)
    c.ok('pending cannot retrieve or dismiss', c.warning_count(study)==1)
    c.leave(study,b,'study')
    c.ok('accepted Study leave cascades', c.warning_count(study)==0)
    c.student(d,f"select public.study_invite('{study}',array['{b}'::uuid],gen_random_uuid())")
    c.ok('reinvitation pending remains warning-free', c.warnings(study,a,'study')==[])
    c.accept(study,b); new_sw=c.warnings(study,a,'study')[0]['warning_id']; c.dismiss(sw)
    c.ok('accepted Study rejoin fresh ID', new_sw!=sw and len(c.warnings(study,a,'study'))==1)
    c.leave(study,a,'study'); c.leave(study,b,'study'); c.leave(study,d,'study')
    c.ok('final Study deletion cascades', c.warning_count(study)==0 and c.scalar(f"select count(*) from public.study_groups where id='{study}'")=='0')
    # Known legacy offering-unresolved accepted members retain collaboration/warnings.
    legacy='c61b70c9-3db6-498b-831f-8f6cbea3964c'
    la='d8100000-0000-0000-0000-000000000001'; lb='d8100000-0000-0000-0000-000000000003'
    c.student(la,f"select public.block_student('{lb}')")
    c.ok('unresolved legacy offering does not gate accepted warning', len(c.warnings(legacy,la,'study'))==1)
    # Ineligible and anonymous sessions fail closed, and direct objects are inaccessible.
    db.query(f"delete from auth.identities where user_id='{ineligible}'")
    c.student(ineligible,f"select * from public.shared_group_warnings('messaging','{second_group}')",False)
    for statement in ["select * from private.shared_group_warning_state", "delete from private.shared_group_warning_state", f"select private.warning_co_members('messaging','{second_group}','{a}','{b}')"]:
        c.student(a,statement,False); c.ok('direct access denied: '+statement.split(' ')[0]+statement.split(' ')[-1],True)
    anon=db.query(f"begin; set local role anon; select * from public.shared_group_warnings('messaging','{second_group}'); commit;",check=False)
    denied(anon); c.ok('anonymous execute denied',True)
    c.ok('no published warning state', c.scalar("select count(*) from pg_publication_tables where schemaname='private' and tablename='shared_group_warning_state'")=='0')
    c.ok('no direct warning RLS policies', c.scalar("select count(*) from pg_policy where polrelid='private.shared_group_warning_state'::regclass")=='0')
    c.ok('helper not executable', c.scalar("select not has_function_privilege('authenticated','private.warning_co_members(text,uuid,uuid,uuid)','execute')")=='t')
    c.ok('definer fixed search path and volatile POST RPCs', c.scalar("select bool_and(prosecdef and provolatile='v' and proconfig=array['search_path=\"\"']) from pg_proc where oid in('public.shared_group_warnings(text,uuid)'::regprocedure,'public.dismiss_shared_group_warning(uuid)'::regprocedure)")=='t')
    db.report['warning_assertions']=c.results
    return c


def concurrency(c):
    db=c.db; a,b,s=c.a,c.b,c.s
    group=c.chat(); c.block()
    fetch=f"select * from public.shared_group_warnings('messaging','{group}')"
    c.race('simultaneous-initialization',a,fetch,a,fetch)
    c.ok('concurrent initialization unique',c.warning_count(group)==1)
    old=c.warnings(group)[0]['warning_id']; dismiss=f"select public.dismiss_shared_group_warning('{old}')"
    c.race('dismiss-before-fetch',a,dismiss,a,fetch)
    c.ok('fetch preserves committed dismissal',c.warnings(group)==[])
    c.race('unblock-before-fetch',a,f"select public.unblock_student('{b}')",a,fetch)
    c.ok('unblock race does not resurrect state',c.warning_count(group)==0)
    c.block(); old=c.warnings(group)[0]['warning_id']
    c.race('fetch-before-unblock',a,fetch,a,f"select public.unblock_student('{b}')")
    c.ok('later unblock removes initialized state',c.warning_count(group)==0)
    c.block(); old=c.warnings(group)[0]['warning_id']; dismiss=f"select public.dismiss_shared_group_warning('{old}')"
    c.race('target-leave-before-dismiss',b,f"select public.group_leave('{group}',gen_random_uuid())",a,dismiss)
    c.ok('leave wins over stale dismissal',c.warning_count(group)==0)
    add=f"select public.group_add_members('{group}',array['{b}'::uuid],gen_random_uuid())"
    c.race('target-rejoin-before-old-dismiss',s,add,a,dismiss,expect_wait=False)
    c.ok('rejoin old dismissal cannot hide replacement',len(c.warnings(group))==1 and c.warnings(group)[0]['warning_id']!=old)
    c.race('viewer-leave-before-fetch',a,f"select public.group_leave('{group}',gen_random_uuid())",a,fetch,True)
    c.ok('departed viewer denied after lock wait',c.warning_count(group)==0)
    c.add(group,a); old=c.warnings(group)[0]['warning_id']; dismiss=f"select public.dismiss_shared_group_warning('{old}')"
    c.race('reblock-before-old-dismiss',a,f"select public.unblock_student('{b}'); select public.block_student('{b}')",a,dismiss)
    c.ok('new block not dismissed by old ID',len(c.warnings(group))==1 and c.warnings(group)[0]['warning_id']!=old)
    # Study acceptance/owner departure use the same parent-group lock.
    study=c.study(); c.accept(study,a)
    token=c.scalar(f"select invitation_id from public.study_group_members where group_id='{study}' and user_id='{b}'")
    sf=f"select * from public.shared_group_warnings('study','{study}')"
    c.race('study-accept-before-fetch',b,f"select public.study_respond('{study}','{token}',true,gen_random_uuid())",a,sf)
    sw=c.warnings(study,a,'study')[0]['warning_id']; c.dismiss(sw)
    c.race('study-owner-transfer-before-fetch',s,f"select public.study_leave('{study}',gen_random_uuid())",a,sf)
    c.ok('owner transfer race keeps dismissal',c.warnings(study,a,'study')==[])
    c.race('study-target-leave-before-dismiss',b,f"select public.study_leave('{study}',gen_random_uuid())",a,f"select public.dismiss_shared_group_warning('{sw}')")
    c.ok('Study departure race removes state',c.warning_count(study)==0)
    c.race('study-final-deletion-before-fetch',a,f"select public.study_leave('{study}',gen_random_uuid())",a,sf,True)
    c.ok('deleted Study context denied after wait',c.warning_count(study)==0)
    db.report['warning_assertions']=c.results
