# SOS189 등록완료 → 등록대기 되돌리기

- 3단계 AI 문항분석 화면에 `등록완료 N → 등록대기로` 버튼 추가
- 시험지명 직접 입력 확인 후 실행
- 해당 시험지의 `problem_bank_questions` 등록 복사본만 삭제
- `analysis_questions.status = APPROVED`로 변경
- `review_result.bank_status` 및 등록 시각/중복 플래그 해제
- 문제 이미지, Crop, 공식 해설 이미지, AI 결과, Problem DNA, 난이도, 정답은 그대로 보존
- 처리 후 화면은 등록대기 탭으로 자동 이동
