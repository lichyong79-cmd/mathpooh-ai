-- =====================================================================
-- SOS v2.0 · 인증 도입 + RLS 전면 잠금
-- =====================================================================
-- 이 스크립트는 Supabase SQL Editor에서 "한 번" 실행합니다.
--
-- 실행 전 반드시 확인:
--   1. Authentication > Users 에서 관리자 계정을 먼저 만들어 두세요.
--      (계정이 없으면 실행 직후 아무도 데이터에 접근할 수 없습니다)
--   2. 이 스크립트는 public 스키마의 "모든" 기존 정책을 삭제하고
--      로그인 사용자 전용 정책으로 다시 만듭니다.
--
-- 실행 후 상태:
--   anon(비로그인)      → 모든 테이블·스토리지 접근 불가
--   authenticated(로그인) → 전체 접근 가능
--   service_role(서버)   → RLS 우회 (기존과 동일)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. 현재 상태 기록 (실행 전 스냅샷 · 문제 생기면 되돌릴 때 참고)
-- ---------------------------------------------------------------------
create table if not exists public._rls_backup_v2 (
  captured_at timestamptz not null default now(),
  schemaname  text,
  tablename   text,
  policyname  text,
  cmd         text,
  roles       text,
  qual        text,
  with_check  text
);

insert into public._rls_backup_v2 (schemaname, tablename, policyname, cmd, roles, qual, with_check)
select schemaname, tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname in ('public', 'storage');


-- ---------------------------------------------------------------------
-- 1. public 스키마의 모든 테이블에 RLS 활성화
-- ---------------------------------------------------------------------
-- 마이그레이션 파일이 여러 갈래로 갈라져 있어 테이블 목록을 손으로 적지
-- 않고 실제 DB에 존재하는 테이블 전체를 대상으로 합니다.
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '_rls_backup_v2'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 2. public 스키마의 기존 정책 전부 삭제
-- ---------------------------------------------------------------------
-- 기존 정책은 전부 using(true) 형태라 anon 키만으로 전체 읽기·쓰기·삭제가
-- 가능한 상태였습니다. 남겨두면 새 정책과 OR로 합쳐져 무력화됩니다.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename <> '_rls_backup_v2'
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 3. 로그인 사용자 전용 정책 재생성
-- ---------------------------------------------------------------------
-- 지금은 원장·강사 모두 같은 권한입니다.
-- 나중에 역할을 나눌 때 이 정책만 교체하면 됩니다.
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '_rls_backup_v2'
  loop
    execute format(
      'create policy "staff full access" on public.%I for all to authenticated using (true) with check (true)',
      r.tablename
    );
  end loop;
end $$;

-- 백업 테이블은 서버(service_role)만 보게 둡니다.
alter table public._rls_backup_v2 enable row level security;


-- ---------------------------------------------------------------------
-- 4. anon 역할의 테이블 권한 회수 (RLS 앞단에서 한 번 더 차단)
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant usage on schema public to authenticated;
grant all on all tables    in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
alter default privileges in schema public grant all on tables    to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;


-- ---------------------------------------------------------------------
-- 5. 스토리지 버킷 비공개 전환
-- ---------------------------------------------------------------------
-- exam-files 는 지금까지 public 이라 URL만 알면 누구나 시험지 PDF를
-- 내려받을 수 있었습니다. 전부 비공개로 바꾸고 서명 URL로만 접근합니다.
insert into storage.buckets (id, name, public)
values
  ('exam-files',      'exam-files',      false),
  ('exam-pdf',        'exam-pdf',        false),
  ('problem-files',   'problem-files',   false),
  ('question-images', 'question-images', false)
on conflict (id) do update set public = false;


-- ---------------------------------------------------------------------
-- 6. 스토리지 정책 재작성 (이 4개 버킷 대상 정책만 삭제)
-- ---------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '')       ~ 'exam-files|exam-pdf|problem-files|question-images'
        or coalesce(with_check, '') ~ 'exam-files|exam-pdf|problem-files|question-images'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy "sos buckets read" on storage.objects
  for select to authenticated
  using (bucket_id in ('exam-files', 'exam-pdf', 'problem-files', 'question-images'));

create policy "sos buckets insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('exam-files', 'exam-pdf', 'problem-files', 'question-images'));

create policy "sos buckets update" on storage.objects
  for update to authenticated
  using      (bucket_id in ('exam-files', 'exam-pdf', 'problem-files', 'question-images'))
  with check (bucket_id in ('exam-files', 'exam-pdf', 'problem-files', 'question-images'));

create policy "sos buckets delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('exam-files', 'exam-pdf', 'problem-files', 'question-images'));


-- ---------------------------------------------------------------------
-- 7. 신규 회원가입 차단 확인용 안내
-- ---------------------------------------------------------------------
-- SQL로는 막을 수 없습니다. 대시보드에서 직접 꺼야 합니다.
--   Authentication > Sign In / Providers > Email
--     - "Allow new users to sign up"  → OFF
--     - "Confirm email"               → OFF (관리자가 직접 계정을 만들기 때문)
-- 이 설정을 끄지 않으면 누구나 가입해서 authenticated 권한을 얻습니다.


-- ---------------------------------------------------------------------
-- 8. 결과 확인
-- ---------------------------------------------------------------------
-- 아래 쿼리 결과가 전부 {authenticated} 로 나오면 정상입니다.
select tablename, policyname, roles::text, cmd
from pg_policies
where schemaname = 'public'
order by tablename;

-- 버킷이 전부 public = false 인지 확인합니다.
select id, public from storage.buckets
where id in ('exam-files', 'exam-pdf', 'problem-files', 'question-images');
