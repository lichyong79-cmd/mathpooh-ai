-- SOS v1.0 훈련 문제은행
create extension if not exists pgcrypto;

create table if not exists public.training_problems (
  id uuid primary key default gen_random_uuid(),
  problem_code text not null unique,
  grade text not null,
  subject text not null,
  unit text not null,
  difficulty text not null default '중',
  problem_type text not null default '객관식',
  source text not null default '',
  answer text not null,
  memo text not null default '',
  status text not null default '검수대기' check (status in ('검수대기','사용가능','보류')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_problems_grade_subject_idx on public.training_problems (grade, subject);
create index if not exists training_problems_unit_idx on public.training_problems (unit);

alter table public.training_problems enable row level security;
drop policy if exists "training_problems_all" on public.training_problems;
create policy "training_problems_all" on public.training_problems for all using (true) with check (true);
