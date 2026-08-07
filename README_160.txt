SOS 160 · 문제등록 상태 + 문제은행 전체 전광판

적용 방법
1. 이 압축을 풉니다.
2. 안의 src 폴더를 현재 mathpooh-ai 프로젝트 루트에 그대로 덮어씁니다.
3. 추가 SQL은 없습니다.
4. git status 로 아래 3개 변경을 확인합니다.
   - src/app/admin/page.tsx
   - src/app/problem-bank/page.tsx
   - src/app/globals.css
5. git add .
   git commit -m "160 problem bank dashboard"
   git push

반영 1 · 문제등록 페이지
- 신규
- 분석중 (진행률 표시)
- 분석완료·등록대기
- 문제은행 등록중/등록완료 (문항 수 표시)
- 분석오류
- 목록 상단에 각 상태별 건수 전광판 추가
- source_analysis + problem_bank_questions를 읽어 실제 상태를 계산

반영 2 · 문제은행 전체 전광판
- 전체 문제 자산
- SOS 추천 가능(ACTIVE + 훈련용)
- 훈련용 / 참고·보관용
- Problem DNA 생성 완료율
- 최근 7일 신규 등록
- 과목별 보유 문항
- 난이도 1~5단계 분포
- 단원 보유 TOP 5
- 사용 / 보류 / 보관 / DNA 미생성 현황

주의
- 별도 DB 컬럼 추가 없음.
- 기존 데이터에서 실시간 집계합니다.
