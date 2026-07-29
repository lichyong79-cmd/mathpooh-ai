# SOS50 AI 문항분석 파이프라인 수정

- 문항마다 해설지 PDF 전체를 반복 전송하던 경로 제거
- GPT-5-mini 분석 호출에 low reasoning 적용
- Structured Output 우선, JSON object 1회 재시도 유지
- 빈 응답일 때 status / incomplete reason / response id 표시
- 자동분석을 순차 1개에서 동시 3개 처리로 변경
- 한 문항 실패가 전체 20문항 분석을 중단하지 않음
- 실패 문항은 REVIEW 상태와 실패 이유로 보류
- 서버가 HTML/빈 본문을 반환해도 실제 HTTP 오류를 화면에 표시

배포 후 기존 이미지가 저장된 시험지에서 `자르기 저장 + 문항분석 자동 실행`을 다시 누르면 됩니다.
