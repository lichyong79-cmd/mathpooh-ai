-- SOS290 · 배치 생성 진행분 저장 컬럼
-- 10문항 생성을 5문항씩 나눠 처리하면서, 끝난 묶음을 여기에 누적합니다.
-- 중간에 함수가 종료돼도 다음 실행이 남은 묶음만 이어서 만듭니다.

alter table public.sos_ai_generation_jobs
  add column if not exists batch_payload jsonb not null default '{}'::jsonb;

comment on column public.sos_ai_generation_jobs.batch_payload is
  'SOS290 · 배치 단위로 완료된 생성 문항 누적본 {problems:[...]}';

notify pgrst, 'reload schema';
