# SOS192 상태 구조 재정비

- SOS190 BUILD FIX FINAL을 기준으로 다시 작업해 SOS191의 깨진 삽입 코드를 버림
- 상태 계산은 `/api/source-files/analysis-statuses` 한 곳에서만 수행
- 실제 `problem_bank_questions` 행을 등록완료 기준으로 사용
- AI분석 정상 통과(APPROVED/AUTO_REGISTERED legacy)는 등록대기
- REVIEW는 검토보류, FAILED/REJECTED는 실패
- AI분석 드롭다운과 문제등록 진행상태가 동일 API 결과를 사용
- 등록완료→등록대기 되돌리기 후 loadSources/loadFiles 새로고침 시 두 화면 동일 반영
- AI분석만으로 문제은행 자동등록하지 않음; 실제 등록 API는 수동 등록 버튼에서만 호출
