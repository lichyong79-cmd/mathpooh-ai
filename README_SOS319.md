# SOS319 · 실행시간 확보 + 난이도 화면 전송량 절감 + 풀이사진 표시

**파일 4개.** SQL 없음. 빌드 확인 완료(49/49).

```
src\app\api\student\sos-training\route.ts
src\app\api\admin\training-engine\route.ts
src\app\problem-bank\difficulty\page.tsx
src\app\admin\sos-progress\page.tsx
```

---

## 1) 학생 훈련 API에 실행시간 제한이 없었습니다 — 가장 급했던 것

`src/app/api/student/sos-training/route.ts`에 **`maxDuration` 선언이 없었습니다.**

이 라우트는 학생이 진단을 마치는 순간
**AI 취약점 분석 + 1차 훈련 생성**을 그 자리에서 돌립니다.
AI를 여러 번 부르고 학생 풀이사진 3장까지 함께 보내는 무거운 작업인데,
선언이 없으면 Vercel 기본값 **60초**가 적용됩니다.

즉 **학생이 진단을 마치는 순간 60초 안에 안 끝나면 실패**할 수 있었습니다.
AI 문항 생성에서 겪었던 것과 같은 벽인데 이쪽만 안 막혀 있었습니다.

```ts
export const maxDuration = 300;
```

`admin/training-engine`도 같은 이유로 함께 넣었습니다.

## 2) 난이도 관리 화면 전송량

SOS305에서 문제은행 화면은 고쳤는데 **난이도 화면은 그대로**였습니다.
`problem_dna` 전문까지 5,284문항을 통째로 받아, 화면을 열 때마다 수십 MB가 오갔습니다.

문제은행과 같은 방식으로 바꿨습니다.

```
problem_dna  →  problem_dna->difficulty, problem_dna->summary
```

이 화면이 쓰는 것은 난이도 판정 부분과 요약뿐입니다.
**화면 여는 속도가 눈에 띄게 빨라집니다.**

### 데이터 보호 장치

목록이 축약본만 들고 있으므로, 그 상태로 난이도를 저장하면
`problem_dna` 전체가 축약본으로 덮어써져 **분석 데이터가 사라집니다.**

저장 직전에 전문을 반드시 확보하도록 막았습니다.
전문을 못 받으면 저장을 중단하고 오류를 표시합니다.

> 문제은행 화면(SOS305)에도 같은 장치가 들어 있습니다.

## 3) 학생 풀이사진이 관리자 화면에 안 보였습니다

API는 `solutionPhotoUrl`을 내려주는데 화면이 그리지 않았습니다.

**AI는 이 사진을 보고 취약점을 판단하는데, 정작 관리자는 못 보는** 상태였습니다.
판정이 이상할 때 확인할 근거가 없었습니다.

이제 `/admin/sos-progress` 상세의 문항 카드에 사진이 나옵니다.

- 클릭하면 새 탭에서 원본 크기로
- **답 확정 후 몇 초 만에 제출했는지**
- **화면이탈 횟수** (0회면 표시 안 함)

시간과 이탈 횟수는 이미 기록되고 있던 값인데 활용되지 않고 있었습니다.
학생이 실제로 풀었는지, 답만 찍고 나중에 사진을 올렸는지 구분할 수 있습니다.

---

## 적용

```
cd C:\프로그램_개발\mathpooh-ai
copy src\app\api\student\sos-training\route.ts sos-training-route.bak
copy src\app\problem-bank\difficulty\page.tsx difficulty-page.bak
copy src\app\admin\sos-progress\page.tsx sos-progress-page.bak
```

`SOS319` 안의 `src` 폴더를 프로젝트 루트에 덮어쓴 뒤:

```
findstr "SOS319" src\app\api\student\sos-training\route.ts
git add .
git commit -m "SOS319 실행시간 확보 및 난이도 화면 전송량 절감, 풀이사진 표시"
git push
```

---

## 배포 후 확인

**난이도 관리 화면** (중요)

1. 화면이 예전보다 빨리 뜨는지
2. 난이도를 하나 바꿔 저장
3. 문제은행에서 그 문항의 **DNA 탭이 그대로인지**

DNA가 비어 있으면 즉시 알려주세요. 백업 파일로 되돌리면 됩니다.

**SOS 학습현황** → 학생 상세 → 문항 카드에 풀이사진이 보이는지

**학생 진단** — 다음 진단 완료 시 1차 훈련 생성이 끊기지 않는지.
지금까지 간헐적으로 실패했다면 이번 수정으로 사라질 것입니다.

---

## 현재 상태 정리

| 영역 | 상태 |
|---|---|
| 인증 | API 62개 전부 보호, 관리자 API 차단 유지 |
| 비밀번호 | 학생·학부모 강제 변경, 초기 비밀번호 재사용 차단 |
| 스토리지 | service_role 전용 |
| AI 생성 | 3문항 배치·자동 재시도 8회·막힘 알림 배지 |
| 난이도 | 재판정 완료, 목록에서 문제 보고 수정 가능 |
| 실행시간 | AI 호출 라우트 전부 300초 확보 |

### 남은 것

- **Supabase Pro 전환** — 결정하신 대로 진행하시면 됩니다. 백업이 함께 붙습니다
- **Vercel Hobby** — 수강료 시점에 함께 검토
- **exam-pdf 210MB** — Pro 전환하면 정리 불필요
