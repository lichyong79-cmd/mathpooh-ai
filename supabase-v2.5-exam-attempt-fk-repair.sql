-- SOS v2.5: 온라인 시험 응시기록이 현재 public.exams를 정확히 참조하도록 복구
-- 기존 응시기록은 삭제하지 않습니다.

alter table public.exam_attempts
  drop constraint if exists exam_attempts_exam_id_fkey;

alter table public.exam_attempts
  add constraint exam_attempts_exam_id_fkey
  foreign key (exam_id)
  references public.exams(id)
  on delete cascade
  not valid;

-- 기존 데이터까지 정상일 때 검증 완료됩니다.
-- 고아 데이터가 있으면 이 줄에서만 오류가 나며, 신규 응시기록 FK는 이미 정상 적용된 상태입니다.
alter table public.exam_attempts
  validate constraint exam_attempts_exam_id_fkey;

notify pgrst, 'reload schema';
