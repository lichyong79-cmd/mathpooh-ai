-- SOS336 · 결제/회차 등록과 시험지 배정 분리
-- 실행 전 기존 회차·시험·응시·성적 데이터는 변경하지 않습니다.

create table if not exists public.sos_program_cycle_enrollments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.sos_program_applications(id) on delete cascade,
  batch_id uuid not null references public.sos_program_batches(id) on delete restrict,
  cycle_id uuid not null references public.learning_cycles(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CANCELLED','REFUNDED')),
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, cycle_id)
);

create index if not exists sos_program_cycle_enrollments_cycle_idx
  on public.sos_program_cycle_enrollments(cycle_id,status,student_id);
create index if not exists sos_program_cycle_enrollments_student_idx
  on public.sos_program_cycle_enrollments(student_id,status,cycle_id);

-- 기존 등록 완료 신청이 있다면 선택 회차 기준으로 연결행을 복원합니다.
insert into public.sos_program_cycle_enrollments
  (application_id,batch_id,cycle_id,student_id,status,enrolled_at,updated_at)
select a.id,a.batch_id,c.cycle_id,a.student_id,'ACTIVE',coalesce(a.enrolled_at,now()),now()
from public.sos_program_applications a
join lateral (
  select unnest(a.selected_cycle_ids) as cycle_id
  where a.application_mode = 'CYCLES' and cardinality(a.selected_cycle_ids) > 0
  union
  select bc.cycle_id
  from public.sos_program_batch_cycles bc
  where bc.batch_id = a.batch_id
    and (a.application_mode <> 'CYCLES' or cardinality(a.selected_cycle_ids) = 0)
) c on true
where a.status = 'ENROLLED' and a.student_id is not null
on conflict (application_id,cycle_id) do update
set student_id=excluded.student_id,status='ACTIVE',updated_at=now();

alter table public.sos_program_cycle_enrollments enable row level security;
revoke all on public.sos_program_cycle_enrollments from anon, authenticated;
notify pgrst, 'reload schema';
