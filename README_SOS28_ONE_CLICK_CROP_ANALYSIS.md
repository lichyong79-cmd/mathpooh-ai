# SOS28 · 문항 자르기 + 문항별 AI 분석 한 번에 실행

## 변경 핵심
- `AI 분석 시작` 버튼 한 번으로 아래 순서를 연속 실행합니다.
  1. AI가 시험지 전체에서 문항별 영역 탐지
  2. 브라우저에서 각 문항을 고해상도 WebP로 실제 생성
  3. 생성된 문항 이미지를 Storage에 저장
  4. 각 문항 이미지를 기준으로 AI Problem DNA 분석
  5. 해설지 PDF를 함께 참고해 정답 확인
- 전체 PDF 내용 분석과 자르기를 동시에 섞던 구조를 제거했습니다.
- 한 문항 분석 실패가 전체 자르기 결과를 지우지 않도록 분리했습니다.
- 3개 문항씩 병렬 분석하여 전체 처리 시간을 줄였습니다.

## 변경 파일
- `src/app/api/analysis/start/route.ts`
- `src/app/problem-bank/ai-upload/page.tsx`
- `src/app/api/analysis/questions/[id]/analyze/route.ts`

## 검증
- 세 변경 파일 TypeScript/TSX 구문 검사 통과
- 컨테이너 npm 저장소 503 오류로 `next build`는 실행하지 못함
