# SOS30 · 인증 도입 + RLS 전면 잠금

지금까지 SOS는 **주소만 알면 누구나** 학생 목록·시험지·문제은행을 보고 지울 수 있었습니다.
이 버전에서 로그인을 붙이고 데이터베이스·스토리지를 전부 잠급니다.

> **중요**: SQL과 코드는 반드시 **같이** 배포해야 합니다.
> SQL만 먼저 실행하면 기존 화면이 전부 "권한 없음"으로 멈춥니다.
> 코드만 먼저 배포하면 로그인 화면은 생기지만 DB는 여전히 열려 있습니다.

---

## 적용 순서

### 0단계 · 백업 (5분)

Supabase 대시보드 → **Database → Backups** 에서 현재 시점 백업이 있는지 확인합니다.
이 작업은 정책을 지우고 다시 만들기 때문에 되돌릴 지점이 있어야 합니다.

---

### 1단계 · 관리자 계정 만들기 (SQL보다 먼저!)

Supabase 대시보드 → **Authentication → Users → Add user → Create new user**

- Email: 원장님이 쓰실 이메일
- Password: 직접 지정
- **Auto Confirm User: 켜기** (안 켜면 메일 인증 전까지 로그인 안 됩니다)

강사분이 쓰실 계정이 있으면 같은 방식으로 추가합니다.

> 계정을 먼저 안 만들고 SQL을 실행하면 아무도 데이터에 접근할 수 없게 됩니다.

---

### 2단계 · 회원가입 차단

Supabase 대시보드 → **Authentication → Sign In / Providers → Email**

- `Allow new users to sign up` → **끄기**
- `Confirm email` → **끄기**

이걸 안 끄면 누구나 가입해서 로그인 권한을 얻습니다. **가장 중요한 설정입니다.**

---

### 3단계 · 코드 반영

받으신 `SOS30_auth_rls.zip`을 프로젝트 루트에 풀면 아래 경로가 추가·덮어쓰기 됩니다.

**새로 생기는 파일**

```
src/proxy.ts                          로그인 안 하면 전 페이지·API 차단
                                      (Next.js 16에서 middleware가 proxy로 이름이 바뀌었습니다)
src/lib/supabase/auth.ts              서버 라우트용 로그인 확인
src/lib/supabase/rest.ts              브라우저 REST 호출용 토큰 헤더 + 서명 URL
src/app/login/page.tsx                로그인 화면
src/app/auth/signout/route.ts         로그아웃
src/app/AccountBox.tsx                사이드바 계정 표시 + 로그아웃 버튼
supabase-v2.0-auth-rls.sql            RLS 잠금 SQL
scripts/add-auth-guards.py            (참고용) 가드 삽입 스크립트
scripts/swap-rest-auth.py             (참고용) 헤더 치환 스크립트
```

**덮어쓰는 파일**

```
package.json                          @supabase/ssr 추가
src/lib/supabase/server.ts            service role 키 없으면 즉시 실패
src/lib/supabase/client.ts            쿠키 기반 세션 클라이언트
src/app/page.tsx                      인증 헤더 + 서명 URL + 계정 영역
src/app/problem-bank/page.tsx         인증 헤더
src/app/pdf-mapper/page.tsx           인증 헤더 + 서명 URL
src/app/api/**/route.ts               (16개 전부) 라우트 진입 시 로그인 확인
```

패키지를 설치하고 로컬에서 빌드가 통과하는지 먼저 확인합니다.

```bash
npm install
npm run build
```

---

### 4단계 · 환경변수 확인

`.env.local` (로컬)과 Vercel **Settings → Environment Variables** (배포) 양쪽에 있어야 합니다.

| 변수 | 위치 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 로컬 + Vercel | 기존 그대로 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 로컬 + Vercel | 기존 그대로 |
| `SUPABASE_SERVICE_ROLE_KEY` | 로컬 + Vercel | **필수로 승격** |
| `OPENAI_API_KEY` | 로컬 + Vercel | 기존 그대로 |
| `OPENAI_MODEL` | 선택 | 없으면 `gpt-5` |

`SUPABASE_SERVICE_ROLE_KEY`는 예전에는 없어도 anon 키로 조용히 대체됐습니다.
이제는 없으면 서버 라우트가 바로 에러를 냅니다. **Vercel에도 꼭 넣으세요.**

> service role 키는 절대 `NEXT_PUBLIC_` 접두사를 붙이면 안 됩니다.
> 붙이는 순간 브라우저 번들에 그대로 실려서 RLS를 잠근 의미가 사라집니다.

---

### 5단계 · SQL 실행

Supabase 대시보드 → **SQL Editor** → `supabase-v2.0-auth-rls.sql` 내용을 붙여넣고 실행합니다.

맨 아래 확인 쿼리 결과가 이렇게 나오면 정상입니다.

- 모든 정책의 `roles`가 `{authenticated}`
- 버킷 4개(`exam-files`, `exam-pdf`, `problem-files`, `question-images`)가 전부 `public = false`

---

### 6단계 · 로컬 확인

```bash
npm run dev
```

1. `http://localhost:3000` 접속 → `/login`으로 넘어가는지
2. 1단계에서 만든 계정으로 로그인 → 관리자 화면이 뜨는지
3. 시험 목록·문제은행·AI 분석 화면이 예전처럼 뜨는지
4. 시험지 PDF 미리보기가 열리는지 (서명 URL로 바뀐 부분)
5. 사이드바 왼쪽 아래 전원 아이콘 → 로그아웃 되는지
6. 로그아웃 상태에서 `http://localhost:3000/api/analysis/health` 접속 → `401`이 뜨는지

6번이 제일 중요합니다. 여기서 데이터가 나오면 뭔가 빠진 겁니다.

---

### 7단계 · 배포

```bash
git add .
git commit -m "SOS30: 인증 도입 및 RLS 전면 잠금"
git push
```

Vercel이 자동 배포합니다. 배포 완료 후 **시크릿 창**으로 배포 주소를 열어
로그인 화면이 뜨는지 확인합니다. (일반 창은 세션이 남아 있어 확인이 안 됩니다)

---

## 바뀐 동작

| 항목 | 전 | 후 |
|---|---|---|
| 페이지 접근 | 누구나 | 로그인 계정만 |
| API 호출 | 누구나 | 로그인 계정만 (401) |
| DB 읽기/쓰기 | anon 키로 전부 가능 | 로그인 사용자만 |
| 스토리지 | 공개 URL로 누구나 다운로드 | 1시간 만료 서명 URL |
| service role 키 없을 때 | anon 키로 조용히 대체 | 즉시 에러 |
| 사이드바 계정 | `이철용 원장` 고정 텍스트 | 실제 로그인 계정 |

---

## 문제가 생기면

**로그인은 되는데 화면 데이터가 비어 있다**
→ SQL의 3번 블록(정책 재생성)이 안 돌았을 수 있습니다. 확인 쿼리를 다시 돌려보세요.

**API가 전부 500, "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다"**
→ 4단계 환경변수를 Vercel에 안 넣었습니다. 넣고 재배포하세요.

**PDF가 안 열린다**
→ 버킷이 아직 `public = true`거나 스토리지 정책이 안 만들어졌습니다. SQL 5·6번 블록 확인.

**전부 되돌리고 싶다**
→ `public._rls_backup_v2` 테이블에 실행 직전 정책이 그대로 저장돼 있습니다.
   여기서 예전 정책을 복원하고, 코드는 이전 커밋으로 `git revert` 하면 됩니다.

---

## 참고 · proxy.ts

Next.js 16부터 `middleware.ts`가 `proxy.ts`로 이름이 바뀌었습니다.
기능은 같고 파일명과 함수명만 다릅니다.

기존 프로젝트에 `src/middleware.ts`가 남아 있으면 **삭제하세요.**
둘 다 있으면 어느 쪽이 도는지 알 수 없습니다.

```bash
rm src/middleware.ts
```

---

## 아직 남은 것

- 원장/강사 **역할 구분이 없습니다.** 지금은 로그인한 사람은 모두 같은 권한입니다.
  강사에게 학생 개인정보를 안 보이게 하려면 `profiles` 테이블 + 역할별 정책이 필요합니다.
- 학생용 화면이 생기면 정책을 다시 설계해야 합니다.
  학생은 `authenticated`지만 **자기 데이터만** 봐야 하므로 `using (true)`로는 안 됩니다.
- `src/app/page.tsx`의 학생 목록은 아직 코드에 박힌 더미 데이터입니다.
  실제 원생 데이터를 넣기 전에 이 인증 작업이 끝나 있어야 합니다.
