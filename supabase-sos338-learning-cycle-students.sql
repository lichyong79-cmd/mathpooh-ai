-- SOS338 · 회차별 학생 등록
-- 학생은 회차에 등록하고, 시험지는 별도로 회차에 연결합니다.

create extension if not exists pgcrypto;

create table if not exists public.learning_cycle_students (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.learning_cycles(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  application_id uuid references public.sos_program_applications(id) on delete set null,
  source text not null default 'ADMIN' check (source in ('ADMIN','SOS_APPLICATION')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CANCELLED','REFUNDED')),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id,student_id)
);

create index if not exists learning_cycle_students_student_idx
  on public.learning_cycle_students(student_id,status,cycle_id);

-- 기존 등록 완료 SOS 신청이 있다면 학생-회차 관계만 복원합니다.
insert into public.learning_cycle_students
  (cycle_id,student_id,application_id,source,status,registered_at,updated_at)
select c.cycle_id,a.student_id,a.id,'SOS_APPLICATION','ACTIVE',coalesce(a.enrolled_at,now()),now()
from public.sos_program_applications a
join lateral (
  select unnest(a.selected_cycle_ids) as cycle_id
  where a.application_mode = 'CYCLES' and cardinality(a.selected_cycle_ids) > 0
  union
  select bc.cycle_id from public.sos_program_batch_cycles bc
  where bc.batch_id = a.batch_id
    and (a.application_mode <> 'CYCLES' or cardinality(a.selected_cycle_ids) = 0)
) c on true
where a.status = 'ENROLLED' and a.student_id is not null
on conflict (cycle_id,student_id) do update
set application_id=excluded.application_id,source='SOS_APPLICATION',status='ACTIVE',updated_at=now();

alter table public.learning_cycle_students enable row level security;
revoke all on public.learning_cycle_students from anon, authenticated;
notify pgrst, 'reload schema';
