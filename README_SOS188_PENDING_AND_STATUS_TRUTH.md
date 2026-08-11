# SOS188 등록대기/상태 정합성 수정

- AI 분석 정상 통과 문항은 `APPROVED = 등록대기`
- AI 분석만으로는 `problem_bank_questions`에 등록하지 않음
- 문제은행 실제 등록은 등록 버튼을 눌렀을 때만 수행
- `review_result.bank_status === REGISTERED`인 경우에만 등록완료로 집계
- legacy `AUTO_REGISTERED`는 자동등록 의미가 아니라 등록대기 호환 상태로만 취급
- source별 실제 문항 상태 확인 API 추가: `/api/source-files/[id]/analysis-status`
- 시험지 목록 상태를 미분석/분석중/등록대기/검토보류/등록완료 기준으로 맞출 기반 추가
