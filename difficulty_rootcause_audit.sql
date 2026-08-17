-- MATHPOOH SOS 난이도 원인 진단 전용 (READ ONLY)
-- 데이터 수정 없음. SELECT만 실행합니다.

-- A. 전체 난이도 원본 분포
select difficulty, count(*) as cnt
from public.problem_bank_questions
where status = 'ACTIVE'
group by difficulty
order by difficulty;

-- B. 현재 3점(내부값 2) 문항이 어떤 난이도 엔진/상태에서 만들어졌는지
select
  coalesce(problem_dna->'difficulty'->>'scale_version','(none)') as scale_version,
  coalesce(problem_dna->'difficulty'->>'ai_regrade_version','(none)') as ai_regrade_version,
  coalesce(problem_dna->'difficulty'->>'difficulty_decision','(none)') as decision,
  coalesce(problem_dna->'difficulty'->>'csat_difficulty_band','(none)') as band,
  coalesce(problem_dna->'difficulty'->>'evidence_grade','(none)') as evidence_grade,
  coalesce(problem_dna->'difficulty'->>'band_grade','(none)') as band_grade,
  coalesce((problem_dna->'difficulty'->>'admin_fixed'),'false') as admin_fixed,
  count(*) as cnt
from public.problem_bank_questions
where status = 'ACTIVE' and difficulty = '2'
group by 1,2,3,4,5,6,7
order by cnt desc;

-- C. 3점이 언제부터 몰렸는지: 일자별 신규 등록량과 3점 비율
select
  (created_at at time zone 'Asia/Seoul')::date as kst_date,
  count(*) as total_created,
  count(*) filter (where difficulty='2') as three_point,
  round(100.0 * count(*) filter (where difficulty='2') / nullif(count(*),0), 1) as three_point_pct
from public.problem_bank_questions
where status='ACTIVE'
group by 1
order by 1;

-- D. 분석 버전별 분포: 어느 analysis_version에서 3점이 집중되는지
select
  coalesce(analysis_version,'(none)') as analysis_version,
  count(*) as total,
  count(*) filter (where difficulty='2') as three_point,
  round(100.0 * count(*) filter (where difficulty='2') / nullif(count(*),0), 1) as three_point_pct
from public.problem_bank_questions
where status='ACTIVE'
group by 1
order by total desc;

-- E. 핵심 검사: DB는 3점인데 DNA 근거는 다른 난이도를 말하는 문항 수
select
  coalesce(problem_dna->'difficulty'->>'evidence_grade','(none)') as evidence_grade,
  coalesce(problem_dna->'difficulty'->>'band_grade','(none)') as band_grade,
  coalesce(problem_dna->'difficulty'->>'csat_difficulty_band','(none)') as band,
  count(*) as cnt
from public.problem_bank_questions
where status='ACTIVE' and difficulty='2'
group by 1,2,3
order by cnt desc;

-- F. DB difficulty와 DNA final_grade 불일치 여부
select
  difficulty as db_difficulty,
  coalesce(problem_dna->'difficulty'->>'final_grade','(none)') as dna_final_grade,
  count(*) as cnt
from public.problem_bank_questions
where status='ACTIVE'
group by 1,2
having difficulty is distinct from (problem_dna->'difficulty'->>'final_grade')
order by cnt desc;

-- G. 관리자 확정 기준문항이 실제로 몇 단계에 몇 개 남아있는지
select
  difficulty,
  coalesce(problem_dna->'difficulty'->>'scale_version','(none)') as scale_version,
  count(*) as cnt
from public.problem_bank_questions
where status='ACTIVE'
  and problem_dna->'difficulty'->>'admin_fixed' = 'true'
group by 1,2
order by 1,2;

-- H. 3점 문항 중 관리자 확정이 아닌데, 근거등급이 4 이상이었던 문항 샘플
select
  id, created_at, source_name, question_no, subject, unit, topic,
  difficulty as db_difficulty,
  problem_dna->'difficulty'->>'final_grade' as dna_final_grade,
  problem_dna->'difficulty'->>'evidence_grade' as evidence_grade,
  problem_dna->'difficulty'->>'band_grade' as band_grade,
  problem_dna->'difficulty'->>'csat_difficulty_band' as band,
  problem_dna->'difficulty'->>'ai_regrade_version' as ai_regrade_version
from public.problem_bank_questions
where status='ACTIVE'
  and difficulty='2'
  and coalesce(problem_dna->'difficulty'->>'admin_fixed','false') <> 'true'
  and nullif(problem_dna->'difficulty'->>'evidence_grade','') ~ '^[0-9]+$'
  and (problem_dna->'difficulty'->>'evidence_grade')::int >= 4
order by created_at desc
limit 50;
