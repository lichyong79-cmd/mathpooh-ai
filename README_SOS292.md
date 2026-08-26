# SOS292 · 3문항 묶음 + 한 번에 한 묶음 (SOS291 포함)

**파일 5개.** SQL 없음(SOS290의 `batch_payload` 컬럼만 있으면 됩니다). 빌드 확인 완료.
**SOS291의 「멈춘 작업 되살리기」 버튼도 이 안에 들어 있습니다.**

```
src\lib\sos-ai-training.ts
src\app\api\cron\sos-ai-generation\route.ts
src\app\api\admin\ai-generated-bank\route.ts
src\app\admin\ai-generated-bank\page.tsx
src\app\admin\ai-generated-bank\style.css
```

---

## 진단이 바뀌었습니다

SOS290에서 "함수 300초 한도"가 원인이라고 봤는데, 실제 오류는 이것이었습니다.

```
FAILED · AI 처리 시간이 80초를 초과했습니다.
```

**80초는 조판 단계 하나의 제한시간**입니다.
함수 전체가 아니라 **개별 AI 호출이 느린 것**이 진짜 원인이었습니다.

조판은 문항마다 LaTeX와 MathML을 만들어야 해서 출력량이 문항 수에 비례합니다.
3문항은 80초 안에 들어오지만 **5문항은 못 들어옵니다.**
그래서 배치를 5로 나눠도 첫 묶음부터 실패했습니다.

## 세 가지를 함께 고쳤습니다

### ① 묶음 크기 5 → 3

```ts
const GENERATION_BATCH_SIZE = 3;
```

3제 굳히기(3문항)가 계속 안정적으로 통과해 온 크기입니다.
10문항이면 **4묶음(3+3+3+1)** 이 됩니다.

### ② 단계별 제한시간 상향

| 단계 | 이전 | 이후 |
|---|---|---|
| 텍스트 생성 | 70초 | 110초 |
| 조판 | 80초 | 150초 |
| 재풀이 검증 | 80초 | 150초 |

묶음이 작아졌으니 실제로는 훨씬 빨리 끝나지만, AI가 느린 시간대를 위한 여유입니다.

### ③ 한 번 실행에 한 묶음만

여러 묶음을 이어서 돌리면 결국 함수 300초 한도에 걸립니다.
이제 묶음 하나를 끝내고 시간이 210초를 넘으면 **스스로 멈추고 저장**합니다.

남은 묶음은 `batch_payload`에 저장된 채로 **다음 cron이 이어받습니다.**

이때는 **실패로 기록하지 않습니다.**

```
3/10문항 완료 · 다음 실행에서 이어갑니다.
```

시도 횟수도 올라가지 않으므로, 3회 제한에 걸려 멈추는 일이 없습니다.

**10문항이면 cron 4회, 약 40분 안에 완성됩니다.**
급하면 「지금 1건 생성」을 여러 번 눌러 즉시 이어갈 수 있습니다.

## SOS291 · 「멈춘 작업 되살리기」 버튼

「지금 1건 생성」 옆에 생깁니다.
시도 횟수를 다 써서 멈춘 작업을 한 번에 대기열로 되돌립니다.
`GENERATING`으로 죽어 있는 것도 포함되므로 SQL을 직접 쓸 일이 없어집니다.

> 정상 진행 중일 때는 누르지 마세요. 진행분이 초기화됩니다.

---

## 적용

```
cd C:\프로그램_개발\mathpooh-ai
copy src\lib\sos-ai-training.ts sos-ai-training.SOS290.bak
copy src\app\api\cron\sos-ai-generation\route.ts cron-route.bak
copy src\app\api\admin\ai-generated-bank\route.ts ai-bank-route.bak
copy src\app\admin\ai-generated-bank\page.tsx ai-bank-page.bak
```

`SOS292` 안의 `src` 폴더를 프로젝트 루트에 덮어쓴 뒤:

```
findstr "SOS292" src\lib\sos-ai-training.ts
git add .
git commit -m "SOS292 3문항 묶음 및 실행당 한 묶음 처리"
git push
```

SQL은 없습니다. SOS290에서 만든 `batch_payload` 컬럼을 그대로 씁니다.

---

## 배포 후

지금 FAILED로 남은 작업이 있습니다.

1. 그 카드의 **「다시 대기열에」** 를 누르거나
2. **「멈춘 작업 되살리기」** 로 한 번에 처리

그다음 **「지금 1건 생성」**.

진행 문구가 이렇게 흘러가면 정상입니다.

```
3/8 · 10문항을 4묶음으로 나눠 생성합니다. (1/4)
3/10문항 완료 · 다음 실행에서 이어갑니다.
   ↓ (다시 누르거나 cron 대기)
6/10문항 완료 · 다음 실행에서 이어갑니다.
   ↓
9/10문항 완료 · 다음 실행에서 이어갑니다.
   ↓
READY
```

**`AI 처리 시간이 ...초를 초과했습니다`가 또 나오면** 알려주세요.
그때는 묶음을 2로 더 줄입니다 (`GENERATION_BATCH_SIZE` 상수 하나).
