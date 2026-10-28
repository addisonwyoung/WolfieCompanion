"""Synthetic reminders, fixed disposable localhost PG only; never hosted URLs."""
import concurrent.futures
import subprocess
import time
import uuid
PSQL=['/opt/homebrew/opt/postgresql@18/bin/psql','-X','-qAt','-h','127.0.0.1','-p','55461','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
OWNER='e0000000-0000-0000-0000-000000000001'
COURSE='e1000000-0000-0000-0000-000000000001'
def query(sql,check=True):
 r=subprocess.run(PSQL,input=sql,text=True,capture_output=True,timeout=20)
 if check and r.returncode: raise AssertionError(r.stderr)
 return r

def auth(sql):return query(f"begin;set local role authenticated;select set_config('request.jwt.claim.sub','{OWNER}',true);{sql};commit;")
def item():
 id=str(uuid.uuid4())
 auth(f"insert into public.academic_items(id,user_course_id,title,type,due_date,due_time,reminder_offsets) values('{id}','{COURSE}','Concurrent exam','exam',current_date+10,'17:00',array['day'])")
 query(f"update public.academic_reminder_occurrences set due_at=clock_timestamp()-interval '1 minute' where item_id='{id}'")
 return id

def together(*jobs):
 with concurrent.futures.ThreadPoolExecutor(len(jobs)) as pool:
  return [future.result(timeout=25) for future in [pool.submit(job) for job in jobs]]
def held(sql,marker):
 p=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 p.stdin.write(f"begin;set local role authenticated;select set_config('request.jwt.claim.sub','{OWNER}',true);{sql};select pg_sleep(1) /*{marker}*/;commit;");p.stdin.close()
 end=time.monotonic()+5
 while time.monotonic()<end:
  if query(f"select exists(select 1 from pg_stat_activity where wait_event='PgSleep' and query like '%{marker}%')").stdout.strip()=='t':return p
  time.sleep(.02)
 raise AssertionError('lock never acquired')
try:
 query(f"insert into auth.users(id,email,email_confirmed_at) values('{OWNER}','reminderrace@stonybrook.edu',now());insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users where id='{OWNER}';insert into public.user_courses(id,user_id,course_code) values('{COURSE}','{OWNER}','CSE 416')")
 id=item();together(lambda:auth('select public.academic_reminders_refresh()'),lambda:auth('select public.academic_reminders_refresh()'))
 assert query(f"select count(*) from public.academic_reminder_occurrences where item_id='{id}' and state='delivered'").stdout.strip()=='1'
 for change,marker in [("completed_at=now()",'reminder-complete'),("due_date=due_date+1",'reminder-reschedule')]:
  id=item();writer=held(f"update public.academic_items set {change} where id='{id}'",marker)
  auth('select public.academic_reminders_refresh()');assert writer.wait(timeout=10)==0
  assert query(f"select count(*) from public.academic_reminder_occurrences where item_id='{id}' and state='delivered' and dismissed_at is null").stdout.strip()=='0'
 id=item();writer=held("select public.academic_reminder_settings_save('{\"enabled\":false,\"assignment\":[\"day\"],\"exam\":[\"week\",\"day\"],\"quiz\":[\"day\"],\"project\":[\"week\",\"day\"]}')",'reminder-disable')
 auth('select public.academic_reminders_refresh()');assert writer.wait(timeout=10)==0
 assert query(f"select count(*) from public.academic_reminder_occurrences where item_id='{id}' and state='delivered'").stdout.strip()=='0'
 print('PASS: duplicate refresh, direct completion/refresh, reschedule/refresh, settings/refresh commit ordering')
finally:
 query(f"delete from public.academic_items where user_id='{OWNER}';delete from public.user_courses where user_id='{OWNER}';delete from public.profiles where id='{OWNER}';delete from auth.identities where user_id='{OWNER}';delete from auth.users where id='{OWNER}'",False)
