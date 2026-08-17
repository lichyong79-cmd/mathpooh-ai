# SOS254.1 — 학생 SOS 자동복구 API 핫픽스

원인
- SOS254의 ensure_next가 존재하지 않는 `sos_training_sessions.operation_cycle_id` 컬럼을 조회.
- 실제 회차 정보는 `target_snapshot`에서 `cycleFromSnapshot()`으로 계산하는 구조임.
- 다음 단계 자동복구가 실행될 때 API 오류 발생.

수정
- `operation_cycle_id` DB 조회/참조 완전 제거.
- 학생의 세션을 조회한 뒤 `cycleFromSnapshot(target_snapshot)`으로 같은 회차만 메모리 필터링.
- ensure_next에서 사용하는 `correct_count`, `decision`을 최초 session select에 추가.
- SOS254의 '기존 1차훈련 9/10 → 3제 굳히기 복구' 로직은 그대로 유지.

SQL 없음.
