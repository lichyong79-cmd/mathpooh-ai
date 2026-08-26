# SOS291 · 「멈춘 작업 되살리기」 버튼

**파일 3개.** SQL 없음. SOS290 위에 덮어쓰세요. 빌드 확인 완료.

```
src\app\api\admin\ai-generated-bank\route.ts
src\app\admin\ai-generated-bank\page.tsx
src\app\admin\ai-generated-bank\style.css
```

---

## 왜 필요한가

생성 작업은 `attempt_count`가 **3에 도달하면 더 이상 선택되지 않습니다.**

```ts
.in("status",["QUEUED","FAILED"]).lt("attempt_count",3)
```

cron도, 「지금 1건 생성」도 그 작업을 건너뜁니다.
그래서 오늘처럼 **"대기 중인 생성 작업이 없습니다"** 라고 나오면서
정작 학생은 계속 대기하는 상황이 생깁니다.

기존 「다시 대기열에」 버튼은 **실패 카드에만** 뜨기 때문에,
`GENERATING`으로 죽어 있는 작업은 손댈 방법이 없어 SQL을 직접 써야 했습니다.

## 무엇이 생기나

AI 생성 문제은행 화면 우측 상단, 「지금 1건 생성」 옆에
**「멈춘 작업 되살리기」** 버튼이 생깁니다.

한 번 누르면 시도 이력이 있는 작업(`attempt_count >= 1`)을 모두

- `status` → `QUEUED`
- `attempt_count` → `0`
- `batch_payload` → 비움 (SOS290 배치 진행분 초기화)
- `stage`, `last_error`, `started_at` → 초기화

로 되돌립니다. 다음 cron이나 「지금 1건 생성」에서 바로 잡힙니다.

> 진행 중이던 작업도 처음부터 다시 시작되므로 확인창을 띄웁니다.
> 정상 진행 중일 때는 누르지 마세요.

---

## 적용

```
cd C:\프로그램_개발\mathpooh-ai
copy src\app\api\admin\ai-generated-bank\route.ts ai-bank-route.SOS290.bak
copy src\app\admin\ai-generated-bank\page.tsx ai-bank-page.SOS290.bak
```

`SOS291` 안의 `src` 폴더를 프로젝트 루트에 덮어쓴 뒤:

```
findstr "SOS291" src\app\api\admin\ai-generated-bank\route.ts
git add .
git commit -m "SOS291 멈춘 생성 작업 되살리기 버튼"
git push
```

---

## 지금 돌고 있는 작업은 건드리지 마세요

`10문항을 2묶음으로 나눠 생성합니다 (1/2)` 가 정상 진행 중입니다.
이 버튼을 누르면 그것도 처음부터 다시 시작합니다.

**READY가 뜬 다음에** 배포하시거나, 배포하시더라도 버튼은 누르지 마세요.
