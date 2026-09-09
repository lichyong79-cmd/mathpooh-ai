-- SOS358 V2: 학생 1명당 시험 1개의 응시행만 유지합니다.
-- 임시 테이블을 사용하지 않으므로 Supabase SQL Editor에서 그대로 실행할 수 있습니다.

begin;

-- 중복 응시행의 로그를 답안이 가장 많이 저장된 정상 응시행으로 옮깁니다.
with scored as (
  select
    a.id,
    a.exam_id,
    a.student_id,
    (
      select count(*)
      from jsonb_each_text(coalesce(a.answers, '{}'::jsonb)) answer
      where btrim(answer.value) <> ''
    ) as answer_count,
    case a.status when 'submitted' then 2 when 'in_progress' then 1 else 0 end as status_rank,
    coalesce(a.graded_at, a.submitted_at, a.last_saved_at, a.started_at, a.created_at) as activity_at
  from public.exam_attempts a
), ranked as (
  select
    id,
    first_value(id) over (
      partition by exam_id, student_id
      order by answer_count desc, status_rank desc, activity_at desc nulls last, id desc
    ) as keep_id,
    row_number() over (
      partition by exam_id, student_id
      order by answer_count desc, status_rank desc, activity_at desc nulls last, id desc
    ) as duplicate_no
  from scored
)
update public.exam_activity_logs log
set attempt_id = ranked.keep_id
from ranked
where log.attempt_id = ranked.id
  and ranked.duplicate_no > 1;

-- 구버전 추천 데이터가 있으면 연결을 보존합니다.
do $$
begin
  if to_regclass('public.recommendations') is not null then
    execute $sql$
      with scored as (
        select
          a.id,
          a.exam_id,
          a.student_id,
          (
            select count(*)
            from jsonb_each_text(coalesce(a.answers, '{}'::jsonb)) answer
            where btrim(answer.value) <> ''
          ) as answer_count,
          case a.status when 'submitted' then 2 when 'in_progress' then 1 else 0 end as status_rank,
          coalesce(a.graded_at, a.submitted_at, a.last_saved_at, a.started_at, a.created_at) as activity_at
        from public.exam_attempts a
      ), ranked as (
        select
          id,
          first_value(id) over (
            partition by exam_id, student_id
            order by answer_count desc, status_rank desc, activity_at desc nulls last, id desc
          ) as keep_id,
          row_number() over (
            partition by exam_id, student_id
            order by answer_count desc, status_rank desc, activity_at desc nulls last, id desc
          ) as duplicate_no
        from scored
      )
      update public.recommendations recommendation
      set attempt_id = ranked.keep_id
      from ranked
      where recommendation.attempt_id = ranked.id
        and ranked.duplicate_no > 1
    $sql$;
  end if;
end $$;

-- 답안이 적은 중복 응시행을 제거합니다.
with scored as (
  select
    a.id,
    a.exam_id,
    a.student_id,
    (
      select count(*)
      from jsonb_each_text(coalesce(a.answers, '{}'::jsonb)) answer
      where btrim(answer.value) <> ''
    ) as answer_count,
    case a.status when 'submitted' then 2 when 'in_progress' then 1 else 0 end as status_rank,
    coalesce(a.graded_at, a.submitted_at, a.last_saved_at, a.started_at, a.created_at) as activity_at
  from public.exam_attempts a
), ranked as (
  select
    id,
    row_number() over (
      partition by exam_id, student_id
      order by answer_count desc, status_rank desc, activity_at desc nulls last, id desc
    ) as duplicate_no
  from scored
)
delete from public.exam_attempts attempt
using ranked
where attempt.id = ranked.id
  and ranked.duplicate_no > 1;

create unique index if not exists exam_attempts_exam_student_unique_idx
  on public.exam_attempts (exam_id, student_id);

commit;

notify pgrst, 'reload schema';
