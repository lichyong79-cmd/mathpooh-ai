-- SOS310 · 학부모 전용 5회 묶음 신청
create extension if not exists pgcrypto;

create table if not exists public.sos_program_batches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  price integer not null default 350000 check (price >= 0),
  application_start timestamptz,
  application_end timestamptz,
  is_published boolean not null default false,
  capacity integer,
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sos_program_batch_cycles (
  batch_id uuid not null references public.sos_program_batches(id) on delete cascade,
  cycle_id uuid not null references public.learning_cycles(id) on delete cascade,
  slot_no integer not null check (slot_no between 1 and 5),
  primary key (batch_id, cycle_id),
  unique (batch_id, slot_no)
);

create table if not exists public.sos_program_applications (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.sos_program_batches(id) on delete restrict,
  student_id uuid references public.students(id) on delete set null,
  parent_name text not null default '',
  parent_phone text not null,
  student_name text not null,
  student_phone text not null default '',
  school text not null default '',
  grade text not null default '고1',
  status text not null default 'REQUESTED' check (status in ('REQUESTED','PAID','ENROLLED','CANCELLED','REFUNDED')),
  source text not null default 'PUBLIC' check (source in ('PUBLIC','PARENT')),
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  enrolled_at timestamptz,
  admin_memo text not null default '',
  updated_at timestamptz not null default now(),
  unique (batch_id, parent_phone, student_name)
);

create table if not exists public.sos_program_enrollments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.sos_program_applications(id) on delete cascade,
  batch_id uuid not null references public.sos_program_batches(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','COMPLETED','CANCELLED','REFUNDED')),
  enrolled_at timestamptz not null default now(),
  unique (batch_id, student_id)
);

create index if not exists sos_program_batches_public_idx on public.sos_program_batches(is_published,application_start,application_end);
create index if not exists sos_program_applications_status_idx on public.sos_program_applications(status,requested_at desc);
create index if not exists sos_program_applications_parent_idx on public.sos_program_applications(parent_phone,requested_at desc);
create index if not exists sos_program_enrollments_student_idx on public.sos_program_enrollments(student_id,enrolled_at desc);

alter table public.sos_program_batches enable row level security;
alter table public.sos_program_batch_cycles enable row level security;
alter table public.sos_program_applications enable row level security;
alter table public.sos_program_enrollments enable row level security;
revoke all on public.sos_program_batches, public.sos_program_batch_cycles, public.sos_program_applications, public.sos_program_enrollments from anon, authenticated;
notify pgrst, 'reload schema';
