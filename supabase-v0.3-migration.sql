-- SOS v0.3 문제 라이브러리
create extension if not exists pgcrypto;

create table if not exists public.problem_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  exam_date date,
  subject text not null default '수학',
  question_count integer not null default 30 check (question_count between 1 and 100),
  analysis_count integer not null default 0 check (analysis_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.problems (
  id text primary key,
  problem_set_id uuid not null references public.problem_sets(id) on delete cascade,
  question_number integer not null check (question_number > 0),
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'ready')),
  created_at timestamptz not null default now(),
  unique(problem_set_id, question_number)
);

alter table public.problem_sets enable row level security;
alter table public.problems enable row level security;

create policy "problem_sets public select" on public.problem_sets for select using (true);
create policy "problem_sets public insert" on public.problem_sets for insert with check (true);
create policy "problem_sets public update" on public.problem_sets for update using (true) with check (true);
create policy "problem_sets public delete" on public.problem_sets for delete using (true);

create policy "problems public select" on public.problems for select using (true);
create policy "problems public insert" on public.problems for insert with check (true);
create policy "problems public update" on public.problems for update using (true) with check (true);
create policy "problems public delete" on public.problems for delete using (true);
