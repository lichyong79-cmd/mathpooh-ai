# SOS330 - 학부모 가입 / 자녀 셀프서비스 계정

## 변경
- 학부모 로그인 화면에 `학부모 신규가입` 추가
- `/parent-signup`: 학부모 이름/휴대폰/비밀번호로 직접 계정 생성
- 학부모 페이지에 `자녀 등록` 추가
  - 기존 자녀 연결: 학생 이름 + 학생 휴대폰번호가 정확히 일치해야 연결
  - 다른 학부모가 이미 연결된 학생은 임의 이전 금지
  - 새 자녀 계정 만들기: 이름/전화/학교/학년/비밀번호로 학생+Auth 계정 동시 생성
- 기존 학생 데이터/학습기록은 삭제·재생성하지 않고 `parent_phone`만 연결
- SOS 신청은 이제 `학부모 가입 → 로그인 → 자녀 등록 → 학부모 페이지에서 신청` 순서로 고정
- 기존 공개 `/apply` 입력폼은 학부모 로그인으로 안내
- `/api/program-applications` POST는 학부모 로그인 필수

## DB
- 신규 SQL 없음. 기존 students.parent_phone / auth_user_id 구조 사용.

## 안전장치
- 기존 자녀 연결은 이름+전화번호 이중 확인
- 이미 다른 학부모 전화번호가 연결된 학생은 관리자 확인 없이는 이전 불가
- 신규 학생 Auth 생성 실패 시 학생 DB row 롤백
- Auth-학생 연결 실패 시 Auth와 학생 DB row 모두 롤백 시도

## Crop freeze
- src/lib/crop/question-anchors.ts 수정 없음
- SHA256 d1647af638899a4c1895c28c7a2e89d03c92d30965a334d8ffb56cdf13718029

## Build
- `npm run build` 시도했으나 전달 ZIP에 node_modules/next 실행파일이 없어 `next: not found`로 빌드 실행 불가.
