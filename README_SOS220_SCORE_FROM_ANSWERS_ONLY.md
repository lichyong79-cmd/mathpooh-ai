# SOS220 — 시험 점수 단일화

- 유일한 기준: 학생 문항별 답안/정오답
- 공통 계산 함수: `src/lib/exam-score.ts`
- 관리자 결과 화면 진입 시 제출 답안으로 점수/정답수/오답/미응답 재계산 후 `exam_attempts` 갱신
- 관리자 결과 수정 시 수동 점수 입력 제거, 답안 수정 저장 즉시 점수 자동 재계산
- 학생 portal F5/최초 진입 시 같은 공통 계산 함수로 최종점수 반환 및 stale DB 값 보정
- 학생 페이지의 별도 score API 병합 제거. portal 한 경로만 사용
- 성적분석(buildStudentPerformance)도 저장된 옛 score가 아니라 현재 정오답으로 계산
- 자동 polling 없음. OMR/SOS 응시 로직 변경 없음
