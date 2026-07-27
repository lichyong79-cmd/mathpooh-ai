# SOS23 · AI 문제은행 엔진 1차 완성

## 적용 전 SQL
Supabase SQL Editor에서 `supabase-v1.4-problem-bank-engine.sql`을 한 번 실행합니다.

## 추가 기능
- 문항별 `검수 확정 / 검수 필요` 저장
- 이전·다음 문항 이동
- 검수 완료 개수 표시
- 모든 문항 검수 완료 전 문제은행 등록 차단
- 문제은행 등록 시 같은 문항은 중복 생성하지 않고 최신 검수값으로 갱신
- 등록과 동시에 OpenAI Embedding 자동 생성
- `OPENAI_EMBEDDING_MODEL` 미설정 시 `text-embedding-3-small` 사용

## 등록 데이터
과목, 단원, 유형, 난이도, 정답, 요약, 출처, 원본 PDF 경로, 해설 PDF 경로, 신뢰도, Embedding을 저장합니다.
