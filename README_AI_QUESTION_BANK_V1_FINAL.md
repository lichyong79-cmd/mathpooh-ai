# AI 문제은행 v1.0 Final

기준 파일 적용:
- route(1).ts → src/app/api/analysis/start/route.ts
- route(2).ts → src/app/api/problem-bank/materialize/route.ts
- page(42).tsx → src/app/review/page.tsx

주요 동작:
- AI 시험지 분석 및 문항별 좌표 생성
- 문항 이미지 자동 자르기 및 저장
- AI 분석/검수 작업장 단일 화면
- 틀린 문항 중심 재검수 및 문제은행 등록 흐름

배포 전 환경변수와 Supabase 마이그레이션 상태를 확인하세요.

Applied files SHA256:
fdd184256a9e501289e5ba5559c067d918071b461bbcebbac9453cf891591823  src/app/api/analysis/start/route.ts
6ba116ac1442eb67831dd012e3e82e7d5f10c3c3af0ebb7f0b9947e432ad0957  src/app/api/problem-bank/materialize/route.ts
0f712b69a37c26131c5aabe0b7e8d718870ae21a8c07d4324e840c40e68147c0  src/app/review/page.tsx
