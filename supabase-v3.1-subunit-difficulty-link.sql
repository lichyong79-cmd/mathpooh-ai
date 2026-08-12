-- SOS 3.1 · 소단원별 학생 8단계 ↔ 문항 8단계 난이도 연동
-- 1=2점 / 2=3점 / 3=어3 / 4=쉬4 / 5=적4 / 6=어4 / 7=준킬러 / 8=킬러

-- 학생은 '전체 수학 미터 1개'를 갖지 않는다.
-- 학생의 실체는 소단원별 난이도 미터의 집합이다.
create table if not exists public.sos_student_subunit_meters (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject text not null,
  major_unit text not null default '',
  subunit text not null,
  subunit_key text not null,
  difficulty_meter numeric(4,2) not null default 3.00,
  sample_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(student_id, subunit_key)
);

alter table public.sos_student_subunit_meters
  drop constraint if exists sos_student_subunit_meter_check;
alter table public.sos_student_subunit_meters
  add constraint sos_student_subunit_meter_check
  check (difficulty_meter between 1 and 8);

create index if not exists sos_student_subunit_meter_student_idx
  on public.sos_student_subunit_meters(student_id, subject, major_unit, subunit);

-- 문항은 자기 자신에게 하나의 동적 난이도 미터를 가진다.
-- 최초값은 현재 DNA 8단계 난이도.
alter table public.problem_bank_questions
  add column if not exists difficulty_meter numeric(4,2),
  add column if not exists difficulty_meter_samples integer not null default 0,
  add column if not exists difficulty_meter_unique_students integer not null default 0,
  add column if not exists difficulty_meter_origin text not null default 'DNA',
  add column if not exists difficulty_meter_updated_at timestamptz;

update public.problem_bank_questions
set difficulty_meter =
  case
    when difficulty ~ '^[1-8]$' then difficulty::numeric
    else 3.00
  end
where difficulty_meter is null;

alter table public.problem_bank_questions
  alter column difficulty_meter set default 3.00,
  alter column difficulty_meter set not null;

alter table public.problem_bank_questions
  drop constraint if exists problem_bank_difficulty_meter_check;
alter table public.problem_bank_questions
  add constraint problem_bank_difficulty_meter_check
  check (difficulty_meter between 1 and 8);

-- 훈련 응답 당시 어떤 소단원 미터/문항 미터를 썼는지 추적
alter table public.sos_training_items
  add column if not exists response_seconds integer,
  add column if not exists answered_at timestamptz,
  add column if not exists subunit_key text,
  add column if not exists student_meter_before numeric(4,2),
  add column if not exists student_meter_after numeric(4,2),
  add column if not exists problem_meter_before numeric(4,2),
  add column if not exists problem_meter_after numeric(4,2);

create table if not exists public.sos_difficulty_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  problem_id uuid not null references public.problem_bank_questions(id) on delete cascade,
  training_item_id uuid references public.sos_training_items(id) on delete set null,
  subject text not null,
  major_unit text not null default '',
  subunit text not null,
  subunit_key text not null,
  is_correct boolean not null,
  response_seconds integer,
  student_meter_before numeric(4,2) not null,
  student_meter_after numeric(4,2) not null,
  problem_meter_before numeric(4,2) not null,
  problem_meter_after numeric(4,2) not null,
  problem_unique_students integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists sos_difficulty_events_training_item_uidx
  on public.sos_difficulty_events(training_item_id)
  where training_item_id is not null;

create index if not exists sos_difficulty_events_problem_student_idx
  on public.sos_difficulty_events(problem_id, student_id);

create index if not exists sos_difficulty_events_student_subunit_idx
  on public.sos_difficulty_events(student_id, subunit_key, created_at desc);

alter table public.sos_student_subunit_meters enable row level security;
drop policy if exists "sos student subunit meters authenticated" on public.sos_student_subunit_meters;
create policy "sos student subunit meters authenticated"
  on public.sos_student_subunit_meters for all to authenticated
  using (true) with check (true);

alter table public.sos_difficulty_events enable row level security;
drop policy if exists "sos difficulty events authenticated" on public.sos_difficulty_events;
create policy "sos difficulty events authenticated"
  on public.sos_difficulty_events for all to authenticated
  using (true) with check (true);

comment on table public.sos_student_subunit_meters is '학생의 소단원별 SOS 8단계 능력 미터';
comment on column public.problem_bank_questions.difficulty_meter is '문항 동적 난이도. 최초 DNA, 서로 다른 학생 20명부터 실측 반영';
