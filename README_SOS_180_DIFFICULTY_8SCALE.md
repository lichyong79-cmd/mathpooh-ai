# SOS 180 · 수능형 난이도 8단계 통합

공식 축: 2점 → 3점 → 어3 → 쉬4 → 적4 → 어4 → 준킬러 → 킬러

- 기존 1~5 표시/판정 폐지
- Problem DNA final_grade 1~8
- AI 분석과 난이도 재판정이 같은 8단계를 사용
- 문제은행/난이도 관리/AI 분석/성적 분석 표시를 8단계 명칭으로 통일
- 난이도 관리 화면 스크롤 복구
- 전체 재판정은 v180-8scale 기준으로 저장

DB에서 exam_question_analysis를 사용 중이면 배포 전 `supabase-v3.0-sos-difficulty-8scale.sql`을 1회 실행하세요.
