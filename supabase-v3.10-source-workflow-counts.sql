-- SOS · AI 문제은행 분석 작업장 목록 성능 개선
-- 문제은행/분석문항 전체를 애플리케이션으로 가져오지 않고 시험지별 상태를 DB에서 집계한다.

create or replace view public.source_workflow_counts_v1 as
select
  sf.id as source_file_id,
  count(aq.id)::int as total,
  count(aq.id) filter (
    where exists (
      select 1
      from public.problem_bank_questions pb
      where pb.source_file_id=sf.id
        and (pb.analysis_question_id=aq.id or pb.question_no=aq.question_no)
    )
  )::int as registered,
  count(aq.id) filter (
    where not exists (
      select 1
      from public.problem_bank_questions pb
      where pb.source_file_id=sf.id
        and (pb.analysis_question_id=aq.id or pb.question_no=aq.question_no)
    )
    and upper(coalesce(aq.status,'')) in ('APPROVED','AUTO_REGISTERED')
  )::int as pending,
  count(aq.id) filter (
    where not exists (
      select 1
      from public.problem_bank_questions pb
      where pb.source_file_id=sf.id
        and (pb.analysis_question_id=aq.id or pb.question_no=aq.question_no)
    )
    and upper(coalesce(aq.status,''))='REVIEW'
  )::int as review,
  count(aq.id) filter (
    where not exists (
      select 1
      from public.problem_bank_questions pb
      where pb.source_file_id=sf.id
        and (pb.analysis_question_id=aq.id or pb.question_no=aq.question_no)
    )
    and upper(coalesce(aq.status,'')) in ('FAILED','REJECTED')
  )::int as failed,
  count(aq.id) filter (
    where not exists (
      select 1
      from public.problem_bank_questions pb
      where pb.source_file_id=sf.id
        and (pb.analysis_question_id=aq.id or pb.question_no=aq.question_no)
    )
    and upper(coalesce(aq.status,'')) not in ('APPROVED','AUTO_REGISTERED','REVIEW','FAILED','REJECTED')
  )::int as other
from public.source_files sf
left join public.source_analysis sa on sa.source_file_id=sf.id
left join public.analysis_questions aq on aq.analysis_id=sa.id
group by sf.id;
