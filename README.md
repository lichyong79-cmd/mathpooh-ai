# MathPooh AI

파일럿 5~7명을 위한 통합 MVP 화면입니다.

## 포함 기능
- 관리자 대시보드
- 학생 관리
- 주간 모의고사 관리
- 문제 PDF/이미지 업로드 화면
- AI 문항 분석 결과 미리보기
- 공략 문항 기반 진단 3문항 추천
- 훈련 10문항 흐름
- 학생 답안 입력 및 채점 결과 화면
- Supabase 초기 스키마

## 실행
```bash
npm install
npm run dev
```

## Supabase 연결
1. `.env.example`을 복사해 `.env.local` 생성
2. Supabase Project Settings > API의 URL과 anon key 입력
3. Supabase SQL Editor에서 `supabase/schema.sql` 실행

현재 UI는 연결 전에도 localStorage 데모 모드로 작동합니다.
