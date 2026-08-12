# SOS216 OMR 깜빡임 긴급 수정

- 학생 실전모의고사 응시 중 3초마다 `/api/student/portal`을 확인하는 관리자 제어 동기화는 유지합니다.
- 기존에는 동기화 때마다 `setActiveExam(current)`으로 시험 객체 전체를 교체하여 시험지 iframe이 다시 렌더링될 수 있었습니다.
- 응시 중에는 `activeExam` 객체를 교체하지 않고 `pause / remaining / submitted` 상태만 최소 갱신하도록 수정했습니다.
- 학생 홈 성적 동기화 5초 폴링은 기존대로 `activeExam`이 있을 때 중지됩니다.
- DB/SQL 변경 없음.
