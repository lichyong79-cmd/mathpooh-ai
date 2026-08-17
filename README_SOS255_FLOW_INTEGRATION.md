# SOS255 학생 학습 흐름 통합 안정화

기준: 배포 성공한 SOS254.2

핵심 변경
1. 학생 페이지의 legacyDiagnosis/recover_diagnosis 자동복구 제거
   - 다음 단계 복구는 ensure_next 한 경로로 통일
2. 같은 회차/같은 단계 중복 세션 canonical 처리
   - 진행중/오답/배정 세션 우선, 동일 상태는 최신 세션 우선
   - 학생 목록/현재 단계/학습지도에서 중복 노출 억제
3. 1차훈련 오답 완료 시 AI 다음문항 생성을 submit_review 안에서 기다리지 않음
   - 먼저 PASSED 또는 SECOND_TRAINING_REQUIRED 확정 저장
   - 화면 재조회 후 ensure_next가 3제 굳히기/2차훈련을 생성
   - AI 지연 때문에 오답 완료 자체가 60초 timeout 되는 구조 제거
4. AI 유사문항 오답 화면도 이미지-only
   - 이미지 실패 시 generatedText를 학생에게 직접 노출하지 않음
5. 기존 SOS254 회차복구/9할 통과/3제 굳히기/2차훈련 로직 유지

SQL 없음.
