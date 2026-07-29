-- SOS35 · 시험지 세트 완전 삭제 보강
-- 기존 설치에서 FK가 CASCADE가 아니거나 누락된 경우를 정리합니다.
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table if exists public.source_analysis
  drop constraint if exists source_analysis_source_file_id_fkey;
alter table if exists public.source_analysis
  add constraint source_analysis_source_file_id_fkey
  foreign key (source_file_id) references public.source_files(id) on delete cascade;

alter table if exists public.analysis_jobs
  drop constraint if exists analysis_jobs_analysis_id_fkey;
alter table if exists public.analysis_jobs
  add constraint analysis_jobs_analysis_id_fkey
  foreign key (analysis_id) references public.source_analysis(id) on delete cascade;

alter table if exists public.analysis_questions
  drop constraint if exists analysis_questions_analysis_id_fkey;
alter table if exists public.analysis_questions
  add constraint analysis_questions_analysis_id_fkey
  foreign key (analysis_id) references public.source_analysis(id) on delete cascade;

alter table if exists public.problem_bank_questions
  drop constraint if exists problem_bank_questions_source_file_id_fkey;
alter table if exists public.problem_bank_questions
  add constraint problem_bank_questions_source_file_id_fkey
  foreign key (source_file_id) references public.source_files(id) on delete cascade;

alter table if exists public.problem_bank_questions
  drop constraint if exists problem_bank_questions_analysis_question_id_fkey;
alter table if exists public.problem_bank_questions
  add constraint problem_bank_questions_analysis_question_id_fkey
  foreign key (analysis_question_id) references public.analysis_questions(id) on delete cascade;
