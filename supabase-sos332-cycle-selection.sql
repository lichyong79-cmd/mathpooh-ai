-- SOS332 · 5회 전체/회차별 신청 지원
-- 기존 데이터는 그대로 유지됩니다.

alter table public.sos_program_applications
  add column if not exists application_mode text not null default 'ALL',
  add column if not exists selected_cycle_ids uuid[] not null default '{}'::uuid[],
  add column if not exists charged_price integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sos_program_applications'::regclass
      and conname = 'sos_program_applications_mode_check'
  ) then
    alter table public.sos_program_applications
      add constraint sos_program_applications_mode_check
      check (application_mode in ('ALL','CYCLES'));
  end if;
end $$;

update public.sos_program_applications
set application_mode = coalesce(application_mode, 'ALL'),
    selected_cycle_ids = coalesce(selected_cycle_ids, '{}'::uuid[])
where application_mode is null or selected_cycle_ids is null;

notify pgrst, 'reload schema';
