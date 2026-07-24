-- SOS v0.3.1 안전 재실행용 마이그레이션
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

-- 과거 problems 테이블이 다른 구조라면 삭제하지 않고 보존
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='problems'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='problems' AND column_name='problem_set_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='problems_legacy'
    ) THEN
      ALTER TABLE public.problems RENAME TO problems_legacy;
    ELSE
      DROP TABLE public.problems;
    END IF;
  END IF;
END $$;

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

drop policy if exists "problem_sets public all" on public.problem_sets;
drop policy if exists "problem_sets public select" on public.problem_sets;
drop policy if exists "problem_sets public insert" on public.problem_sets;
drop policy if exists "problem_sets public update" on public.problem_sets;
drop policy if exists "problem_sets public delete" on public.problem_sets;
drop policy if exists "problems public all" on public.problems;
drop policy if exists "problems public select" on public.problems;
drop policy if exists "problems public insert" on public.problems;
drop policy if exists "problems public update" on public.problems;
drop policy if exists "problems public delete" on public.problems;

create policy "problem_sets public all" on public.problem_sets for all using (true) with check (true);
create policy "problems public all" on public.problems for all using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.problem_sets, public.problems to anon, authenticated;
notify pgrst, 'reload schema';
