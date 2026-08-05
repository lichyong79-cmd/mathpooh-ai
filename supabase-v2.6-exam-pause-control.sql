-- SOS145: 실전모의고사 일시정지/재개 상태 저장
alter table public.exams
  add column if not exists paused_at timestamptz,
  add column if not exists paused_remaining_seconds integer;

comment on column public.exams.paused_at is '관리자가 시험을 일시정지한 시각';
comment on column public.exams.paused_remaining_seconds is '일시정지 시 남아 있던 전체 시험 시간(초)';
