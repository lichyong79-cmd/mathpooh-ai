-- MATHPOOH SOS 난이도 원인 진단 SQL v2
-- 조회 전용: 데이터 변경 없음

-- 1. 전체 난이도 분포
select
  coalesce(difficulty::text, '(NULL)') as difficulty,
  count(*) as cnt
from public.problem_bank_questions
group by coalesce(difficulty::text, '(NULL)')
order by cnt desc;

-- 2. DB difficulty vs DNA final_grade 일치 여부
select
  case
    when problem_dna->'difficulty'->>'final_grade' is null then 'DNA final_grade 없음'
    when difficulty::text = problem_dna->'difficulty'->>'final_grade' then '일치'
    else '불일치'
  end as compare_status,
  count(*) as cnt
from public.problem_bank_questions
group by 1
order by cnt desc;

-- 3. 불일치 조합 상세
select
  coalesce(difficulty::text, '(NULL)') as db_difficulty,
  coalesce(problem_dna->'difficulty'->>'final_grade', '(NULL)') as dna_final_grade,
  count(*) as cnt
from public.problem_bank_questions
where difficulty::text is distinct from (problem_dna->'difficulty'->>'final_grade')
group by
  difficulty::text,
  problem_dna->'difficulty'->>'final_grade'
order by cnt desc;

-- 4. DB가 3점 계열(legacy '2')인 문항의 DNA final_grade 분포
select
  coalesce(problem_dna->'difficulty'->>'final_grade', '(NULL)') as dna_final_grade,
  count(*) as cnt
from public.problem_bank_questions
where difficulty::text = '2'
group by problem_dna->'difficulty'->>'final_grade'
order by cnt desc;

-- 5. AI 재판정 버전별 분포
select
  coalesce(problem_dna->'difficulty'->>'ai_regrade_version', '(없음)') as ai_regrade_version,
  coalesce(difficulty::text, '(NULL)') as db_difficulty,
  count(*) as cnt
from public.problem_bank_questions
group by
  problem_dna->'difficulty'->>'ai_regrade_version',
  difficulty::text
order by ai_regrade_version, cnt desc;

-- 6. scale_version별 분포
select
  coalesce(problem_dna->'difficulty'->>'scale_version', '(없음)') as scale_version,
  coalesce(difficulty::text, '(NULL)') as db_difficulty,
  count(*) as cnt
from public.problem_bank_questions
group by
  problem_dna->'difficulty'->>'scale_version',
  difficulty::text
order by scale_version, cnt desc;

-- 7. analysis_version별 분포
select
  coalesce(problem_dna->>'analysis_version', '(없음)') as analysis_version,
  coalesce(difficulty::text, '(NULL)') as db_difficulty,
  count(*) as cnt
from public.problem_bank_questions
group by
  problem_dna->>'analysis_version',
  difficulty::text
order by analysis_version, cnt desc;

-- 8. 관리자 확정(admin_fixed) 여부별 분포
select
  coalesce(problem_dna->'difficulty'->>'admin_fixed', '(없음)') as admin_fixed,
  coalesce(difficulty::text, '(NULL)') as db_difficulty,
  count(*) as cnt
from public.problem_bank_questions
group by
  problem_dna->'difficulty'->>'admin_fixed',
  difficulty::text
order by admin_fixed, cnt desc;

-- 9. DB=2(3점)인데 DNA 근거 판정은 다른 값인 문항 집계
select
  coalesce(problem_dna->'difficulty'->>'evidence_grade', '(없음)') as evidence_grade,
  coalesce(problem_dna->'difficulty'->>'band_grade', '(없음)') as band_grade,
  coalesce(problem_dna->'difficulty'->>'final_grade', '(없음)') as final_grade,
  count(*) as cnt
from public.problem_bank_questions
where difficulty::text = '2'
group by
  problem_dna->'difficulty'->>'evidence_grade',
  problem_dna->'difficulty'->>'band_grade',
  problem_dna->'difficulty'->>'final_grade'
order by cnt desc;

-- 10. 등록일별 난이도 분포: 어느 시점부터 3점 쏠림이 생겼는지 확인
select
  created_at::date as created_date,
  count(*) as total,
  count(*) filter (where difficulty::text = '1') as d1,
  count(*) filter (where difficulty::text = '2') as d2,
  count(*) filter (where difficulty::text = '3') as d3,
  count(*) filter (where difficulty::text = '4') as d4,
  count(*) filter (where difficulty::text = '5') as d5
from public.problem_bank_questions
group by created_at::date
order by created_date;

-- 11. 최근 등록분 상세 메타데이터 샘플
select
  id,
  created_at,
  question_no,
  difficulty::text as db_difficulty,
  problem_dna->'difficulty'->>'final_grade' as dna_final_grade,
  problem_dna->'difficulty'->>'band_grade' as band_grade,
  problem_dna->'difficulty'->>'evidence_grade' as evidence_grade,
  problem_dna->'difficulty'->>'scale_version' as scale_version,
  problem_dna->'difficulty'->>'ai_regrade_version' as ai_regrade_version,
  problem_dna->'difficulty'->>'admin_fixed' as admin_fixed,
  problem_dna->>'analysis_version' as analysis_version
from public.problem_bank_questions
order by created_at desc
limit 100;
