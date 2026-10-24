-- The original end-minute check was named study_group_availability_check
-- because it also compares end_minute to start_minute. Remove its obsolete
-- 15-minute condition; migration 004 already added the replacement range check.
begin;

alter table public.study_group_availability
  drop constraint if exists study_group_availability_check;

commit;
