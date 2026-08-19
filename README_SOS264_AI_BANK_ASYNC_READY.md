# SOS264 — AI 생성 문제은행 + 비동기 READY 구조

## 학생 흐름
1. 1차훈련 종료 후 HOMEWORK(3제) 또는 SECOND_TRAINING(10제) 필요 판정.
2. 학생 요청에서 AI 생성을 기다리지 않고 `sos_ai_generation_jobs`에 즉시 QUEUED.
3. 화면 안내: "짧게는 10분, 길게는 30분 이상... READY로 변경되면 다시 접속".
4. Vercel Cron이 10분마다 1개 작업을 생성·검증.
5. 성공 시 READY + 기존 훈련 세션 생성. 학생 화면은 `READY · 3제 굳히기 시작` 또는 `READY · 2차 훈련 시작`.

## AI 생성 문제은행
- 검증 통과 문항은 `sos_ai_generated_questions`에 영구 저장.
- 기존 generated_problem도 SQL 실행 시 가능한 문항을 이관.
- 관리자 메뉴에서 `AI 생성 문제은행`을 `SOS 문제은행` 바로 위에 분리.
- 생성 유형/단원/난이도/정답/원문/생성일/사용 여부 관리.

## 색상
- AI 생성문항은 학생 화면에서 보라 계열 카드/배지.
- 일반 SOS 원본문항은 기존 색상 유지.

## 배포 전 필수
1. `supabase-sos264-ai-generated-bank.sql` 실행.
2. Vercel에 `CRON_SECRET` 환경변수를 설정하는 것을 권장.
3. `vercel.json`의 10분 Cron 사용 가능 여부를 현재 Vercel 플랜에서 확인.
