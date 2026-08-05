-- SOS 2.7 · 결과 재분석 / 해설 공개 / 매쓰푸 코멘트

alter table public.exams
  add column if not exists solution_open boolean not null default false;

alter table public.exam_attempts
  add column if not exists score_source text not null default 'auto'
    check (score_source in ('auto','manual')),
  add column if not exists solution_override boolean,
  add column if not exists mathpooh_comment text not null default '';

comment on column public.exams.solution_open is '제출 완료 학생 전체 해설 공개';
comment on column public.exam_attempts.solution_override is 'null=시험 전체 설정, true=개별 공개, false=개별 비공개';
comment on column public.exam_attempts.mathpooh_comment is '학생 성적표에 표시할 매쓰푸의 코멘트';
