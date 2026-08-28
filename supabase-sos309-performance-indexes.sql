-- SOS309: 학생/학부모 화면의 반복 조회를 빠르게 하는 보조 인덱스입니다.
-- Supabase SQL Editor에서 한 번 실행하면 됩니다. 기존 데이터는 변경하지 않습니다.

create index if not exists exam_registrations_student_status_idx
  on public.exam_registrations (student_id, status, exam_id);

create index if not exists exam_attempts_student_status_submitted_idx
  on public.exam_attempts (student_id, status, submitted_at desc);

create index if not exists exam_attempts_exam_status_score_idx
  on public.exam_attempts (exam_id, status, score);

create index if not exists sos_ai_generation_jobs_student_requested_idx
  on public.sos_ai_generation_jobs (student_id, requested_at desc);

create index if not exists students_parent_phone_idx
  on public.students (parent_phone);
