-- SOS274 · 난이도 실태 점검 (읽기 전용, 데이터 변경 없음)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

select
  count(*)                                                                            as 전체,
  count(*) filter (where problem_dna->'difficulty'->>'ai_regrade_version' is not null) as ai판정이력있음,
  count(*) filter (where problem_dna->'difficulty'->>'ai_regrade_version' is null)     as ai판정없음,
  count(*) filter (where problem_dna->'difficulty'->>'scale_version' = 'sos8-v1')      as 신규체계표시,
  count(*) filter (where problem_dna->'difficulty'->>'difficulty_decision' = 'unclassified') as 미판정,
  count(*) filter (where problem_dna->'difficulty'->>'admin_fixed' = 'true')           as 관리자확정,
  count(*) filter (where coalesce(trim(difficulty::text),'') not in ('1','2','3','4','5','6','7','8')) as 난이도없음
from public.problem_bank_questions
where status = 'ACTIVE';

-- 난이도별로 'AI 판정 이력이 있는지'를 나눠서 봅니다.
-- ai판정없음 쪽이 크면, 그 등급은 옛 1~5단계 기계 환산값이 그대로 남아 있는 것입니다.
select
  coalesce(nullif(trim(difficulty::text),''),'(없음)') as 난이도,
  count(*)                                                                            as 문항수,
  count(*) filter (where problem_dna->'difficulty'->>'ai_regrade_version' is not null) as ai판정있음,
  count(*) filter (where problem_dna->'difficulty'->>'ai_regrade_version' is null)     as ai판정없음
from public.problem_bank_questions
where status = 'ACTIVE'
group by 1
order by 1;
