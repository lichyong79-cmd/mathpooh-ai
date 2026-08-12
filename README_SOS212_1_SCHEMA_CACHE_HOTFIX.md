# SOS212.1 · started_at schema cache hotfix

- 학생 진단 시작 시 `sos_training_sessions.started_at` 컬럼이 없어도 동작하도록 변경했습니다.
- 진단 타이밍의 기준은 세션 시작시각이 아니라 문항별 `revealed_at` / `answer_locked_at`이므로 기능상 손실이 없습니다.
- 관리자 진행현황에서도 `started_at` / `submitted_at` 직접 조회를 제거하고 상태+`updated_at`으로 표시합니다.
- 따라서 이번 핫픽스는 추가 SQL 없이 배포 가능합니다.
