-- SOS278 · 난이도 재판정 큐
-- 배포 전에 이 SQL을 먼저 실행하세요. 기존 데이터는 건드리지 않습니다.

create table if not exists public.sos_difficulty_regrade_jobs (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.problem_bank_questions(id) on delete cascade,
  priority integer not null default 100,       -- 낮을수록 먼저 처리
  status text not null default 'QUEUED',       -- QUEUED / RUNNING / DONE / FAILED / SKIPPED
  attempt_count integer not null default 0,
  before_difficulty text null,
  after_difficulty text null,
  decision text null,                          -- graded / unclassified
  review_required boolean null,
  confidence numeric null,
  last_error text null,
  queued_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique (question_id)
);

create index if not exists sos_difficulty_regrade_jobs_pick_idx
  on public.sos_difficulty_regrade_jobs (status, priority, queued_at);

create index if not exists sos_difficulty_regrade_jobs_status_idx
  on public.sos_difficulty_regrade_jobs (status);

alter table public.sos_difficulty_regrade_jobs enable row level security;

drop policy if exists sos_difficulty_regrade_jobs_service on public.sos_difficulty_regrade_jobs;
create policy sos_difficulty_regrade_jobs_service
  on public.sos_difficulty_regrade_jobs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists sos_difficulty_regrade_jobs_read on public.sos_difficulty_regrade_jobs;
create policy sos_difficulty_regrade_jobs_read
  on public.sos_difficulty_regrade_jobs
  for select
  using (auth.uid() is not null);
