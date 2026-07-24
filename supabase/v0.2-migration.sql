-- MathPooh AI v0.2 migration
-- 기존 schema.sql을 실행했다면 이 파일만 추가 실행하세요.

create table if not exists learning_cycles (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  attempt_id uuid references exam_attempts(id) on delete set null,
  target_problem_id uuid references problems(id) on delete set null,
  target_question_no integer,
  current_stage text not null default 'diagnostic1'
    check (current_stage in ('diagnostic1','diagnostic2','training1','training2','next_exam','completed')),
  diagnostic1_problem_ids uuid[] not null default '{}',
  diagnostic2_problem_ids uuid[] not null default '{}',
  training1_problem_ids uuid[] not null default '{}',
  training2_problem_ids uuid[] not null default '{}',
  diagnostic1_result jsonb not null default '{}'::jsonb,
  diagnostic2_result jsonb not null default '{}'::jsonb,
  training1_result jsonb not null default '{}'::jsonb,
  training2_result jsonb not null default '{}'::jsonb,
  ai_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table learning_cycles enable row level security;

drop policy if exists "pilot learning cycles all" on learning_cycles;
create policy "pilot learning cycles all"
on learning_cycles for all
using (true)
with check (true);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists learning_cycles_updated_at on learning_cycles;
create trigger learning_cycles_updated_at
before update on learning_cycles
for each row execute function set_updated_at();
