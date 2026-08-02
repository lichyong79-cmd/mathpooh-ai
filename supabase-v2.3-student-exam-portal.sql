-- SOS v2.3 학생 온라인 시험 포털
create extension if not exists pgcrypto;

alter table public.students add column if not exists phone text;
alter table public.students add column if not exists parent_phone text;
alter table public.students add column if not exists status text not null default '정상';
alter table public.students add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
alter table public.students add column if not exists password_changed boolean not null default false;
alter table public.students add column if not exists password_reset_at timestamptz;
alter table public.students add column if not exists updated_at timestamptz not null default now();
alter table public.students add column if not exists parent_phone text;
alter table public.students add column if not exists memo text not null default '';
alter table public.students add column if not exists joined_at date not null default current_date;

alter table public.exams add column if not exists student_open boolean not null default false;
alter table public.exams add column if not exists open_at timestamptz;
alter table public.exams add column if not exists close_at timestamptz;

create table if not exists public.exam_registrations (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  registered_at timestamptz not null default now(),
  unique(exam_id, student_id)
);

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'in_progress' check(status in ('in_progress','submitted','cancelled')),
  answers jsonb not null default '{}'::jsonb,
  answer_changes jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer,
  correct_count integer,
  wrong_numbers integer[] not null default '{}',
  unanswered_numbers integer[] not null default '{}',
  graded_at timestamptz,
  unique(exam_id, student_id)
);

alter table public.exam_registrations enable row level security;
alter table public.exam_attempts enable row level security;

drop policy if exists "student registrations own select" on public.exam_registrations;
create policy "student registrations own select" on public.exam_registrations for select to authenticated
using (student_id in (select id from public.students where auth_user_id = auth.uid()));

drop policy if exists "student attempts own select" on public.exam_attempts;
create policy "student attempts own select" on public.exam_attempts for select to authenticated
using (student_id in (select id from public.students where auth_user_id = auth.uid()));

drop policy if exists "student attempts own insert" on public.exam_attempts;
create policy "student attempts own insert" on public.exam_attempts for insert to authenticated
with check (student_id in (select id from public.students where auth_user_id = auth.uid()));

drop policy if exists "student attempts own update" on public.exam_attempts;
create policy "student attempts own update" on public.exam_attempts for update to authenticated
using (student_id in (select id from public.students where auth_user_id = auth.uid()))
with check (student_id in (select id from public.students where auth_user_id = auth.uid()));

grant select on public.exam_registrations to authenticated;
grant select, insert, update on public.exam_attempts to authenticated;
notify pgrst, 'reload schema';
