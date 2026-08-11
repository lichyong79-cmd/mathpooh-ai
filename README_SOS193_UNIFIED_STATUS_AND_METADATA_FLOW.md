# SOS193 상태/메타데이터 단일 흐름 정리

## 문제은행 상태
시험지 상태는 AI분석 화면의 5개 집계와 완전히 같은 규칙만 사용한다.
- 전체
- 등록완료
- 등록대기
- 검토보류
- 제외·실패

공통 함수: `src/lib/problem-bank-workflow.ts`
AI분석 화면 / 단일 상태 API / 전체 상태 API가 모두 같은 `workflowBucketOf()` / `summarizeWorkflow()`를 사용한다.

중요 수정:
- Supabase 기본 1000행 제한 때문에 전체 `analysis_questions`가 잘리던 문제 수정
- 전체 상태 API가 모든 페이지를 끝까지 읽음
- 1000문항 이후 시험지가 신규/미분석으로 오판되던 구조 제거
- 동일 시험지에 분석 이력이 여러 개면 최신 분석만 사용

## 시험지명 / 출처 / 과목
`source_files` 수정 저장이 유일한 입력 경로다.
수정 저장 시 자동으로:
1. source_files
2. problem_bank_questions.subject/source_name/title
3. problem_bank_questions.problem_dna.basic
4. analysis_questions.ai_result / review_result 메타데이터
를 함께 갱신한다.

수동 `시험지 과목 → 문제은행 전체 동기화` 버튼은 제거했다.
