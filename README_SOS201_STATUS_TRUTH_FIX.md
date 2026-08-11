SOS201 등록상태 단일화
- 전체 상태 API 1000행 제한 제거(페이지네이션)
- 시험지별 최신 분석만 사용
- 문제은행 등록완료는 실제 problem_bank_questions 행 기준
- analysis_question_id가 있으면 id 매칭, 없으면 question_no 매칭
- 과거 anonymous 행을 등록수에 별도 더하던 이중집계 제거
- AI분석 / 단일상태 API / 전체상태 API가 같은 기준 사용
