# SOS57.1 Crop Hotfix

문제: Problem DNA V2용 신규 DB 컬럼을 Supabase 마이그레이션 전에 사용하면
`analysis_questions` 또는 `source_analysis` 저장 단계에서 빠른 자르기가 실패할 수 있었습니다.

수정:
- 빠른 자르기 저장 경로에서 신규 전용 컬럼 의존 제거
- DNA 버전/검증 결과는 기존 `ai_result` JSON 안에 계속 보존
- 개별 재분석도 신규 컬럼이 없어도 동작하도록 변경

따라서 SQL을 아직 실행하지 않았더라도 자르기와 분석 대기 생성은 정상 동작합니다.
향후 DNA 검색/문제은행 고급 필드를 사용하려면 기존 `supabase-v2.2-problem-dna-v2.sql`을 실행하세요.
