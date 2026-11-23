-- Apply the OCR migration first, then run with psql -v ON_ERROR_STOP=1.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_day date := (statement_timestamp() at time zone 'UTC')::date;
begin
  if has_function_privilege('anon', 'public.reserve_schedule_ocr(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.reserve_schedule_ocr(uuid)', 'execute') then
    raise exception 'Student clients must not reserve OCR directly';
  end if;
  if not has_function_privilege('service_role', 'public.reserve_schedule_ocr(uuid)', 'execute') then
    raise exception 'Backend cannot reserve OCR';
  end if;
  if has_table_privilege('authenticated', 'public.schedule_ocr_usage', 'select,insert,update,delete') then
    raise exception 'Students must not access usage counters';
  end if;
  for i in 1..5 loop
    if not public.reserve_schedule_ocr(v_user) then raise exception 'Premature user limit'; end if;
  end loop;
  if public.reserve_schedule_ocr(v_user) then raise exception 'User limit bypassed'; end if;
  if (select attempts from public.schedule_ocr_usage where usage_day=v_day and scope='global') <> 5 then
    raise exception 'Denied reservation consumed global allowance';
  end if;
  if not public.reserve_schedule_ocr(gen_random_uuid()) then raise exception 'User quotas are not isolated'; end if;
  update public.schedule_ocr_usage set attempts=100 where usage_day=v_day and scope='global';
  if public.reserve_schedule_ocr(gen_random_uuid()) then raise exception 'Global limit bypassed'; end if;
  -- Old counters do not affect today's allowance.
  delete from public.schedule_ocr_usage where usage_day=v_day;
  insert into public.schedule_ocr_usage values (v_day-1,'global',100), (v_day-1,v_user::text,5);
  if not public.reserve_schedule_ocr(v_user) then raise exception 'Previous day blocked new allowance'; end if;
end;
$$;
rollback;
