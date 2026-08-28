# SOS306 · 막힌 AI 생성 작업 알림 배지

**파일 4개**(신규 1, 교체 3). SQL 없음. 빌드 확인 완료(47/47).

```
src\app\api\admin\stuck-jobs\route.ts        (신규)
src\components\admin-portal-sidebar.tsx
src\components\admin-portal-sidebar.module.css
src\app\admin\ai-generated-bank\page.tsx
```

---

## 왜 필요한가

cron이 **8회까지 스스로 재시도**합니다(SOS295). 약 80분이죠.
그런데 그마저 다 실패하면 **조용히 멈춥니다.**

문제는 알 방법이 없다는 것입니다.
AI 생성 문제은행 화면을 직접 열어봐야만 압니다.
지난번 08.24 작업이 **이틀 동안 방치**되고 학생 두 명이 계속 대기했던 게 그 상황이었습니다.

## 무엇이 생기나

관리자 화면 **어느 페이지에 있든** 본문 맨 위에 띠가 뜹니다.

```
⚠ 막힌 AI 생성 작업 2건   학생 2명 대기 중 · 배유담, 윤동규      보러 가기 →
```

- 로그인만 하면 눈에 들어옵니다
- 누르면 AI 생성 문제은행으로 바로 이동
- **막힌 게 없으면 아무것도 안 보입니다**
- 5분마다 갱신(탭이 화면에 보일 때만)

관리자 셸을 쓰는 모든 화면에 자동 적용됩니다.

### 막힘 판정 기준

둘 중 하나에 해당하면 막힌 것으로 봅니다.

- 재시도 한도(8회)를 다 채움
- **40분 이상 갱신이 없음** — 진행 중처럼 보이지만 실제로는 죽은 작업

정상 진행 중인 작업은 계속 갱신되므로 잡히지 않습니다.

> 배지 조회가 실패해도 화면은 그대로 동작합니다. 부가 기능이라 화면을 막지 않습니다.

## 함께 고친 것 · `5/8` 표기

바로 옆에 `10문항`이 붙어 있어서 **문항 수로 오해하기 쉬웠습니다.**
실제로는 8단계 공정 중 5번째라는 뜻입니다.

```
이전:  5/8 · 문제집 형태로 수식과 문장을 조판하고 있습니다.
이후:  5/8단계 · 문제집 형태로 수식과 문장을 조판하고 있습니다.
```

---

## 적용

```
cd C:\프로그램_개발\mathpooh-ai
copy src\components\admin-portal-sidebar.tsx admin-sidebar.bak
copy src\app\admin\ai-generated-bank\page.tsx ai-bank-page.bak
```

`SOS306` 안의 `src` 폴더를 프로젝트 루트에 덮어쓴 뒤:

```
findstr "SOS306" src\components\admin-portal-sidebar.tsx
git add .
git commit -m "SOS306 막힌 AI 생성 작업 알림 배지"
git push
```

---

## 배포 후 확인

지금은 **대기 0 · 실패 0 · 완료 5493** 상태라 **배지가 안 보이는 게 정상**입니다.

동작을 확인하고 싶으시면 Supabase에서 일부러 하나 막아보세요.

```sql
-- 확인용: 아무 READY 작업 하나를 막힌 상태로 만든다
update public.sos_ai_generation_jobs
set status='FAILED', attempt_count=8, last_error='배지 확인용',
    updated_at=now() - interval '2 hours'
where id = (select id from public.sos_ai_generation_jobs where status='READY' limit 1);
```

관리자 화면을 새로고침하면 배지가 뜹니다. 확인 후 되돌리세요.

```sql
update public.sos_ai_generation_jobs
set status='READY', attempt_count=0, last_error=null, updated_at=now()
where last_error='배지 확인용';
```

---

## 이걸로 정리된 것

| | 상태 |
|---|---|
| AI 생성 실패 | 8회 자동 재시도 → 그래도 안 되면 **배지로 알림** |
| 되살리기 | 화면의 「멈춘 작업 되살리기」 버튼 (SQL 불필요) |
| 진행 상황 | 단계 표기 명확화 |

**이제 화면을 계속 지켜보실 필요가 없습니다.**
문제가 생기면 관리자 화면에 들어올 때 배지가 알려줍니다.

## 남은 것

- **Supabase Egress** — 8/29 새 주기 이후 확인해 주세요.
  SOS305로 문제은행 몫은 크게 줄었지만, 학부모 포털이 늘면 다시 올라갑니다.
  1~2GB 수준이면 안심하셔도 됩니다.
- **Vercel Hobby 약관** — 상업적 사용은 원칙적으로 허용되지 않습니다.
  학생·학부모가 늘면 Pro 검토가 필요한 시점이 옵니다.
