-- SOS v1.4: AI Analysis Workspace
-- Supabase SQL Editor에서 한 번 실행합니다.

create extension if not exists pgcrypto;

create table if not exists public.source_analysis (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null references public.source_files(id) on delete cascade,
  status text not null default 'WAITING' check (status in ('WAITING','RUNNING','REVIEW','DONE','FAILED')),
  progress integer not null default 0 check (progress between 0 and 100),
  current_step text not null default '분석 대기',
  total_questions integer not null default 0,
  objective_count integer not null default 0,
  subjective_count integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_file_id)
);

create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.source_analysis(id) on delete cascade,
  job_type text not null default 'FULL_ANALYSIS',
  status text not null default 'WAITING' check (status in ('WAITING','RUNNING','DONE','FAILED')),
  progress integer not null default 0 check (progress between 0 and 100),
  logs jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analysis_questions (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.source_analysis(id) on delete cascade,
  question_no integer not null,
  question_image text,
  answer text,
  status text not null default 'WAITING' check (status in ('WAITING','RUNNING','REVIEW','APPROVED','FAILED')),
  confidence numeric(5,4),
  ai_result jsonb not null default '{}'::jsonb,
  review_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(analysis_id, question_no)
);

create index if not exists source_analysis_source_file_idx on public.source_analysis(source_file_id);
create index if not exists analysis_jobs_analysis_idx on public.analysis_jobs(analysis_id, created_at desc);
create index if not exists analysis_questions_analysis_idx on public.analysis_questions(analysis_id, question_no);

alter table public.source_analysis enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.analysis_questions enable row level security;

do $$
begin
  execute 'drop policy if exists "source_analysis all" on public.source_analysis';
  execute 'create policy "source_analysis all" on public.source_analysis for all to anon, authenticated using (true) with check (true)';
  execute 'drop policy if exists "analysis_jobs all" on public.analysis_jobs';
  execute 'create policy "analysis_jobs all" on public.analysis_jobs for all to anon, authenticated using (true) with check (true)';
  execute 'drop policy if exists "analysis_questions all" on public.analysis_questions';
  execute 'create policy "analysis_questions all" on public.analysis_questions for all to anon, authenticated using (true) with check (true)';
end $$;
