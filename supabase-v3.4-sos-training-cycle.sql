-- SOS 3.4 · 취약점 → 1차훈련 → 오답 → 2차 유사문항 훈련 사이클
-- supabase-v3.3-sos-diagnosis-evidence.sql 이후 실행

alter table public.sos_training_sessions
  add column if not exists weakness_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists baseline_meter numeric(4,2),
  add column if not exists goal_meter numeric(4,2),
  add column if not exists training_meter numeric(4,2),
  add column if not exists review_meter numeric(4,2),
  add column if not exists cycle_kind text not null default 'STANDARD';

alter table public.sos_training_items
  alter column problem_id drop not null;

alter table public.sos_training_items
  add column if not exists generated_problem jsonb,
  add column if not exists review_answer text,
  add column if not exists review_is_correct boolean,
  add column if not exists review_response_seconds integer,
  add column if not exists review_answered_at timestamptz;

alter table public.sos_difficulty_events
  alter column problem_id drop not null;

comment on column public.sos_training_sessions.weakness_snapshot is '진단 AI가 확정한 취약점 및 근거';
comment on column public.sos_training_sessions.baseline_meter is '해당 SOS 공략 시작 시 고정 바로미터';
comment on column public.sos_training_sessions.goal_meter is '구간별 차등 상승폭을 적용한 이번 SOS 완료 목표';
comment on column public.sos_training_sessions.training_meter is '본훈련 10문항 반영 직후 바로미터';
comment on column public.sos_training_sessions.review_meter is '오답까지 반영한 최종 바로미터';
comment on column public.sos_training_items.generated_problem is '2차 AI 유사/변형문항 JSON';
