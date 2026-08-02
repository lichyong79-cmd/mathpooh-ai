create table if not exists public.sos_recommendations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','assigned','completed','cancelled')),
  weakness_snapshot jsonb not null default '{}'::jsonb,
  problem_ids uuid[] not null default '{}'::uuid[],
  note text not null default '',
  created_by uuid null,
  assigned_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sos_recommendations_student_idx
  on public.sos_recommendations(student_id, created_at desc);

alter table public.sos_recommendations enable row level security;

drop policy if exists "sos recommendations service access" on public.sos_recommendations;
create policy "sos recommendations service access"
  on public.sos_recommendations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
