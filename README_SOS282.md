# SOS282 · 관리자 수동 생성 안전판 + 공통 로그아웃

**파일 5개.** SQL 없음. 빌드 확인 완료.

```
src\components\admin-portal-sidebar.tsx
src\components\admin-portal-sidebar.module.css
src\app\api\admin\ai-generated-bank\route.ts
src\app\admin\ai-generated-bank\page.tsx
src\app\admin\ai-generated-bank\style.css
```

---

## 1) AI 문항 수동 생성 — 안전판

`0ccdffe` 커밋에서 관리자 수동 생성 코드 61줄이 삭제된 뒤,
AI 문항 생성 경로가 **외부 스케줄러(cron-job.org) 하나뿐**이었습니다.

무료 서비스가 멎거나 계정에 문제가 생기면 학생 학습이 멈추고,
되살릴 수단이 없습니다. 학원 운영을 무료 외부 서비스 하나에 걸어둔 셈입니다.

### 추가된 것

**「지금 1건 생성」 버튼** (AI 생성 문제은행 화면 우측 상단)
대기·실패 작업 중 하나를 그 자리에서 끝까지 처리합니다.
cron과 같은 선점 규칙을 쓰므로 동시에 돌아도 중복되지 않습니다.

**「다시 대기열에」 버튼** (실패한 작업 카드 안)
FAILED 작업을 QUEUED로 되돌립니다. `attempt_count`도 0으로 초기화되어
3회 제한에 걸려 멈춘 작업도 되살아납니다.

> 최대 5분까지 걸립니다. 누른 뒤 화면을 닫지 마세요.
> 평소에는 쓸 일이 없고, cron이 멎었을 때를 위한 장치입니다.

**권한도 함께 정리** — 이 API의 인증이 아직 거부목록(`student`·`parent`만 차단)이라
SOS280의 허용목록으로 통일했습니다.

## 2) 관리자 공통 로그아웃

로그아웃 버튼이 `/admin` 사이드바 하단에만 있어서,
문제은행·난이도·PDF 매퍼 화면에서는 `/auth/signout` 주소를 직접 쳐야 했습니다.

**권한 문제로 잠겼을 때 나갈 길이 필요합니다.**

이제 관리자 셸(`AdminPortalShell`)을 쓰는 **모든 화면**의 사이드바 하단에
로그인 계정명과 함께 로그아웃 버튼이 있습니다.
사이드바를 접으면 ⏻ 아이콘만 남습니다.

---

## 적용

```
cd C:\프로그램_개발\mathpooh-ai
copy src\components\admin-portal-sidebar.tsx admin-sidebar.bak
copy src\app\api\admin\ai-generated-bank\route.ts ai-bank-route.bak
copy src\app\admin\ai-generated-bank\page.tsx ai-bank-page.bak
```

`SOS282` 안의 `src` 폴더를 프로젝트 루트에 덮어쓴 뒤:

```
findstr "SOS282" src\components\admin-portal-sidebar.tsx
git add .
git commit -m "SOS282 관리자 수동 생성 안전판 및 공통 로그아웃"
git push
```

---

## 배포 후 확인

**로그아웃** — 난이도 관리 화면에 들어가서 사이드바 맨 아래를 보세요.
계정명과 로그아웃 버튼이 있어야 합니다.

**수동 생성** — AI 생성 문제은행 화면 우측 상단의 「지금 1건 생성」.
대기 작업이 없으면 "대기 중인 작업이 없습니다"가 뜹니다. 그게 정상입니다.

---

## 지금까지 마무리된 것

| 번호 | 내용 |
|---|---|
| SOS270 | AI 문항 렌더링 정규화, cron 실행 경로 복구 |
| SOS271 | cron 즉시 202 응답, 멈춘 작업 자동 회수 |
| SOS274~275 | 난이도 실태 노출, 공식이 AI 판정 덮어쓰던 문제 차단 |
| SOS276~277 | 문항 이미지 잘림(styled-jsx 스코프) 수정 |
| SOS278~279 | 난이도 재판정 백그라운드 큐, 신규문항 자동 검증 |
| SOS280 | 관리자 API 차단, 권한 허용목록, 비밀번호 강제 변경 |
| SOS281 | 정답 사전 노출 차단, 풀이시간 서버 계산 |
| SOS282 | 수동 생성 안전판, 공통 로그아웃 |

### 남아 있는 것 (급하지 않음)

- **정답 입력창에 `inputMode`가 없음** — 모바일에서 문자 키보드가 뜹니다. 한 줄이면 고칩니다
- **완료 후 문항별 해설을 다시 볼 수 없음** — 오답 교정 중 3회 실패해야만 풀이가 공개되고, 성적표에서는 못 봅니다
- **훈련에 "모르겠어요" 처리가 없음** — 막힌 학생은 찍는 수밖에 없습니다
- **AI 파이프라인 시간 예산** — `maxDuration=300`인데 2회 시도 시 최대 460초
