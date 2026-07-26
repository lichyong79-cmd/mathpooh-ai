# SOS18 · 실제 GPT 연결 확인 및 분석 안정화

## 바뀐 점

- `AI 연결 확인` 버튼 추가
- API 키, 결제 한도, 모델 접근 가능 여부를 작은 실제 호출로 먼저 확인
- OpenAI Responses API의 PDF `input_file` 사용
- Structured Outputs(JSON Schema)로 문항 결과 형식 고정
- 시험지 PDF와 해설지 PDF를 동시에 전달
- 문항별 정답, 객관식/단답형, 단원, 유형, 난이도, 요약, 신뢰도 저장
- 401/404/429 오류를 한국어로 표시
- 실제 사용 토큰을 작업 로그에 기록
- `OPENAI_MODEL`이 없으면 자동으로 `gpt-5-mini` 사용

## 배포 전 확인

Vercel Environment Variables에 다음 값이 필요합니다.

```text
OPENAI_API_KEY=실제 API 키
```

`OPENAI_MODEL`은 선택 사항입니다. 지워도 기본값 `gpt-5-mini`가 적용됩니다.

환경변수를 추가하거나 수정한 뒤에는 반드시 새 배포를 실행해야 합니다.

## 사용 순서

1. AI 분석 관리에서 시험지 선택
2. `AI 연결 확인` 클릭
3. `OpenAI 연결 정상` 표시 확인
4. `AI 분석 시작` 클릭
5. 완료 후 문항별 분석 결과 검수
