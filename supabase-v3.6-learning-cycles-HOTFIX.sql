-- SOS242-1 HOTFIX
-- 기존 v0.2의 student 학습용 public.learning_cycles 와
-- SOS242의 운영 회차용 learning_cycles 이름 충돌을 안전하게 분리합니다.
-- 기존 데이터는 삭제하지 않고 public.learning_cycles_legacy 로 보존합니다.

create extension if not exists pgcrypto;

-- 1) 기존 learning_cycles가 예전 학생 학습 사이클 테이블이면 이름을 보존 변경
do $$
begin
  if to_regclass('public.learning_cycles') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'learning_cycles'
         and column_name = 'student_id'
     )
     and not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'learning_cycles'
         and column_name = 'start_date'
     )
  then
    if to_regclass('public.learning_cycles_legacy') is null then
      alter table public.learning_cycles rename to learning_cycles_legacy;
    else
      raise exception
        'learning_cycles_legacy already exists. 기존 learning_cycles 테이블 상태를 먼저 확인해 주세요.';
    end if;
  end if;
end $$;

-- 2) SOS242 운영 회차 테이블 생성
create table if not exists public.learning_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'ACTIVE',
  memo text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 혹시 운영 회차 테이블이 일부만 만들어진 상태여도 보강
alter table public.learning_cycles
  add column if not exists name text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists status text default 'ACTIVE',
  add column if not exists memo text default '',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.learning_cycles
set
  name = coalesce(nullif(name, ''), '회차'),
  status = coalesce(nullif(status, ''), 'ACTIVE'),
  memo = coalesce(memo, ''),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  name is null
  or status is null
  or memo is null
  or created_at is null
  or updated_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.learning_cycles'::regclass
      and conname = 'learning_cycles_status_check'
  ) then
    alter table public.learning_cycles
      add constraint learning_cycles_status_check
      check (status in ('PLANNED','ACTIVE','CLOSED')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.learning_cycles'::regclass
      and conname = 'learning_cycles_date_check'
  ) then
    alter table public.learning_cycles
      add constraint learning_cycles_date_check
      check (end_date >= start_date) not valid;
  end if;
end $$;

-- 3) 회차-실전모의고사 연결 테이블
create table if not exists public.learning_cycle_exams (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.learning_cycles(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  linked_at timestamptz not null default now(),
  unique(exam_id)
);

alter table public.learning_cycle_exams
  add column if not exists linked_at timestamptz default now();

create index if not exists learning_cycles_dates_idx
  on public.learning_cycles(start_date desc, end_date desc);

create index if not exists learning_cycle_exams_cycle_idx
  on public.learning_cycle_exams(cycle_id);

-- 4) RLS / 권한
alter table public.learning_cycles enable row level security;
alter table public.learning_cycle_exams enable row level security;

drop policy if exists "learning cycles authenticated read" on public.learning_cycles;
create policy "learning cycles authenticated read"
on public.learning_cycles
for select to authenticated
using (true);

drop policy if exists "learning cycles authenticated write" on public.learning_cycles;
create policy "learning cycles authenticated write"
on public.learning_cycles
for all to authenticated
using (true)
with check (true);

drop policy if exists "learning cycle exams authenticated read" on public.learning_cycle_exams;
create policy "learning cycle exams authenticated read"
on public.learning_cycle_exams
for select to authenticated
using (true);

drop policy if exists "learning cycle exams authenticated write" on public.learning_cycle_exams;
create policy "learning cycle exams authenticated write"
on public.learning_cycle_exams
for all to authenticated
using (true)
with check (true);

grant select, insert, update, delete
on public.learning_cycles, public.learning_cycle_exams
to authenticated;

notify pgrst, 'reload schema';

-- 확인용
select
  'SOS242 operation cycles ready' as result,
  to_regclass('public.learning_cycles') as operation_cycle_table,
  to_regclass('public.learning_cycles_legacy') as preserved_old_table,
  to_regclass('public.learning_cycle_exams') as exam_link_table;
