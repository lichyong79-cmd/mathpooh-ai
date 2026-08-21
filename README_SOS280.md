# SOS280 · 보안 1순위 (학생 API 차단 · 관리자 허용목록 · 비밀번호 강제 변경)

파일 11개. **SQL 없음.** 빌드 확인 완료.

> **배포 전에 반드시 아래 "적용 순서"의 1·2단계를 먼저 하세요.**
> 순서를 바꾸면 관리자 화면에 못 들어갑니다.

---

## 1) 학생이 문제은행 전체를 정답까지 볼 수 있던 문제

프록시는 학생을 **화면 경로**에서만 막았습니다.

```ts
if (role === "student" && (pathname.startsWith("/admin") || pathname.startsWith("/problem-bank") ...))
```

`/api/problem-bank/catalog`는 `/api`로 시작하므로 이 조건에 걸리지 않았고,
라우트 안의 `requireUser()`는 "로그인했는가"만 확인했습니다.

즉 로그인한 학생이 주소창에 이렇게 치면

```
/api/problem-bank/catalog?limit=5000
```

**4824문항이 `answer` 필드까지 통째로 나왔습니다.** 진단·훈련이 무의미해집니다.
같은 방식으로 관리자 API 44개가 전부 열려 있었습니다.

### 고친 방법 — 이중 차단

**프록시** — 관리자 API 경로 전체를 `role === "admin"`이 아니면 403.

```ts
const isAdminApi =
  pathname.startsWith("/api/admin/") ||
  pathname.startsWith("/api/problem-bank/") ||
  pathname.startsWith("/api/analysis/") ||
  pathname.startsWith("/api/pdf-mapper/");
```

**라우트** — 고위험 7곳에 `requireAdmin()`을 직접 넣었습니다.
프록시 로직이 나중에 바뀌어도 뚫리지 않습니다.

- `problem-bank/catalog` (정답 포함 전량 조회)
- `problem-bank/difficulty-queue` (AI 비용 소모)
- `problem-bank/register`, `regrade-difficulty`, `recalculate-difficulty-from-dna`
- `admin/students/reset-password`, `admin/sos-progress/reset`

## 2) 관리자 권한을 허용목록으로

```ts
// 이전 — 거부목록
return !user || user.user_metadata?.role === "student" ? null : user;
```

`student`만 막아서 **학부모 계정과 역할 미지정 계정이 전부 관리자로 통과**했습니다.
특히 학부모가 학생 생성·수정·삭제 API를 호출할 수 있었습니다.

`requireAdmin()` / `getAdminUser()`를 새로 만들어 `role === "admin"`만 통과시킵니다.

## 3) 학생 비밀번호 강제 변경

아이디 = 전화번호, 비밀번호 = `Mp!` + 뒤 4자리.
`password_changed` 플래그는 저장만 하고 **어디서도 강제하지 않았습니다.**

같은 반 친구 전화번호만 알면 남의 진단 결과와 바로미터를 볼 수 있었습니다.

이제 `passwordChanged === false`면 학생 페이지의 다른 화면으로 넘어가지 못하고
비밀번호 변경 안내가 먼저 뜹니다. `/password` 화면과 변경 API는 이미 있던 것을 씁니다.

---

## 적용 순서 — 순서가 중요합니다

### 1단계 · 관리자 계정에 role 넣기 (배포 전)

현재 관리자 계정(`dltngkr24@gmail.com`)의 역할이 **NULL**입니다.
지금은 "student가 아니면 통과"라서 들어가지고 계신 것이고,
허용목록으로 바꾸면 **바로 잠깁니다.**

Supabase SQL Editor에서:

```sql
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'dltngkr24@gmail.com';
```

확인:

```sql
select email, raw_user_meta_data->>'role' as 역할 from auth.users order by created_at;
```

관리자 행이 `admin`으로 바뀌어야 합니다.

### 2단계 · 로그아웃 후 재로그인 (배포 전)

메타데이터를 바꿔도 **이미 발급된 토큰에는 옛 정보가 들어 있습니다.**
반드시 로그아웃했다가 다시 로그인하세요.

### 3단계 · 배포

```
cd C:\프로그램_개발\mathpooh-ai
copy src\proxy.ts proxy.ts.bak
copy src\lib\supabase\auth.ts auth.ts.bak
copy src\app\page.tsx student-page.bak
```

`SOS280` 안의 `src` 폴더를 프로젝트 루트에 덮어쓴 뒤:

```
findstr "SOS280" src\proxy.ts
git add .
git commit -m "SOS280 관리자 API 차단 및 비밀번호 강제 변경"
git push
```

---

## 배포 후 확인

**관리자로 로그인해서** 문제은행·난이도 관리 화면이 정상인지 먼저 보세요.
못 들어가시면 1·2단계가 빠진 것입니다.

**학생 계정으로** 브라우저에 이 주소를 직접 쳐보세요.

```
https://mathpooh-ai.vercel.app/api/problem-bank/catalog?limit=10
```

`{"success":false,"message":"관리자 권한이 필요합니다."}` 가 나오면 정상입니다.
이전에는 문항이 정답까지 그대로 나왔습니다.

**학생 계정으로 로그인**하면 비밀번호 변경 안내가 먼저 뜹니다.

---

## 미리 말씀드릴 것

**기존 학생 5명 모두 다음 로그인에서 비밀번호 변경 화면을 만납니다.**
`password_changed`가 false로 남아 있기 때문입니다.

수업 전에 안내가 필요하면, 급한 경우 아래로 임시 해제할 수 있습니다.

```sql
update public.students set password_changed = true;
```

다만 이러면 이 조치의 의미가 없어집니다. 학생들에게 한 번만
"비밀번호 바꾸라"고 안내하시는 편을 권합니다.

---

## 남은 항목 (2·3순위)

**2순위 — 부정행위 차단**
- 3제 굳히기에서 `generatedSolution`이 풀기 전부터 JSON에 실려 나감
- 훈련 풀이시간을 클라이언트가 보내므로 바로미터 조작 가능

**3순위 — 안정성**
- 관리자 수동 문항 생성 경로가 없음 (cron이 멎으면 학생 학습 정지)
