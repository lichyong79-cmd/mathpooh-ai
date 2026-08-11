# SOS197 - Claude 진단 반영 구조 수정

1. 과목
- `src/lib/subject.ts`를 실제 저장/조회/집계 경로에서 사용.
- 시험지(`source_files.subject`)가 문제은행 등록 시 최우선 기준.
- 문제은행 화면/필터/과목별 보유현황은 `normalizeSubject()` 기준으로 집계.
- 시험지 수정 PATCH는 service role 필수 + 연결 문제은행/AI 결과 자동 전파.
- 유지보수용 전체 동기화 라우트도 shared normalize + 병렬 업데이트 + maxDuration 적용.

2. 8단계 난이도
- `calculateDifficultyLevel()`의 band-only 조기 return 제거.
- 밴드 + 개념/조건해석/발상/계산/함정/시간/사고단계/개념수 근거점수를 함께 사용.
- `src/lib/difficulty-judge.ts` 추가.
- 신규 AI 분석 직후 원장 `admin_fixed` 문제를 동일 과목 기준표로 불러와 보정.
- `band_conflict`, `evidence_grade`, `band_grade`, `admin_reference_calibrated` 기록.

3. 문제은행 상태
- `src/lib/source-workflow.ts`가 단일 상태 판정 함수.
- AI 분석 5개 집계와 상태 API들이 같은 함수 사용.
- `/api/analysis/source/[id]`가 실제 `problem_bank_questions` 등록행을 확인해 `bank_registered`를 붙임.
- 따라서 AI 분석 화면의 `전체/등록완료/등록대기/검토보류/제외·실패` 자체가 실제 문제은행 등록 상태를 반영.
- 전체 상태 API와 단일 상태 API도 동일하게 실제 문제은행 행 + 동일 workflow 함수로 집계.
