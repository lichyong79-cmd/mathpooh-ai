# SOS20 - OpenAI PDF 입력 수정

## 적용

기존 프로젝트에 전체 파일을 덮어쓴 뒤 배포합니다.

```bash
git add .
git commit -m "fix: correct OpenAI PDF input payload"
git push
```

Vercel 배포가 끝나면 다음 순서로 확인합니다.

1. AI 분석 관리
2. AI 연결 확인
3. 1차 판독 테스트 (문항 수 + 1번)
4. 1차 판독 성공 후 전체 AI 분석 시작

추가 SQL 실행은 필요하지 않습니다.
