-- SOS328 유료 운영 안정화
-- 기존 운영 DB에 1회 실행
alter table public.sos_program_applications
  add column if not exists payment_method text;

update public.sos_program_applications
set payment_method = 'BANK_TRANSFER'
where payment_method is null or payment_method = '';

alter table public.sos_program_applications
  alter column payment_method set default 'BANK_TRANSFER';

alter table public.sos_program_applications
  alter column payment_method set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sos_program_applications_payment_method_check'
      and conrelid = 'public.sos_program_applications'::regclass
  ) then
    alter table public.sos_program_applications
      add constraint sos_program_applications_payment_method_check
      check (payment_method in ('CARD','BANK_TRANSFER'));
  end if;
end $$;
