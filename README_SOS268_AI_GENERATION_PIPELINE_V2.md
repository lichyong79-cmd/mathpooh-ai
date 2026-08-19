# SOS268 · AI 변형문항 제작 파이프라인 V2

AI 유사문항을 한 번의 프롬프트에서 문제+조판+검증까지 동시에 만들던 구조를 단계형 제작 공정으로 분리했습니다.

1. SOURCE_ANALYSIS · 원문/DNA 정리
2. TRANSFORM_DESIGN · 안전/표준 변형 설계
3. TEXT_GENERATION · 문제/정답/풀이 텍스트 생성
4. TEXT_CREATED · 텍스트 중간본 DB 저장
5. RENDERING · MathJax/MathML 문제집 조판
6. RENDER_VERIFIED · 조판 구조 검사 및 중간본 DB 저장
7. FINAL_RESOLVE · 최종 문항 독립 재풀이
8. FINAL_VERIFIED → AI 문제은행 저장 → READY

중간 결과는 sos_ai_generation_jobs의 draft_payload / rendered_payload / verification_payload에 저장됩니다. 따라서 어느 단계에서 실패했는지 관리자가 확인할 수 있습니다.

## 배포 순서
1. `supabase-v3.8-ai-generation-pipeline-v2.sql` 실행
2. 프로젝트 배포

기존 READY 문항과 기존 AI 문제은행 데이터는 삭제하거나 변경하지 않습니다.
