-- SOS24 · 문항별 자동등록 + 검수대기

alter table public.analysis_questions
  drop constraint if exists analysis_questions_status_check;

alter table public.analysis_questions
  add constraint analysis_questions_status_check
  check (status in ('WAITING','RUNNING','REVIEW','APPROVED','AUTO_REGISTERED','REJECTED','FAILED'));

alter table public.analysis_questions
  add column if not exists review_reason text,
  add column if not exists auto_registered_at timestamptz;

create index if not exists analysis_questions_review_queue_idx
  on public.analysis_questions(status, confidence, created_at);
