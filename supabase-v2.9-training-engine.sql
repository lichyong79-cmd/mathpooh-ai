create table if not exists public.sos_training_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  phase text not null check (phase in ('DIAGNOSIS','TRAINING')),
  status text not null default 'DRAFT' check (status in ('DRAFT','ASSIGNED','IN_PROGRESS','COMPLETED','PASSED','RETRAIN')),
  target_snapshot jsonb not null default '{}'::jsonb,
  parent_session_id uuid null references public.sos_training_sessions(id) on delete set null,
  round_no integer not null default 1,
  correct_count integer null,
  total_count integer not null,
  decision text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sos_training_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sos_training_sessions(id) on delete cascade,
  problem_id uuid not null references public.problem_bank_questions(id) on delete restrict,
  item_order integer not null,
  item_role text not null,
  student_answer text null,
  is_correct boolean null,
  unique(session_id,item_order), unique(session_id,problem_id)
);
create index if not exists sos_training_sessions_student_idx on public.sos_training_sessions(student_id,created_at desc);
alter table public.sos_training_sessions enable row level security;
alter table public.sos_training_items enable row level security;
drop policy if exists "sos training sessions service access" on public.sos_training_sessions;
create policy "sos training sessions service access" on public.sos_training_sessions for all using (auth.role()='service_role') with check (auth.role()='service_role');
drop policy if exists "sos training items service access" on public.sos_training_items;
create policy "sos training items service access" on public.sos_training_items for all using (auth.role()='service_role') with check (auth.role()='service_role');
