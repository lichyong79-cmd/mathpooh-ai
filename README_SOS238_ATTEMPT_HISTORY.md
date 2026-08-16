# SOS238 - 관리자 문항별 정오 시도 이력

SOS237 기준 추가 사항입니다.

## 적용 내용
- 관리자 > SOS 진행관리 > 단계 결과의 각 문항 카드에 시도별 정오 흐름 표시
  - 최초 O
  - 최초 X → 재1 O
  - 최초 X → 재1 X → 재2 X → 재3 O
  - 3회 실패 후 풀이확인 시 `풀이확인 ✓` 표시
- 현재 교정답과 현재 정오 상태를 별도 표시하여 관리자 답 수정 후에도 현재 상태 확인 가능
- 과거 데이터는 기존 `REVIEW_ITEM_RETRY_WRONG` / `REVIEW_ITEM_CORRECTED` 로그를 이용해 정오 이력 복원
- 앞으로 발생하는 오답 재도전 로그에는 입력 답(`answer`)도 함께 기록
- 진단 / 1차훈련 / 2차훈련 / AI 유사문항 3제 굳히기 공통 적용

## DB
- 신규 SQL / 컬럼 없음
- 기존 sos_training_activity_logs.detail JSON 사용

## 검증
- 변경 파일에 대해 TypeScript 구문 검사를 수행함
- 작업 환경에 프로젝트 node_modules가 없어 Next.js 전체 build는 실행 불가
