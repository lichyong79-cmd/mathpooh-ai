# SOS281 · 부정행위 차단 (정답 사전 노출 · 풀이시간 조작)

**파일 2개.** SQL 없음(필요한 컬럼이 이미 있습니다). 빌드 확인 완료.

```
src\app\api\student\sos-training\route.ts
src\components\sos-training-runner.tsx
```

---

## 1) 3제 굳히기에서 정답이 미리 나가던 문제

```ts
// 이전
generatedSolution: (["PASSED","COMPLETED"].includes(status) || cycle_kind === "HOMEWORK")
  ? generated?.solution ?? "" : undefined
```

`cycle_kind === "HOMEWORK"`면 **세션 상태와 무관하게** 전체 풀이가 JSON에 실려 나갔습니다.
3제 굳히기는 시간제한이 없어서, 학생이 개발자도구(F12 → 네트워크)만 열면
풀기 전에 정답과 풀이를 통째로 볼 수 있었습니다.

이제 **끝난 세션(PASSED / COMPLETED)에서만** 내려보냅니다.

```ts
generatedSolution: ["PASSED","COMPLETED"].includes(status) ? generated?.solution ?? "" : undefined
```

학습 후 복습에는 영향이 없습니다. 다 푼 뒤에는 그대로 보입니다.

## 2) 훈련 풀이시간을 클라이언트가 정하던 문제

진단은 서버가 `revealed_at`과 `answer_locked_at`으로 계산해 안전했습니다.
그런데 훈련에는 10초 공개 절차가 없어서 **서버가 문항을 언제 열었는지 몰랐고**,
저장 시 클라이언트가 보낸 값을 그대로 받았습니다.

```ts
// 이전
const responseSeconds = Math.max(1, Math.round(Number(body.responseSeconds ?? 0) || 1));
```

`responseSeconds: 1`을 보내면 그대로 저장됩니다.
**바로미터가 풀이시간을 반영하므로 조작 가능한 지표였습니다.**

### 고친 방법

**새 동작 `open_training_item`** — 학생이 문항을 열면 서버가 `revealed_at`을 기록합니다.
이미 열었던 문항은 시각을 갱신하지 않습니다(되돌아가기로 시간을 늘리지 못하게).

**저장 시 서버가 계산** — `now − revealed_at`을 씁니다.
자리를 비웠다 돌아온 경우까지 잡히지 않도록 **2시간에서 끊습니다.**

클라이언트가 보낸 값은 저장하지 않고 활동 로그에만 `clientSeconds`로 남깁니다.
나중에 두 값을 비교하면 이상 패턴을 확인할 수 있습니다.

**기존 데이터 호환** — `revealed_at`이 없는 예전 문항은 종전대로 클라이언트 값을 씁니다.
이미 진행 중인 세션이 깨지지 않습니다.

---

## 적용

```
cd C:\프로그램_개발\mathpooh-ai
copy src\app\api\student\sos-training\route.ts sos-training-route.bak
copy src\components\sos-training-runner.tsx sos-training-runner.bak
```

`SOS281` 안의 `src` 폴더를 프로젝트 루트에 덮어쓴 뒤:

```
findstr "SOS281" src\app\api\student\sos-training\route.ts
git add .
git commit -m "SOS281 정답 사전 노출 차단 및 풀이시간 서버 계산"
git push
```

---

## 배포 후 확인

학생 계정으로 훈련 문항을 하나 풀어보세요.

- 화면의 타이머는 그대로 동작합니다(표시는 클라이언트가 합니다)
- 저장 후 관리자 화면에서 그 문항의 풀이시간이 실제 걸린 시간과 비슷하면 정상입니다

3제 굳히기에서는 **다 풀기 전까지 풀이가 보이지 않아야** 합니다.
완료 후에는 그대로 보입니다.

---

## 남은 항목 (3순위)

**관리자 수동 문항 생성 경로 복구**
`0ccdffe` 커밋에서 61줄이 삭제된 뒤, AI 문항 생성 경로가 cron 하나뿐입니다.
cron-job.org가 멎거나 계정에 문제가 생기면 학생 학습이 멈추고 되살릴 수단이 없습니다.
관리자 화면에 "지금 1건 생성" 버튼 하나만 있어도 안전판이 됩니다.

**관리자 공통 로그아웃**
현재 로그아웃 버튼이 `/admin` 사이드바에만 있습니다.
문제은행·난이도 화면에서는 `/auth/signout` 주소를 직접 쳐야 합니다.
