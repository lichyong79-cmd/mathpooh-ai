# MathPooh AI v0.3

## 이번 버전
- 문제 라이브러리 실제 Supabase 연결
- 시험지 PDF/이미지 업로드
- 정답표·해설지 선택 업로드
- Supabase Storage `problem-files` 버킷 저장
- 등록 자료 목록 표시
- 학습 흐름 3 → 3 → 10 → 10 유지

## 적용 순서
1. 기존 프로젝트에 덮어쓰기
2. Supabase SQL Editor에서 `supabase/v0.3-migration.sql` 전체 실행
3. 기존 `.env.local`은 유지
4. `npm install`
5. `npm run dev`

## 확인
- 문제 라이브러리 메뉴에서 자료 이름 입력
- 시험지 파일 선택
- `문제 자료 저장` 클릭
- 오른쪽 등록 자료 목록에 나타나면 정상

## 다음 버전
저장된 시험지를 문항별로 분리하고 AI 분석 작업을 연결합니다.
