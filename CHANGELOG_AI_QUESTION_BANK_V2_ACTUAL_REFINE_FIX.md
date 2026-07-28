# AI 문제은행 v2 실제 좌표 보정 경로 수정

- 실제 좌표를 최종 덮어쓰는 `src/app/problem-bank/ai-upload/page.tsx`의 `refineQuestionCrops()` 수정
- 일반 문항 상단 여백 1.6%
- 페이지·단의 첫 문항 상단 여백 3.2%
- 단의 마지막 문항 하단 94% 제한으로 꼬리말과 장식선 제외
- 다음 문항 시작점 안전 경계 유지
