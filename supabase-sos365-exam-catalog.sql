-- SOS364 SQL 적용 후 실행. 기존 시험지와 답안은 수정하지 않습니다.
begin;
create table if not exists public.sos_exam_catalog (
  id uuid primary key default gen_random_uuid(),
  formal_sequence integer not null check (formal_sequence > 0),
  scope_code text not null check (scope_code in ('ALGEBRA','ALGEBRA_CALC1','FULL')),
  exam_id uuid not null references public.exams(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique(formal_sequence,scope_code),
  unique(exam_id)
);
alter table public.sos_exam_catalog enable row level security;
revoke all on public.sos_exam_catalog from anon,authenticated;
grant all on public.sos_exam_catalog to service_role;
commit;
notify pgrst,'reload schema';
