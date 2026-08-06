create table if not exists public.exam_activity_logs (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attempt_id uuid references public.exam_attempts(id) on delete cascade,
  event_type text not null,
  detail text not null default '',
  occurred_at timestamptz not null default now()
);
create index if not exists exam_activity_logs_exam_time_idx on public.exam_activity_logs(exam_id, occurred_at desc);
alter table public.exam_activity_logs enable row level security;
