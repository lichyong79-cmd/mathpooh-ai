alter table public.source_files
  add column if not exists content_role text not null default 'TRAINING',
  add column if not exists training_course text not null default '대표유형';

alter table public.problem_bank_questions
  add column if not exists content_role text not null default 'TRAINING',
  add column if not exists training_course text not null default '대표유형';

alter table public.source_files drop constraint if exists source_files_content_role_check;
alter table public.source_files add constraint source_files_content_role_check
  check (content_role in ('TRAINING','REFERENCE'));

alter table public.problem_bank_questions drop constraint if exists problem_bank_questions_content_role_check;
alter table public.problem_bank_questions add constraint problem_bank_questions_content_role_check
  check (content_role in ('TRAINING','REFERENCE'));

create index if not exists problem_bank_training_match_idx
  on public.problem_bank_questions(content_role, status, subject, unit, difficulty);

comment on column public.source_files.content_role is 'TRAINING=SOS 훈련 매칭용, REFERENCE=보관/참고용';
comment on column public.source_files.training_course is '기초연산/대표유형/실전유형/준킬러/킬러';
