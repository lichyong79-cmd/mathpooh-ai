MATHPOOH SOS - 난이도 관리 분리 + 기존 문제은행 복구

교체 파일
1. src/app/problem-bank/ProblemBankClient.tsx
   - 난이도 재판정 기능을 넣기 전 문제은행 화면으로 복구

2. src/app/admin/page.tsx
   - SOS 운영 메뉴에 '난이도 관리' 추가
   - 클릭 시 /problem-bank/difficulty 이동

3. src/app/problem-bank/difficulty/page.tsx
   - 난이도 전용 관리 페이지 신규
   - 1~5 분포 / 검색 / 과목·난이도 필터
   - 문항별 난이도 직접 변경
   - 20문항 AI 재판정 테스트
   - 전체 AI 재판정

주의
- 기존 /api/problem-bank/regrade-difficulty-batch API는 유지되어 있어야 합니다.
- 문제은행 원래 분석/문항 관리 기능에는 난이도 재판정 UI를 섞지 않습니다.
