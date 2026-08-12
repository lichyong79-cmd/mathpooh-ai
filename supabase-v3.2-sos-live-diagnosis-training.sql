-- SOS 3.2 · 학생 진단/훈련 실응시
-- SOS205의 supabase-v3.1-subunit-difficulty-link.sql 실행 후 적용.

alter table public.sos_training_sessions
  add column if not exists started_at timestamptz,
  add column if not exists submitted_at timestamptz;

-- 기존 DRAFT 중 실제 학생에게 보여줄 세션은 관리자가 새로 생성하는 것을 권장합니다.
-- SOS207부터 새 진단/훈련은 생성 즉시 ASSIGNED 상태입니다.

create index if not exists sos_training_sessions_student_status_idx
  on public.sos_training_sessions(student_id,status,created_at desc);

comment on column public.sos_training_sessions.started_at is '학생이 진단/훈련을 시작한 시각';
comment on column public.sos_training_sessions.submitted_at is '학생이 진단/훈련을 제출한 시각';
