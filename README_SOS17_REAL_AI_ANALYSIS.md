# SOS17 실제 AI 분석 연결

## 핵심 수정
기존 SOS16은 AI 분석 버튼이 작업 레코드만 생성하고 실제 분석 엔진은 실행하지 않았습니다.
SOS17에서는 시험지 PDF와 해설지 PDF를 OpenAI Responses API에 전달해 문항별 정답·구분·단원·유형·난이도·신뢰도를 추출하고 `analysis_questions`에 저장합니다.

## Vercel 환경변수
- `OPENAI_API_KEY`: 필수
- `OPENAI_MODEL`: 선택, 기본값 `gpt-5-mini`

환경변수를 추가한 뒤 반드시 재배포합니다.

## 동작
1. AI 문제등록 목록의 `AI 분석` 버튼으로 워크스페이스 이동
2. `AI 분석 시작` 클릭
3. 시험지/해설지 PDF를 실제 AI 분석
4. 진행 상태 저장
5. 문항별 결과 표 표시
