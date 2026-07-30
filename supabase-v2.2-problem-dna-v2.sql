-- SOS57 · Problem DNA V2 foundation
alter table public.source_analysis add column if not exists analysis_version text not null default 'legacy-v1';
alter table public.analysis_questions add column if not exists analysis_version text not null default 'legacy-v1', add column if not exists dna_valid boolean not null default false, add column if not exists dna_validation_errors jsonb not null default '[]'::jsonb, add column if not exists teacher_overrides jsonb not null default '{}'::jsonb, add column if not exists locked_fields text[] not null default '{}'::text[];
alter table public.problem_bank_questions add column if not exists problem_dna jsonb, add column if not exists analysis_version text not null default 'legacy-v1', add column if not exists teacher_overrides jsonb not null default '{}'::jsonb, add column if not exists locked_fields text[] not null default '{}'::text[], add column if not exists dna_tags text[] not null default '{}'::text[];
create index if not exists analysis_questions_analysis_version_idx on public.analysis_questions(analysis_version);
create index if not exists analysis_questions_dna_valid_idx on public.analysis_questions(dna_valid);
create index if not exists problem_bank_questions_analysis_version_idx on public.problem_bank_questions(analysis_version);
create index if not exists problem_bank_questions_dna_gin_idx on public.problem_bank_questions using gin(problem_dna);
create index if not exists problem_bank_questions_dna_tags_gin_idx on public.problem_bank_questions using gin(dna_tags);
comment on column public.analysis_questions.ai_result is 'AI 원본 결과. Problem DNA V2는 ai_result.problem_dna에 저장한다.';
comment on column public.analysis_questions.teacher_overrides is '교사가 수정한 필드만 저장. AI 재분석 시 덮어쓰지 않는다.';
comment on column public.analysis_questions.locked_fields is '교사가 잠근 Problem DNA JSON path 목록.';
comment on column public.problem_bank_questions.problem_dna is '시험·진단·훈련·학생리포트가 공통으로 참조하는 Problem DNA.';
