SOS 162 - /problem-bank useSearchParams Suspense 빌드 오류 수정

적용 방법:
1. 압축을 풉니다.
2. 안의 src 폴더를 mathpooh-ai 프로젝트 루트에 그대로 덮어씁니다.
3. git status 확인 후 아래 실행:
   git add .
   git commit -m "162 fix problem bank suspense"
   git push

수정 내용:
- 기존 problem-bank/page.tsx 전체 화면 코드를 ProblemBankClient.tsx로 이동
- page.tsx는 Suspense wrapper로 변경
- 기존 검색/필터/대시보드/문항교체 기능은 유지
- 추가 SQL 없음
