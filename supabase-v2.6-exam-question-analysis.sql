-- SOS 2.6 · 실전모의고사 전용 문항 분석 저장소
-- 문제은행과 분리되며 동일한 Problem DNA 분류 기준만 공유합니다.
create extension if not exists pgcrypto;

create table if not exists public.exam_question_analysis (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_no integer not null check (question_no > 0),
  major_unit text not null default '',
  middle_unit text not null default '',
  minor_unit text not null default '',
  detailed_topic text not null default '',
  question_type text not null default 'unknown',
  problem_types text[] not null default '{}',
  difficulty integer not null default 2 check (difficulty between 1 and 5),
  confidence numeric(5,4),
  analysis_version text not null default 'problem-dna-v3.4',
  analysis_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, question_no)
);

create index if not exists exam_question_analysis_exam_idx
  on public.exam_question_analysis(exam_id, question_no);

alter table public.exam_question_analysis enable row level security;
drop policy if exists "exam_question_analysis_authenticated" on public.exam_question_analysis;
create policy "exam_question_analysis_authenticated"
  on public.exam_question_analysis for all to authenticated
  using (true) with check (true);
