# SOS215 · 관리자 진행/결과 조회 복구

- 실제 students 스키마에 없는 `class_name` 컬럼을 관리자 SOS 진행 API 조회에서 제거했습니다.
- 진행/결과 화면에서도 `class_name` 의존을 제거했습니다.
- Supabase 오류 객체가 일반 Error 인스턴스가 아니어도 실제 `message/details/hint`가 화면에 나오도록 오류 전달을 개선했습니다.
- 배정/학생 진단/AI 후보 로직은 변경하지 않았습니다.
- 새 SQL 없음.
