-- SOS 공식 난이도 8단계 전환
-- 1=2점, 2=3점, 3=어3, 4=쉬4, 5=적4, 6=어4, 7=준킬러, 8=킬러
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid WHERE t.relname='exam_question_analysis' AND c.contype='c' AND pg_get_constraintdef(c.oid) ILIKE '%difficulty%' LOOP
    EXECUTE format('ALTER TABLE public.exam_question_analysis DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE IF EXISTS public.exam_question_analysis ADD CONSTRAINT exam_question_analysis_difficulty_8scale CHECK (difficulty between 1 and 8);

-- problem_bank_questions의 기존 1~5 값은 즉시 삭제하지 않고 대략적 8단계로 환산합니다.
-- 1→2점, 2→3점, 3→적4, 4→어4, 5→준킬러. 이후 '전체 재판정'으로 AI가 정확히 다시 판정합니다.
UPDATE public.problem_bank_questions
SET difficulty = CASE difficulty WHEN '1' THEN '1' WHEN '2' THEN '2' WHEN '3' THEN '5' WHEN '4' THEN '6' WHEN '5' THEN '7' ELSE difficulty END,
    problem_dna = CASE WHEN problem_dna IS NULL THEN problem_dna ELSE jsonb_set(jsonb_set(problem_dna,'{difficulty,scale_version}','"sos8-v1"'::jsonb,true),'{difficulty,final_grade}',to_jsonb((CASE difficulty WHEN '1' THEN 1 WHEN '2' THEN 2 WHEN '3' THEN 5 WHEN '4' THEN 6 WHEN '5' THEN 7 ELSE NULL END)),true) END
WHERE difficulty IN ('1','2','3','4','5');
