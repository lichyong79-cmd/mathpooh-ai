-- SOS364 · 날짜 회차와 학생별 공식 시험순번 분리
-- 실행 순서: 이 SQL을 먼저 실행한 뒤 SOS364 코드를 배포합니다.
-- 기존 시험/답안/점수/SOS 세션은 삭제하거나 다시 만들지 않습니다.

create extension if not exists pgcrypto;

-- 날짜 회차는 앞으로 "응시 일정"으로 사용합니다.
alter table public.learning_cycles
  add column if not exists scheduled_at timestamptz,
  add column if not exists attendance_mode text not null default 'ZOOM',
  add column if not exists booking_open boolean not null default true;

do $$ begin
  alter table public.learning_cycles
    add constraint learning_cycles_attendance_mode_check
    check (attendance_mode in ('ZOOM','SELF'));
exception when duplicate_object then null; end $$;

-- 한 응시 일정에는 서로 다른 공식순번/범위 시험을 함께 연결할 수 있습니다.
alter table public.learning_cycle_exams
  add column if not exists formal_sequence integer,
  add column if not exists scope_code text not null default 'FULL';

-- 같은 시험지를 신규 학생이 다른 날짜에 볼 수 있어야 하므로 시험지 1회성 연결을 해제합니다.
alter table public.learning_cycle_exams
  drop constraint if exists learning_cycle_exams_exam_id_key;
create unique index if not exists learning_cycle_exams_cycle_exam_uq
  on public.learning_cycle_exams(cycle_id,exam_id);

do $$ begin
  alter table public.learning_cycle_exams
    add constraint learning_cycle_exams_sequence_check
    check (formal_sequence is null or formal_sequence >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.learning_cycle_exams
    add constraint learning_cycle_exams_scope_check
    check (scope_code in ('ALGEBRA','ALGEBRA_CALC1','FULL'));
exception when duplicate_object then null; end $$;

create unique index if not exists learning_cycle_exams_sequence_scope_uq
  on public.learning_cycle_exams(cycle_id,formal_sequence,scope_code)
  where formal_sequence is not null;

-- 학생의 날짜 선택과 시험 내용 순번을 분리합니다.
alter table public.learning_cycle_students
  add column if not exists formal_sequence integer,
  add column if not exists scope_code text not null default 'FULL',
  add column if not exists attendance_mode text not null default 'ZOOM',
  add column if not exists scheduled_at timestamptz,
  add column if not exists booking_status text not null default 'SCHEDULED',
  add column if not exists sos_gate_status text not null default 'OPEN',
  add column if not exists sos_passed_at timestamptz,
  add column if not exists wrong_answer_due_at timestamptz,
  add column if not exists wrong_answer_submitted_at timestamptz,
  add column if not exists is_practice boolean not null default false;

do $$ begin
  alter table public.learning_cycle_students
    add constraint learning_cycle_students_sequence_check
    check (formal_sequence is null or formal_sequence >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.learning_cycle_students
    add constraint learning_cycle_students_scope_check
    check (scope_code in ('ALGEBRA','ALGEBRA_CALC1','FULL'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.learning_cycle_students
    add constraint learning_cycle_students_attendance_mode_check
    check (attendance_mode in ('ZOOM','SELF'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.learning_cycle_students
    add constraint learning_cycle_students_booking_status_check
    check (booking_status in ('SCHEDULED','WAITING','IN_PROGRESS','COMPLETED','NO_SHOW','CANCELLED'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.learning_cycle_students
    add constraint learning_cycle_students_sos_gate_check
    check (sos_gate_status in ('OPEN','LOCKED','PASSED','OVERRIDE'));
exception when duplicate_object then null; end $$;

create index if not exists learning_cycle_students_schedule_idx
  on public.learning_cycle_students(cycle_id,booking_status,formal_sequence,scope_code);
create index if not exists learning_cycle_students_progress_idx
  on public.learning_cycle_students(student_id,formal_sequence,status);

-- 실제 시험 배정에도 학생별 운영 정보를 보존합니다.
alter table public.exam_registrations
  add column if not exists cycle_student_id uuid references public.learning_cycle_students(id) on delete set null,
  add column if not exists formal_sequence integer,
  add column if not exists scope_code text not null default 'FULL',
  add column if not exists attendance_mode text not null default 'ZOOM',
  add column if not exists scheduled_at timestamptz,
  add column if not exists booking_status text not null default 'SCHEDULED';

create index if not exists exam_registrations_schedule_idx
  on public.exam_registrations(student_id,scheduled_at,booking_status);

-- 응시 기록에는 연습/공식 여부만 덧붙입니다. 답안과 점수는 그대로 둡니다.
alter table public.exam_attempts
  add column if not exists is_practice boolean not null default false,
  add column if not exists formal_sequence integer,
  add column if not exists scope_code text;

alter table public.sos_program_applications
  add column if not exists purchased_count integer,
  add column if not exists scope_code text not null default 'FULL';

update public.sos_program_applications
set purchased_count=coalesce(purchased_count,
  case when cardinality(selected_cycle_ids)>0 then cardinality(selected_cycle_ids) else 5 end),
    scope_code=coalesce(scope_code,'FULL');

-- 기존 날짜 회차의 기본 시각: 시작일 밤 11시(한국시간).
update public.learning_cycles
set scheduled_at = (start_date::timestamp + time '23:00') at time zone 'Asia/Seoul'
where scheduled_at is null;

-- 기존 학부모 신청 날짜는 그대로 참가 일정으로 유지합니다.
update public.learning_cycle_students lcs
set scheduled_at=coalesce(lcs.scheduled_at,lc.scheduled_at),
    attendance_mode=coalesce(lcs.attendance_mode,'ZOOM'),
    scope_code=coalesce(lcs.scope_code,'FULL')
from public.learning_cycles lc
where lc.id=lcs.cycle_id;

-- 최현슬·윤동규·배유담의 8월 네 시험은 연습 기록입니다.
-- 이름이 아니라 현재 학생/시험 UUID 조합을 찾아 표시합니다.
update public.exam_attempts ea
set is_practice=true,formal_sequence=0,scope_code='FULL'
from public.students s,public.exams e
where ea.student_id=s.id and ea.exam_id=e.id
  and s.name in ('최현슬','윤동규','배유담')
  and e.exam_date in ('2026-08-05','2026-08-12','2026-08-19','2026-08-26');

-- 같은 세 학생의 8월 참가 일정도 공식 순번 계산에서 제외합니다.
update public.learning_cycle_students lcs
set is_practice=true,formal_sequence=0,sos_gate_status='OPEN'
from public.students s,public.learning_cycles lc
where lcs.student_id=s.id and lcs.cycle_id=lc.id
  and s.name in ('최현슬','윤동규','배유담')
  and lc.start_date in ('2026-08-05','2026-08-12','2026-08-19','2026-08-26');

-- 2026-09-09 SOS 제1회는 모든 실제 응시자에게 공식 1회차·전체범위입니다.
update public.exam_attempts ea
set is_practice=false,formal_sequence=1,scope_code='FULL'
from public.exams e
where ea.exam_id=e.id
  and e.exam_date='2026-09-09'
  and ea.status='submitted'
  and (e.title ilike '%제1회%' or e.round=1);

-- 오늘 시험의 기존 배정에도 같은 공식 정보를 복원합니다.
update public.exam_registrations er
set formal_sequence=1,scope_code='FULL'
from public.exams e
where er.exam_id=e.id
  and e.exam_date='2026-09-09'
  and (e.title ilike '%제1회%' or e.round=1);

-- 9월 9일 실제 응시자가 속한 참가 일정과 시험지 연결도 공식 1회차로 맞춥니다.
update public.learning_cycle_students lcs
set formal_sequence=1,scope_code='FULL',is_practice=false
from public.exam_attempts ea,public.exams e
where lcs.student_id=ea.student_id and ea.exam_id=e.id
  and lcs.cycle_id in (
    select lc.id from public.learning_cycles lc where lc.start_date='2026-09-09'
  )
  and ea.status='submitted' and e.exam_date='2026-09-09'
  and (e.title ilike '%제1회%' or e.round=1);

update public.learning_cycle_exams lce
set formal_sequence=1,scope_code='FULL'
from public.learning_cycles lc,public.exams e
where lce.cycle_id=lc.id and lce.exam_id=e.id
  and lc.start_date='2026-09-09' and e.exam_date='2026-09-09'
  and (e.title ilike '%제1회%' or e.round=1);

-- 9월 9일 이후 예약은 학생별 실제 공식 제출 횟수 다음부터 날짜순으로 계획합니다.
-- 이후 결석이 생기면 시험 시작 API가 실제 제출기록을 다시 읽고 같은 순번을 유지합니다.
with official_progress as (
  select student_id,coalesce(max(formal_sequence),0)::integer as completed_seq
  from public.exam_attempts
  where status='submitted' and coalesce(is_practice,false)=false and formal_sequence>0
  group by student_id
), future_ranked as (
  select lcs.id,
         coalesce(op.completed_seq,0) + row_number() over(
           partition by lcs.student_id order by lc.start_date,lcs.registered_at,lcs.id
         )::integer as planned_seq
  from public.learning_cycle_students lcs
  join public.learning_cycles lc on lc.id=lcs.cycle_id
  left join official_progress op on op.student_id=lcs.student_id
  where lcs.status='ACTIVE' and coalesce(lcs.is_practice,false)=false
    and lc.start_date>'2026-09-09'
)
update public.learning_cycle_students lcs
set formal_sequence=future_ranked.planned_seq,
    sos_gate_status=case when future_ranked.planned_seq<=1 then 'OPEN' else 'LOCKED' end
from future_ranked
where lcs.id=future_ranked.id;

notify pgrst, 'reload schema';
