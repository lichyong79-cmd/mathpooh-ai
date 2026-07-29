# SOS

Next.js + Supabase 기반 수학 문항 관리 프로젝트입니다.

## 실제 사용 경로

- `/problem-bank/ai-upload` — 시험지 업로드, AI 분석, 문항 크롭 및 저장
- `/problem-bank` — 문제은행
- `/review` — 등록 문항 검수

## 문항 처리 API

- `/api/analysis/*` — 분석 작업 및 문항 분석
- `/api/problem-bank/materialize` — 선택 영역 이미지 생성
- `/api/problem-bank/register` — 문제은행 등록
- `/api/source-files/*` — 원본 파일 관리

## 구조 원칙

문항 크롭 작업 화면은 `src/app/problem-bank/ai-upload/page.tsx` 하나만 사용합니다.
별도의 `/problem-bank/crop` 작업 화면은 중복 구현이므로 제거했습니다.
