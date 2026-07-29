# SOS52 - 정상 문항 문제은행 즉시 등록

- AI 분석 통과 상태(AUTO_REGISTERED)를 실제 problem_bank_questions에 일괄 upsert
- 임베딩은 통과 문항 전체를 한 번에 생성하여 속도 저하 최소화
- 등록 후 analysis_questions.status를 REGISTERED로 변경
- source_file_id + question_no upsert로 재실행 시 중복 방지
- UI에 등록대기/등록완료를 구분해 표시
- 검토대상 문항은 문제은행으로 보내지 않음
