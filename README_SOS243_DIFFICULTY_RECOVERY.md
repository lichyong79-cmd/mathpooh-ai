# SOS243 난이도 빠른 복구

## 확정 원인
1. 과거 버전에서 미분류 난이도를 `2`(3점)으로 표시하는 fallback이 재유입됨.
2. 문제은행 top-level `difficulty`와 `problem_dna.difficulty.final_grade` 동기화가 끊겨 DNA에는 난이도가 있는데 DB difficulty가 빈 문항이 대량 발생함.
3. AI 분석 검수/수동 저장 경로에도 `difficulty || "2"` 기본값이 남아 있었음.
4. 문제은행 관리자 직접 수정은 top-level difficulty만 바꿔 DNA 관리자 확정값과 분리될 수 있었음.

## SOS243 수정
- 미분류 → 3점 기본값 제거
- AI 검수 저장에서 난이도 미입력 시 빈 값 유지
- 관리자 문제은행 난이도 수정 시 DNA final_grade + scale_version + admin_fixed 동시 저장
- `difficulty_recovery_20260817.sql`: AI 호출 없이 기존 DNA final_grade가 있는 미분류 문항만 top-level difficulty로 복원
- v240 `difficulty_decision=unclassified` 문항은 복구 대상에서 제외
- 실제 3점으로 저장된 문항의 evidence/final 충돌은 이번 복구에서 자동 변경하지 않음 (2차 검증 대상)

## 적용 순서
1. 배포 전 `difficulty_recovery_20260817.sql` 실행
2. 결과 분포와 `still_unclassified` 확인
3. SOS243 배포
4. 문제은행 난이도 분포 새로고침
