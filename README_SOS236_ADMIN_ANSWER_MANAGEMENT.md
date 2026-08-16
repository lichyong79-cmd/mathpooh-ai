# SOS236 · 관리자 통합 정답 관리

SOS235 기반. 학생용 UI/흐름은 유지하고 관리자 SOS 진행관리 상세에 정답 관리 기능을 추가했습니다.

## 적용 범위
- 진단 문항
- 1차 훈련
- 2차 훈련
- AI 유사문항 3제 굳히기(HOMEWORK)
- 문제은행 기반 문항과 AI generated_problem 모두 지원

## 동작
- 관리자 > SOS 진행관리 > 단계 상세 > 각 문항 `정답 관리`
- 문제은행 문항: `problem_bank_questions.answer` 원본 정답 수정
- AI 생성문항: 해당 `sos_training_items.generated_problem.answer` 수정
- 이미 학생 답안/오답 재풀이 답안이 있으면 해당 단계 문항을 즉시 재채점
- 세션 `correct_count`도 현재 문항 결과 기준으로 갱신
- `ADMIN_ANSWER_CORRECTED` 활동 로그 기록
- 완료된 과거 바로미터/난이도 이벤트는 안전상 자동 역산하지 않음
- 3제 굳히기는 기존 SOS235 정책대로 바로미터 미반영 유지

새 Supabase SQL/컬럼은 필요 없습니다.
