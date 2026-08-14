-- SOS 3.5 · 관리자 단계별 리셋 감사 로그
create table if not exists public.sos_admin_reset_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  root_session_id uuid,
  target_session_id uuid,
  reset_scope text not null check (reset_scope in ('STAGE','REVIEW','FULL')),
  target_phase text,
  target_round_no integer,
  target_cycle_kind text,
  admin_user_id uuid,
  admin_email text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sos_admin_reset_logs_student_time_idx on public.sos_admin_reset_logs(student_id,created_at desc);
alter table public.sos_admin_reset_logs enable row level security;
drop policy if exists "sos admin reset logs authenticated" on public.sos_admin_reset_logs;
create policy "sos admin reset logs authenticated" on public.sos_admin_reset_logs for all to authenticated using (true) with check (true);
