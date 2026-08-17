-- SOS242 운영 회차: 실전모의고사 -> SOS 전체 학습을 하나의 회차로 묶는다.
create extension if not exists pgcrypto;

create table if not exists public.learning_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'ACTIVE' check (status in ('PLANNED','ACTIVE','CLOSED')),
  memo text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.learning_cycle_exams (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.learning_cycles(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  linked_at timestamptz not null default now(),
  unique(exam_id)
);

create index if not exists learning_cycles_dates_idx on public.learning_cycles(start_date desc,end_date desc);
create index if not exists learning_cycle_exams_cycle_idx on public.learning_cycle_exams(cycle_id);

alter table public.learning_cycles enable row level security;
alter table public.learning_cycle_exams enable row level security;

drop policy if exists "learning cycles authenticated read" on public.learning_cycles;
create policy "learning cycles authenticated read" on public.learning_cycles for select to authenticated using (true);
drop policy if exists "learning cycles authenticated write" on public.learning_cycles;
create policy "learning cycles authenticated write" on public.learning_cycles for all to authenticated using (true) with check (true);

drop policy if exists "learning cycle exams authenticated read" on public.learning_cycle_exams;
create policy "learning cycle exams authenticated read" on public.learning_cycle_exams for select to authenticated using (true);
drop policy if exists "learning cycle exams authenticated write" on public.learning_cycle_exams;
create policy "learning cycle exams authenticated write" on public.learning_cycle_exams for all to authenticated using (true) with check (true);

grant select,insert,update,delete on public.learning_cycles,public.learning_cycle_exams to authenticated;
notify pgrst, 'reload schema';
