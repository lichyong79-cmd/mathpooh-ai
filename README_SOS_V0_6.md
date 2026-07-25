# SOS v0.6 적용 순서

1. Supabase SQL Editor에서 `supabase-v0.6-exams-storage.sql` 전체 실행
2. 프로젝트 파일을 덮어쓰기
3. `.env.local`에 아래 값 확인
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` 또는 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. `npm install`
5. `npm run dev`로 확인 후 배포

## 변경사항
- 시험정보 localStorage 저장 제거
- 모든 컴퓨터에서 Supabase `exams` 테이블의 동일 데이터 사용
- 시험지/해설지 PDF를 `exam-files` Storage 버킷에 영구 저장
- 문항영역 편집기에서 이미 등록된 시험지 PDF 자동 불러오기
- 시험 목록의 대상/과목, 시험일, 문항/시간 줄바꿈 및 잘림 보정

## 중요
기존 버전에서 브라우저 localStorage에만 저장했던 시험은 Supabase에 존재하지 않습니다.
필요한 시험은 이 버전에서 한 번 수정 저장하면서 PDF를 등록하면 이후 모든 컴퓨터에서 동일하게 보입니다.
