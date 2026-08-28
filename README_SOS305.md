# SOS305 · 학부모 비밀번호 강제 변경 + 스토리지 잠금 + 문제은행 전송량 절감

**SQL 1회 + 파일 4개.** 빌드 확인 완료(47/47).

```
supabase-sos305-storage-lockdown.sql        ← Supabase에서 실행
src\app\api\parent\portal\route.ts
src\app\api\student\portal\route.ts
src\app\p\ParentPortal.tsx
src\app\problem-bank\ProblemBankClient.tsx
```

---

## 1순위 · 학부모 계정 보호

### 문제

`src/lib/parent-account.ts`

```ts
email:    `${phone}@parent.matspu.local`
password: `Mp!${phone.slice(-4)}`
```

**학부모 전화번호만 알면 그 계정으로 로그인됩니다.**
학생 계정에서 SOS280으로 막았던 것과 똑같은 구조인데, 학부모 쪽에는 강제 변경 장치가 없었습니다.

학부모 계정은 **형제자매 전체**의 성적·진단·바로미터·교사 코멘트를 봅니다.
학원에서 학부모 연락처는 학생들끼리도 아는 경우가 많아, 학생 계정보다 노출 위험이 큽니다.

### 고친 방법

- 학부모 포털 API가 `password_changed` 여부를 함께 내려줍니다
- 변경 전에는 **자녀 기록 화면이 열리지 않고** 비밀번호 변경 안내가 먼저 뜹니다
- 변경에 성공하면 메타데이터에 `password_changed: true`가 기록됩니다
- **처음 받은 비밀번호(`Mp!` + 뒤 4자리)를 그대로 다시 넣으면 거부**합니다

### 학생 쪽도 같이 보완

학생은 강제 변경 화면은 이미 있었지만, **초기 비밀번호를 그대로 다시 입력하면 통과**됐습니다.
바꿨다는 기록만 남고 실제로는 그대로인 상태가 됩니다. 이제 거부합니다.

---

## 1순위 · 스토리지 권한 잠금

SOS286에서 만들어 드렸는데 아직 실행 전이라 다시 넣었습니다.

현재 정책이 `to authenticated`라서 **로그인한 학생·학부모가** 아래를 할 수 있습니다.

| 대상 | 가능한 동작 |
|---|---|
| `exam-pdf` / `exam-files` | 시험지 PDF 다운로드 |
| `question-images` | 문항 이미지 5,000여 장 열람 |
| 위 전부 | **insert · update · delete** — 통째로 지우기까지 |

앱 코드는 브라우저에서 스토리지에 직접 접근하지 않습니다.
전부 서버 라우트에서 service role로 접근하고, 화면에는 서명 URL만 내려갑니다.
따라서 `service_role` 전용으로 바꿔도 **화면 동작에 아무 영향이 없습니다.**

되돌리려면 `supabase-v2.0-auth-rls.sql`의 6번 항목을 다시 실행하면 됩니다.

---

## 2순위 · 문제은행 전송량 절감

### 문제

문제은행 화면이 5,284문항을 **`problem_dna` 전문까지 통째로** 브라우저로 받았습니다.
문항 하나당 DNA가 수 KB이므로, 화면을 열 때마다 **수십 MB**가 오갑니다.

Egress가 8.5GB / 5GB(171%)로 초과된 원인 중 하나입니다.

### 고친 방법

**목록에서는 DNA 조각만 받습니다.**

```
problem_dna  →  problem_dna->difficulty, problem_dna->summary
```

난이도 표시·필터에 필요한 것은 이 부분뿐입니다.

**전문은 문항을 선택할 때 그 한 건만 받습니다.**
상세 화면과 DNA 탭은 예전과 똑같이 동작합니다.

전송량이 대략 **1/10 수준**으로 줄고, 화면 여는 속도도 빨라집니다.

### 데이터 보호 장치

목록이 축약본만 들고 있으므로, 그 상태로 저장하면
`problem_dna` 전체가 축약본으로 덮어써져 **분석 데이터가 사라질 수 있습니다.**

저장 직전에 전문을 반드시 확보하도록 막아두었습니다.
전문을 못 받으면 저장을 중단하고 오류를 표시합니다.

---

## 적용 순서

### 1단계 · SQL

Supabase 대시보드 → SQL Editor → `supabase-sos305-storage-lockdown.sql` 실행.

확인:

```sql
select policyname, cmd, roles
from pg_policies where schemaname='storage' and tablename='objects'
order by policyname;
```

`roles` 열에 **service_role만** 있어야 정상입니다.

### 2단계 · 배포

```
cd C:\프로그램_개발\mathpooh-ai
copy src\app\api\parent\portal\route.ts parent-portal-route.bak
copy src\app\api\student\portal\route.ts student-portal-route.bak
copy src\app\p\ParentPortal.tsx parent-portal.bak
copy src\app\problem-bank\ProblemBankClient.tsx problem-bank-client.bak
```

`SOS305` 안의 `src` 폴더를 프로젝트 루트에 덮어쓴 뒤:

```
findstr "SOS305" src\app\api\parent\portal\route.ts
git add .
git commit -m "SOS305 학부모 비밀번호 강제변경 및 스토리지 잠금, 문제은행 전송량 절감"
git push
```

---

## 배포 후 확인 — 이건 꼭 해주세요

**스토리지가 제일 중요합니다.** SQL 실행 후 아래가 모두 보여야 합니다.

- 관리자: 문제은행에서 문항 이미지
- 관리자: 난이도 관리 화면에서 문항 이미지
- 학생: 진단·훈련 문항 이미지
- 학생: 실전모의고사 시험지 PDF

하나라도 안 보이면 알려주세요. `supabase-v2.0-auth-rls.sql` 6번 항목으로 즉시 원상복구됩니다.

**문제은행** — 목록이 예전보다 빨리 뜨는지, 문항을 클릭하면 DNA 탭이 정상인지,
난이도를 바꿔 저장한 뒤 다시 열었을 때 DNA가 그대로인지 확인해 주세요.

**학부모** — 학부모 계정으로 로그인하면 비밀번호 변경 안내가 먼저 뜹니다.
변경 후에야 자녀 기록이 열립니다.

> 기존 학부모 계정은 모두 다음 로그인에서 이 화면을 만납니다.
> 안내가 필요하면 미리 공지해 주세요.

---

## 남은 것

- **막힌 AI 생성 작업 알림** — 8회 재시도 후에도 실패하면 조용히 멈춥니다.
  관리자 화면 상단에 "막힌 작업 N건" 배지 하나면 놓치지 않습니다.
- **Supabase Egress** — 8/29 새 주기 이후 확인해 주세요.
  이번 수정으로 문제은행 몫은 크게 줄지만, 학부모 포털이 늘면 다시 올라갑니다.
- **`5/8` 표기** — 문항 수로 오해하기 쉽습니다. `조판 (5/8단계)`처럼 단위를 붙이면 명확해집니다.
