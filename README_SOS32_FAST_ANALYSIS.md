# SOS32 빠른 분석

- 크롭 엔진은 SOS31 상태 그대로 유지
- 시험지 크롭 AI와 내용 분석 AI는 동시에 실행
- 내용 분석은 기본적으로 gpt-5-mini 사용
- 분석 출력 길이 축소: summary는 짧게, 풀이 장문 생성 금지
- 대형 출력 토큰 상한 축소

환경변수(선택):
- OPENAI_CROP_MODEL: 크롭 모델
- OPENAI_ANALYSIS_MODEL: 빠른 내용 분석 모델
- 기존 OPENAI_MODEL은 크롭 모델의 예비값으로 유지
