-- MATHPOOH SOS 난이도 원인 진단 v3
-- 조회 전용 / UPDATE, DELETE 없음
-- 모든 핵심 결과를 하나의 Results 표에 출력합니다.

with base as (
  select
    id,
    created_at,
    difficulty::text as db_grade,
    problem_dna,
    problem_dna->'difficulty'->>'final_grade' as final_grade,
    problem_dna->'difficulty'->>'band_grade' as band_grade,
    problem_dna->'difficulty'->>'evidence_grade' as evidence_grade,
    problem_dna->'difficulty'->>'scale_version' as scale_version,
    problem_dna->'difficulty'->>'ai_regrade_version' as ai_regrade_version,
    problem_dna->'difficulty'->>'difficulty_judge_version' as difficulty_judge_version,
    problem_dna->'difficulty'->>'admin_fixed' as admin_fixed,
    problem_dna->'difficulty'->>'difficulty_decision' as difficulty_decision,
    problem_dna->'difficulty'->>'difficulty_review_required' as review_required,
    problem_dna->>'analysis_version' as analysis_version
  from public.problem_bank_questions
),
report as (

  -- A. 현재 DB 분포
  select
    'A_DB분포'::text as section,
    coalesce(db_grade,'NULL') as key1,
    ''::text as key2,
    count(*)::bigint as cnt,
    ''::text as note
  from base
  group by db_grade

  union all

  -- B. DB vs DNA final_grade 일치 여부
  select
    'B_DB_vs_DNA' as section,
    case
      when final_grade is null then 'DNA final_grade 없음'
      when db_grade = final_grade then '일치'
      else '불일치'
    end as key1,
    '' as key2,
    count(*)::bigint,
    ''
  from base
  group by 1,2

  union all

  -- C. 불일치 조합
  select
    'C_불일치조합',
    coalesce(db_grade,'NULL'),
    coalesce(final_grade,'NULL'),
    count(*)::bigint,
    'key1=DB / key2=DNA final_grade'
  from base
  where db_grade is distinct from final_grade
  group by db_grade, final_grade

  union all

  -- D. 현재 3점(내부값 2)의 근거 판정 조합
  select
    'D_3점_근거',
    concat('evidence=',coalesce(evidence_grade,'NULL')),
    concat('band=',coalesce(band_grade,'NULL'), ' / final=',coalesce(final_grade,'NULL')),
    count(*)::bigint,
    case
      when evidence_grade is not null
       and evidence_grade <> '2'
      then '★ 3점인데 evidence가 3점이 아님'
      else ''
    end
  from base
  where db_grade = '2'
  group by evidence_grade, band_grade, final_grade

  union all

  -- E. AI 재판정 버전별 현재 분포
  select
    'E_AI버전',
    coalesce(ai_regrade_version,'없음'),
    coalesce(db_grade,'NULL'),
    count(*)::bigint,
    ''
  from base
  group by ai_regrade_version, db_grade

  union all

  -- F. scale_version별 현재 분포
  select
    'F_SCALE버전',
    coalesce(scale_version,'없음'),
    coalesce(db_grade,'NULL'),
    count(*)::bigint,
    ''
  from base
  group by scale_version, db_grade

  union all

  -- G. admin_fixed 기준문항 보존 현황
  select
    'G_ADMIN_FIXED',
    coalesce(admin_fixed,'없음'),
    coalesce(db_grade,'NULL'),
    count(*)::bigint,
    case when admin_fixed='true' then '관리자 확정 기준문항' else '' end
  from base
  group by admin_fixed, db_grade

  union all

  -- H. 미판정/검토필요가 실제로 존재하는지
  select
    'H_판정상태',
    coalesce(difficulty_decision,'없음'),
    coalesce(review_required,'없음'),
    count(*)::bigint,
    ''
  from base
  group by difficulty_decision, review_required

  union all

  -- I. 분석 버전별 3점 비율 확인
  select
    'I_ANALYSIS버전',
    coalesce(analysis_version,'없음'),
    concat(
      '3점=', count(*) filter(where db_grade='2'),
      ' / 전체=', count(*)
    ),
    count(*)::bigint,
    concat(
      round(
        100.0 * count(*) filter(where db_grade='2')
        / nullif(count(*),0), 1
      ),
      '%가 3점'
    )
  from base
  group by analysis_version

  union all

  -- J. 날짜별 등록량/3점 비율 - 10문항 이상 등록된 날만
  select
    'J_등록일',
    created_at::date::text,
    concat(
      '3점=', count(*) filter(where db_grade='2'),
      ' / 전체=', count(*)
    ),
    count(*)::bigint,
    concat(
      round(
        100.0 * count(*) filter(where db_grade='2')
        / nullif(count(*),0), 1
      ),
      '%가 3점'
    )
  from base
  group by created_at::date
  having count(*) >= 10
)
select section, key1, key2, cnt, note
from report
order by
  case section
    when 'A_DB분포' then 1
    when 'B_DB_vs_DNA' then 2
    when 'C_불일치조합' then 3
    when 'D_3점_근거' then 4
    when 'E_AI버전' then 5
    when 'F_SCALE버전' then 6
    when 'G_ADMIN_FIXED' then 7
    when 'H_판정상태' then 8
    when 'I_ANALYSIS버전' then 9
    when 'J_등록일' then 10
    else 99
  end,
  cnt desc,
  key1,
  key2;
