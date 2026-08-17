-- MATHPOOH SOS243 난이도 빠른 복구
-- 목적: AI 재판정 없이, DB difficulty가 비어 있지만 DNA final_grade가 이미 정상 1~8인 문항만 복원
-- v240에서 명시적으로 unclassified 된 문항은 건드리지 않음

begin;

-- 0) 이번 복구 대상 백업 (최초 1회만 생성)
create table if not exists public.difficulty_recovery_backup_20260817 as
select
  id,
  difficulty as old_difficulty,
  problem_dna as old_problem_dna,
  updated_at as old_updated_at,
  now() as backed_up_at
from public.problem_bank_questions
where false;

insert into public.difficulty_recovery_backup_20260817
  (id, old_difficulty, old_problem_dna, old_updated_at, backed_up_at)
select
  q.id, q.difficulty, q.problem_dna, q.updated_at, now()
from public.problem_bank_questions q
where coalesce(trim(q.difficulty::text),'') not in ('1','2','3','4','5','6','7','8')
  and coalesce(q.problem_dna->'difficulty'->>'final_grade','') ~ '^[1-8]$'
  and coalesce(q.problem_dna->'difficulty'->>'difficulty_decision','') <> 'unclassified'
  and not exists (
    select 1 from public.difficulty_recovery_backup_20260817 b where b.id=q.id
  );

-- 1) DNA에 이미 있는 확정 8단계 값을 top-level difficulty로 동기화
update public.problem_bank_questions q
set
  difficulty = q.problem_dna->'difficulty'->>'final_grade',
  updated_at = now()
where coalesce(trim(q.difficulty::text),'') not in ('1','2','3','4','5','6','7','8')
  and coalesce(q.problem_dna->'difficulty'->>'final_grade','') ~ '^[1-8]$'
  and coalesce(q.problem_dna->'difficulty'->>'difficulty_decision','') <> 'unclassified';

commit;

-- 2) 복구 결과 확인
select
  coalesce(difficulty::text,'NULL') as difficulty,
  count(*) as cnt
from public.problem_bank_questions
group by difficulty::text
order by difficulty::text nulls last;

-- 3) 아직 미분류로 남은 문항 수
select count(*) as still_unclassified
from public.problem_bank_questions
where coalesce(trim(difficulty::text),'') not in ('1','2','3','4','5','6','7','8');

-- 4) DB/DNA가 여전히 다른 문항 수 (관리자 수동값/검토상태 포함, 자동 수정하지 않음)
select count(*) as db_dna_mismatch
from public.problem_bank_questions
where coalesce(difficulty::text,'') is distinct from coalesce(problem_dna->'difficulty'->>'final_grade','');
