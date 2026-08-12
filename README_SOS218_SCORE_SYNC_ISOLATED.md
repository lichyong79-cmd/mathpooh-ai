# SOS218.1 - 학생 성적 F5 갱신 전용

- 학생 성적 자동 5초 polling 완전 제거
- 브라우저 focus/visibility 복귀 시 자동 점수 갱신 제거
- 탭 이동 시 자동 점수 갱신 제거
- 학생 페이지는 최초 진입/F5 새로고침 때 `/api/student/portal`에서 최신 `exam_attempts`를 다시 조회
- `/api/student/portal` 클라이언트 fetch는 `cache: no-store` 유지
- OMR/실전모의고사 응시 로직은 변경하지 않음
- SQL 변경 없음
