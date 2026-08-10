MATHPOOH SOS - 난이도 관리 탭 분리 / 기존 탭 보존

기준 원본: sos(20260810-012604).zip

1. SOS 문제은행
- src/app/problem-bank/ProblemBankClient.tsx 본체 기능은 변경하지 않음.
- 난이도 재판정/테스트 기능을 문제은행 본체에 추가하지 않음.

2. 문제은행 > AI 분석
- src/app/problem-bank/ai-upload/page.tsx 본체 기능은 변경하지 않음.
- 기존 문제인식 -> 자르기 -> 문항분석 파이프라인 유지.

3. SOS 운영 > 난이도 관리
- /problem-bank/difficulty 별도 페이지 사용.
- 공용 관리자 사이드바에 '난이도 관리' 메뉴 추가.
- 문항 검색/과목/난이도 필터, 직접 난이도 수정, 20문항 테스트, 전체 재판정 기능은 이 탭에만 배치.

4. 검사
- admin-portal-sidebar.tsx: TypeScript/TSX 파싱 OK
- difficulty/page.tsx: TypeScript/TSX 파싱 OK
- ProblemBankClient.tsx: TypeScript/TSX 파싱 OK
- ai-upload/page.tsx: TypeScript/TSX 파싱 OK
- npm ci는 작업환경 내부 npm 미러에 zod-validation-error@4.0.2 패키지가 없어 전체 Next build를 실행하지 못함.
