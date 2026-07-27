-- SOS23 · AI 검수 결과 → 문제은행 등록 엔진
create extension if not exists pgcrypto;

create table if not exists public.problem_bank_questions (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null references public.source_files(id) on delete cascade,
  analysis_question_id uuid not null references public.analysis_questions(id) on delete cascade,
  question_no integer not null,
  problem_code text not null unique,
  title text not null default '',
  grade text not null default '',
  subject text not null default '',
  unit text not null default '',
  topic text not null default '',
  difficulty text not null default '중',
  question_type text not null default 'unknown',
  answer text not null default '',
  summary text not null default '',
  source_name text not null default '',
  exam_pdf_path text,
  solution_pdf_path text,
  confidence numeric,
  embedding_text text not null default '',
  embedding jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','HOLD','ARCHIVED')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_question_id),
  unique (source_file_id, question_no)
);

create index if not exists problem_bank_questions_source_idx on public.problem_bank_questions(source_file_id);
create index if not exists problem_bank_questions_subject_unit_idx on public.problem_bank_questions(subject, unit);
create index if not exists problem_bank_questions_topic_idx on public.problem_bank_questions(topic);
create index if not exists problem_bank_questions_status_idx on public.problem_bank_questions(status);

alter table public.problem_bank_questions enable row level security;
drop policy if exists "problem_bank_questions_all" on public.problem_bank_questions;
create policy "problem_bank_questions_all" on public.problem_bank_questions for all using (true) with check (true);
