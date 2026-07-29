# SOS56 · 문제은행 등록 상태 제약조건 수정

- `analysis_questions.status = REGISTERED` 저장을 제거했습니다.
- AI 분석/검토 상태는 기존 `AUTO_REGISTERED` 또는 `APPROVED`를 유지합니다.
- 실제 문제은행 등록 여부는 `review_result.bank_status = REGISTERED`와 `bank_registered_at`으로 기록합니다.
- 등록완료/등록대기 탭과 카드 상태도 `review_result.bank_status` 기준으로 표시합니다.
- DB의 `analysis_questions_status_check` 제약조건을 건드리지 않으므로 별도 SQL 실행이 필요 없습니다.
