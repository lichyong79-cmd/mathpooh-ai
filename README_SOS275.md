# SOS275 · A안 — AI 판정을 기준으로 고정

파일 5개 교체 + 점검용 SQL 1개. **DB 구조 변경 없음.** 빌드 확인 완료.
SOS274를 이미 적용하셨다면 그 위에 덮어쓰면 됩니다(`difficulty-judge.ts`,
`difficulty-scale.ts`는 SOS274 내용을 포함한 최신본입니다).

```
src\lib\problem-dna.ts
src\lib\difficulty-scale.ts
src\lib\difficulty-judge.ts
src\app\problem-bank\difficulty\page.tsx
src\app\api\problem-bank\recalculate-difficulty-from-dna\route.ts
```

---

## 무엇이 문제였나

`src/lib/problem-dna.ts`의 `applyOperationalDifficultyPolicy`는
**AI를 전혀 호출하지 않습니다.** DNA 점수(개념·조건해석·발상·계산 등 0~100)를
가중 평균해서 1~8을 뽑는 공식입니다. 그런데 그 결과에 이렇게 도장을 찍었습니다.

```ts
difficulty.difficulty_decision = "graded";       // 판정 완료
difficulty.difficulty_review_required = false;   // 검토 불필요
difficulty.scale_version = "sos8-v1";            // 신규 체계
```

호출되는 곳이 세 군데입니다.

- `DNA만 재계산(보조)` 버튼 → **전체 문항**
- 신규문항 AI 분석(`analyze/route.ts`)
- 문항 등록(`problem-bank.ts`)

그래서 `DNA만 재계산`을 한 번 돌릴 때마다, AI가 문제를 풀어보고 내린 판정과
검토필요 플래그가 **공식 추정치로 통째로 덮어써졌습니다.**

`검토필요 0`의 정체가 이것입니다. AI가 3703문항을 판정했지만
그 결과가 남아 있지 않습니다.

### 분포가 쏠린 이유

`evidenceDifficultyLevel`의 구간입니다.

```
<22 → 2점   <34 → 3점   <44 → 어3   <54 → 쉬4
<65 → 적4   <76 → 어4   <88 → 준킬러  ≥88 → 킬러
```

DNA 점수 가중 평균은 20~35 구간에 몰리므로 **2점·3점으로 쏟아집니다.**
`킬러 0`은 88점 이상이 사실상 안 나오는 데다, EBS 수특·수완은 8이 나와도
7로 캡을 씌우기 때문입니다.

---

## 고친 내용

### 1) 공식이 AI 판정을 덮어쓰지 못하게

`difficultyAiVerified()`를 새로 만들고 `applyOperationalDifficultyPolicy`
맨 앞에서 가드합니다.

```ts
if (difficultyAiVerified(dna)) return dna;   // AI 확정값은 손대지 않음
```

`DNA만 재계산` 라우트도 같은 기준으로 건너뛰고, 응답에 `skippedAiVerified`를
넣어 몇 건을 보존했는지 보여줍니다.

### 2) 공식 결과를 '추정치'로 정직하게 표기

```ts
difficulty.difficulty_decision = "estimated";   // 이전: "graded"
difficulty.difficulty_estimated = true;
```

더 이상 검증된 값처럼 보이지 않고, AI 검증 대상으로 남습니다.

### 3) "AI 미검증" 카운터를 정확하게

`ai_regrade_version`만 보면 안 됩니다. 판정 흔적은 남았는데 값은 공식이
덮은 경우가 있기 때문입니다. **시간 순서**로 구분합니다.

```ts
if (dna_recalculated_at > ai_regraded_at) return false;  // 공식이 나중 → 미검증
```

> 배포하면 `AI 미검증`이 1121에서 크게 올라갑니다(4000 이상 예상).
> 상태가 나빠진 게 아니라, 공식이 덮어쓴 문항이 이제 제대로 잡히는 것입니다.

### 4) 신규문항 AI 검증 범위 확대

```ts
const VERIFY_FROM_GRADE = 4;   // 이전: 7 (준킬러 이상만)
```

변별이 필요한 구간은 쉬4 이상이므로 그 위를 모두 검증합니다.
2점·3점은 공식 추정치로 둡니다. **비용이 부담되면 이 상수만 올리면 됩니다**
(`src/lib/problem-dna.ts`의 `shouldVerifyOperationalDifficulty`).

### 5) 작업 편의

- 난이도 필터에 **`AI 미검증`** 선택지 추가 — 검증할 문항만 골라 볼 수 있습니다
- `① 표본 재풀이 검증`이 AI 미검증 문항을 우선 표본으로 뽑습니다
- `DNA만 재계산` 확인창이 "AI 검증이 아니라 추정"임을 명시하고,
  보존되는 AI 확정 문항 수를 함께 보여줍니다

---

## 적용 방법 (윈도우 CMD)

### 1) 백업

```
cd C:\프로그램_개발\mathpooh-ai
copy src\lib\problem-dna.ts  problem-dna.ts.bak
copy src\lib\difficulty-scale.ts  difficulty-scale.ts.bak
copy src\lib\difficulty-judge.ts  difficulty-judge.ts.bak
copy src\app\problem-bank\difficulty\page.tsx  difficulty-page.tsx.bak
copy src\app\api\problem-bank\recalculate-difficulty-from-dna\route.ts  recalc-route.ts.bak
```

### 2) 덮어쓰기 · 확인 · 배포

`SOS275` 안의 `src` 폴더를 프로젝트 루트에 덮어씁니다.

```
findstr "SOS275" src\lib\problem-dna.ts
git add .
git commit -m "SOS275 A안 AI 판정 우선 및 공식 덮어쓰기 차단"
git push
```

`vercel.json`은 `{}` 그대로 두세요.

### 3) 실태 확인 (선택)

Supabase SQL Editor에서 `난이도_검증실태.sql` 실행.
읽기 전용입니다. `ai판정후_공식이덮음` 숫자가 이번 문제의 규모입니다.

---

## 배포 후 해야 할 일

A안은 **AI 판정을 기준으로 삼는 방식**이므로, 덮어쓰기를 막은 것만으로는
값이 좋아지지 않습니다. 실제로 AI를 다시 돌려야 합니다.

### 순서

1. **환경변수 확인 — 이게 먼저입니다**
   Vercel에 `OPENAI_DIFFICULTY_MODEL`이 있는지 보세요. 없으면 `gpt-5-mini`로
   돌아갑니다. 이미지에서 수능 수학을 풀고 8단계를 가르기엔 버겁고,
   confidence가 낮게 나와 판정이 저장되지 않습니다. 상위 모델로 지정하세요.
   **이걸 안 하고 전체 재판정을 돌리면 AI 비용만 쓰고 결과가 남지 않습니다.**

2. **`① 표본 재풀이 검증`으로 48문항 확인**
   AI 미검증 문항을 우선 뽑습니다. 결과가 납득되는지 먼저 보세요.
   여기서 이상하면 전체를 돌릴 이유가 없습니다.

3. **`② 전체 재판정 미리보기` → `③ DB에 최종 적용`**
   SOS274에서 ②의 잠금을 풀었으므로 이제 진행됩니다.

4. **`DNA만 재계산(보조)`은 이제 AI 미검증 문항에만 씁니다.**
   AI 확정값을 건드리지 않으므로 안전하지만, 결과는 추정치입니다.

### 다만 — 전체 재판정은 아직 현실적이지 않습니다

4824문항 × 2회 = 약 9600회 호출을 브라우저 탭이 켜져 있는 동안 순차로
돌리는 구조입니다. 중간에 끊기면 처음부터고, 배치 라우트는
`ids.slice(0, 20)`으로 20개 초과분을 조용히 버립니다.

**SOS271에서 만든 cron 구조를 재활용해 서버에서 조금씩 돌리는 작업**이
사실상 A안의 마지막 조각입니다. 이건 별건으로 진행하시길 권합니다.
그 전까지는 `AI 미검증` 필터로 중요한 과목·단원부터 부분 적용하는 방식이
현실적입니다.
