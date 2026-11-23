-- Durable daily OCR budgets. Images and extracted text are never stored here.
create table public.schedule_ocr_usage (
  usage_day date not null,
  scope text not null,
  attempts integer not null default 0 check (attempts >= 0),
  primary key (usage_day, scope)
);
alter table public.schedule_ocr_usage enable row level security;
revoke all on public.schedule_ocr_usage from public, anon, authenticated;

-- Reserve before calling Google; failed calls also consume an attempt.
-- The global row serializes concurrent reservations across backend instances.
create function public.reserve_schedule_ocr(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (statement_timestamp() at time zone 'UTC')::date;
  v_global integer;
  v_user integer;
begin
  if p_user_id is null then raise exception 'User is required'; end if;
  insert into public.schedule_ocr_usage (usage_day, scope)
    values (v_day, 'global') on conflict do nothing;
  select attempts into v_global from public.schedule_ocr_usage
    where usage_day = v_day and scope = 'global' for update;
  if v_global >= 100 then return false; end if;
  insert into public.schedule_ocr_usage (usage_day, scope)
    values (v_day, p_user_id::text) on conflict do nothing;
  select attempts into v_user from public.schedule_ocr_usage
    where usage_day = v_day and scope = p_user_id::text for update;
  if v_user >= 5 then return false; end if;
  update public.schedule_ocr_usage set attempts = attempts + 1
    where usage_day = v_day and scope in ('global', p_user_id::text);
  return true;
end;
$$;
revoke all on function public.reserve_schedule_ocr(uuid) from public, anon, authenticated;
grant execute on function public.reserve_schedule_ocr(uuid) to service_role;
