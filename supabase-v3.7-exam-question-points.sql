-- SOS264: 실전모의고사 문항별 배점
alter table public.exams add column if not exists question_points jsonb not null default '[]'::jsonb;
comment on column public.exams.question_points is '문항 번호 순서의 배점 배열. 예: [2,2,3,4,...]';
