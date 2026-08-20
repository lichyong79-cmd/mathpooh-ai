# SOS270 · AI 생성문항 렌더링 정규화 + AI 생성 워커 실행 경로 복구

빌드 확인 완료 (`npx tsc --noEmit` 무오류, `npx next build` 45/45 정상).
**SQL 변경 없음.**

---

## 1. 무엇을 고쳤나

### (A) AI 생성문항 렌더링 — 계속 나던 문제의 원인 3가지

| # | 원인 | 증상 | 조치 |
|---|---|---|---|
| 1 | `.sos-ai-latex-body`에 `white-space` 규칙이 없었음 | 렌더러가 `textContent`로 넣은 줄바꿈이 전부 공백으로 뭉개져, 문제 본문과 선택지 ①②③④⑤가 **한 문단으로 붙어** 나옴 | `white-space:pre-wrap` 추가 |
| 2 | MathJax가 `\( \)`, `\[ \]`만 인식 | AI가 `$x^2$`로 보내면 **raw 텍스트 그대로 노출**. 게다가 검증 함수가 이걸 실패로 판정해 작업 전체를 FAILED로 떨굼 | `normalizeDisplayLatex()`로 `$…$` → `\(…\)` 변환 (서버 저장 시 + 화면 표시 시 이중 적용) |
| 3 | 검증 함수가 **화면에 안 쓰는 데이터**를 필수로 요구 | 렌더러는 `displayLatex`만 쓰는데, 검증은 MathML `renderBlocks`를 필수로 보고 `문제에 "/"가 있으면 mfrac 필수` 같은 규칙까지 적용. `km/h`, `3/4` 한 번만 나와도 멀쩡한 문제가 탈락 → 재생성 루프 | 판정 기준을 `displayLatex`로 이전. MathML은 "있으면 검사, 없으면 통과"로 하향 |

부수 조치:
- `.sos-ai-latex.loading`이 본문을 `left:-99999px`로 밀어낸 상태에서 MathJax가 폭을 측정 → 긴 수식 줄바꿈이 틀어짐. `visibility:hidden`으로 변경(폭 유지).
- `holder.current`가 비어 있으면 effect가 조용히 `return`해서 **"조판 중..."에 영구히 멈추는** 경로가 있었음. `ref` → `state`로 전환하고 12초 타임아웃 가드 추가.
- 조판 단계 추론 강도가 `effort:"minimal"`(가장 어려운 작업에 가장 낮은 강도)이었음 → `"low"`.
- 조판 프롬프트에 `$` 표기 금지 + 구분자 개수 일치 + 선택지 줄바꿈 규칙 명시.

**이미 저장된 과거 AI 문항도 화면 쪽 정규화가 적용되므로 재생성 없이 바로 정상 표시됩니다.**

### (B) AI 생성 작업이 영원히 실행되지 않던 문제 (원인 2중)

학생이 1차훈련을 끝내면 `sos_ai_generation_jobs`에 QUEUED로 예약되고 "짧게는 10분, 길게는 30분" 안내가 뜨는데:

- **원인 A**: `vercel.json`이 `{}` 였음 → cron 미등록. 워커를 부르는 주체가 없음.
- **원인 B**: `proxy.ts`의 `isPublicPath`에 `/api/cron/`이 없음 → Vercel Cron 호출에는 로그인 쿠키가 없으므로, cron을 등록했더라도 **라우트 도달 전에 401**로 잘림.

→ 3제 굳히기·2차 훈련에 도달한 학생은 **비활성 버튼 앞에서 무한 대기**. 관리자가 수동 버튼(SOS269)을 눌러야만 진행됐습니다.

조치: cron 등록 + 프록시 예외 + `CRON_SECRET` **필수화**(경로가 열렸으므로 없으면 503으로 막음).

### (C) 대기 화면 자동 확인

학생이 직접 새로고침해야 READY를 알 수 있었음 → 대기 작업이 있으면 **45초마다 자동 확인**(탭이 활성일 때만) + `지금 확인` 버튼 추가.

---

## 2. 파일 목록

프로젝트의 **같은 경로에 그대로 덮어쓰기**:

```
vercel.json
src\proxy.ts
src\app\page.tsx
src\app\student.css
src\components\sos-generated-question-mathjax.tsx
src\lib\sos-ai-training.ts
src\app\api\cron\sos-ai-generation\route.ts
```

| 파일 | 변경 내용 |
|---|---|
| `vercel.json` | 10분 주기 cron 등록 + `maxDuration:300` |
| `src\proxy.ts` | `/api/cron/`을 로그인 가드에서 제외 |
| `src\app\page.tsx` | 대기 작업 45초 자동 폴링 + `지금 확인` 버튼 |
| `src\app\student.css` | `white-space:pre-wrap`, loading 시 `visibility:hidden`, 버튼 스타일 |
| `src\components\sos-generated-question-mathjax.tsx` | 전면 교체 (정규화·조판 누락 제거·타임아웃) |
| `src\lib\sos-ai-training.ts` | `normalizeDisplayLatex` 신설, 검증 재작성, effort 상향, 프롬프트 보강 |
| `src\app\api\cron\sos-ai-generation\route.ts` | `CRON_SECRET` 필수화 |

---

## 3. 적용 방법 (윈도우 CMD)

### 1) 백업

```
cd C:\경로\sos
copy src\components\sos-generated-question-mathjax.tsx  sos-generated-question-mathjax.tsx.bak
copy src\lib\sos-ai-training.ts  sos-ai-training.ts.bak
copy src\app\student.css  student.css.bak
copy src\app\page.tsx  page.tsx.bak
copy src\proxy.ts  proxy.ts.bak
```

### 2) 파일 덮어쓰기

압축을 푼 `SOS270` 폴더 안의 구조가 프로젝트 구조와 동일합니다. 탐색기에서 `SOS270` 안의 `vercel.json`과 `src` 폴더를 프로젝트 루트에 통째로 덮어쓰면 됩니다.

덮어쓴 뒤 확인:

```
dir src\components\sos-generated-question-mathjax.tsx
type vercel.json
```

### 3) 환경변수 설정 — **필수**

Vercel 프로젝트 → **Settings → Environment Variables**

```
이름:  CRON_SECRET
값:    아무 긴 랜덤 문자열 (예: sos-cron-9f2a7c4e1b8d3056)
환경:  Production, Preview, Development 전부 체크
```

Vercel Cron은 이 값을 `Authorization: Bearer …` 헤더로 **자동으로** 보냅니다.
**이 값을 안 넣으면 cron이 503으로 거부되어 이전과 똑같이 작업이 안 돕니다.**

로컬에서도 테스트하려면 `.env.local`에 같은 줄을 추가하세요.

### 4) Vercel 플랜 확인 — **중요**

**Hobby 플랜은 cron이 하루 1회, 1개만** 허용됩니다. 10분 주기는 Pro 이상이 필요합니다.

Hobby라면 둘 중 하나를 택하세요.

- **(권장)** Pro로 업그레이드 후 그대로 사용
- 또는 `vercel.json`의 `schedule`을 `"0 3 * * *"`(매일 새벽 3시)로 바꾸고, 당장 급한 건은 관리자 화면의 수동 공정 버튼(SOS269)으로 처리

```json
{
  "crons": [
    { "path": "/api/cron/sos-ai-generation", "schedule": "0 3 * * *" }
  ],
  "functions": {
    "src/app/api/cron/sos-ai-generation/route.ts": { "maxDuration": 300 }
  }
}
```

### 5) 빌드 · 배포

```
npm run build
git add .
git commit -m "SOS270 AI 생성문항 렌더링 정규화 및 cron 실행 경로 복구"
git push
```

---

## 4. 배포 후 확인 순서

1. **Vercel → Settings → Cron Jobs** 에 `/api/cron/sos-ai-generation`이 보이는지 확인
2. 10분(또는 설정한 주기) 뒤 **Logs**에서 해당 경로 응답 확인
   - `{"success":true,"processed":1}` → 작업 1건 처리됨 (정상)
   - `{"success":true,"processed":0}` → 대기 중인 작업 없음 (정상)
   - `401 cron unauthorized` → `CRON_SECRET` 값 불일치
   - `503 CRON_SECRET 환경변수가 설정되지 않았습니다` → 3)번 미설정
3. 학생 계정으로 접속 → 기존 AI 유사문항을 열어 **선택지 ①~⑤가 각 줄로 분리되고 수식이 조판되는지** 확인
4. 기존 FAILED 작업은 학생 화면의 `AI 생성 다시 시도`를 누르면 QUEUED로 되살아납니다

---

## 5. 이번에 손대지 않은 것 (다음 순서 제안)

렌더링과 cron만 고쳤습니다. 남은 항목 우선순위:

1. **학생 비밀번호 강제 변경** — 현재 아이디=전화번호, 비밀번호=`Mp!`+뒤4자리이고 `password_changed` 플래그를 저장만 하고 강제하지 않음. 친구 전화번호만 알면 남의 학습기록에 로그인 가능. **개인정보 보호 관점에서 1순위.**
2. **관리자 권한 허용목록 전환** — 현재 `role !== "student" && role !== "parent"`인 거부목록 방식이라 역할 미지정 계정이 전부 관리자가 됨. 특히 `api/admin/students`는 학부모 계정의 학생 생성·수정을 허용함.
3. **진단 10초 카운트다운 실패 시 재시도 버튼** — `reveal` API가 실패하면 useEffect가 재실행되지 않아 학생이 그 문항에 갇힘. 학생이 갇히는 유일한 지점.
4. **HOMEWORK 풀이 사전 노출 차단** — `generatedSolution`이 상태와 무관하게 `cycle_kind==="HOMEWORK"`이면 전송됨. 풀기 전부터 전체 풀이가 JSON에 실림.
5. **훈련 풀이시간 서버 계산** — 진단은 서버에서 계산해 안전하나, 훈련의 `save_training_item`은 클라이언트가 보낸 `responseSeconds`를 그대로 신뢰. 바로미터가 조작 가능.
6. **파이프라인 시간 예산** — `maxDuration=300`인데 2회 시도 시 최대 460초. 재시도 1회로 축소하거나 cron 1회당 다건 처리로 조정 필요.

1~3번은 한 번에 묶어도 부담 없는 크기입니다.
