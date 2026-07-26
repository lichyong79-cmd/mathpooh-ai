# SOS 11 빌드 수정

이전 버전에서 남은 `src/lib/supabase/client.ts`, `server.ts`가 원인입니다.
ZIP 덮어쓰기는 기존 파일을 삭제하지 않으므로 `적용하기.bat`을 반드시 한 번 실행하세요.

적용 순서:
1. ZIP을 프로젝트 루트에 덮어쓰기
2. `적용하기.bat` 실행
3. 터미널에서 실행

npm install
npm run build
git add .
git commit -m "fix: remove obsolete Supabase SSR files"
git push origin main
