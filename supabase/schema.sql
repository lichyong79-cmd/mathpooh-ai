-- MathPooh AI MVP schema
create extension if not exists pgcrypto;

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school text,
  grade text,
  phone_last8 text unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists mock_exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  exam_date date,
  duration_minutes integer not null default 100,
  status text not null default 'draft' check (status in ('draft','ready','closed')),
  created_at timestamptz not null default now()
);

create table if not exists problems (
  id uuid primary key default gen_random_uuid(),
  source_name text,
  question_no integer,
  image_url text,
  answer text,
  solution_text text,
  ai_summary text,
  ai_concepts jsonb not null default '[]'::jsonb,
  ai_embedding jsonb,
  created_at timestamptz not null default now()
);

create table if not exists exam_problems (
  exam_id uuid references mock_exams(id) on delete cascade,
  problem_id uuid references problems(id) on delete cascade,
  question_no integer not null,
  points integer not null default 3,
  primary key (exam_id, question_no)
);

create table if not exists exam_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  exam_id uuid references mock_exams(id) on delete cascade,
  started_at timestamptz,
  submitted_at timestamptz,
  score integer,
  answers jsonb not null default '{}'::jsonb,
  timings jsonb not null default '{}'::jsonb,
  wrong_numbers integer[] not null default '{}',
  target_question_no integer,
  created_at timestamptz not null default now()
);

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  attempt_id uuid references exam_attempts(id) on delete cascade,
  target_problem_id uuid references problems(id),
  diagnostic_problem_ids uuid[] not null default '{}',
  training_problem_ids uuid[] not null default '{}',
  ai_reason text,
  status text not null default 'pending' check (status in ('pending','approved','replaced','completed')),
  created_at timestamptz not null default now()
);

alter table students enable row level security;
alter table mock_exams enable row level security;
alter table problems enable row level security;
alter table exam_problems enable row level security;
alter table exam_attempts enable row level security;
alter table recommendations enable row level security;

-- Pilot-stage policies. Replace with role-based policies after authentication is added.
create policy "pilot students all" on students for all using (true) with check (true);
create policy "pilot exams all" on mock_exams for all using (true) with check (true);
create policy "pilot problems all" on problems for all using (true) with check (true);
create policy "pilot exam problems all" on exam_problems for all using (true) with check (true);
create policy "pilot attempts all" on exam_attempts for all using (true) with check (true);
create policy "pilot recommendations all" on recommendations for all using (true) with check (true);
