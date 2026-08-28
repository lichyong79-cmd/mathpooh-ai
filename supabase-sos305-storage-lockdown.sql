-- ============================================================
-- SOS286 · 스토리지 권한 잠금
--
-- 현재 상태
--   supabase-v2.0-auth-rls.sql이 anon(비로그인)을 이미 걷어냈습니다.
--   다만 남은 정책이 `to authenticated`라서 **로그인한 학생도** 아래를
--   전부 할 수 있습니다.
--     - 시험지 PDF(exam-pdf / exam-files) 다운로드
--     - 문항 이미지(question-images) 4800여 장 열람
--     - 그리고 insert / update / delete — 즉 통째로 지우기까지 가능
--
--   앱 코드는 스토리지에 브라우저에서 직접 접근하지 않습니다.
--   31곳 전부 서버 라우트에서 service role 키로 접근하고,
--   학생·관리자 화면에는 서명 URL(signed URL)만 내려갑니다.
--   따라서 service_role만 남겨도 화면 동작에는 아무 영향이 없습니다.
--
-- 이 스크립트는 읽기/쓰기 정책을 service_role 전용으로 다시 만듭니다.
-- 되돌리려면 supabase-v2.0-auth-rls.sql의 6번 항목을 다시 실행하면 됩니다.
-- ============================================================

-- 1) 버킷을 모두 비공개로 확정
insert into storage.buckets (id, name, public)
values
  ('exam-files',          'exam-files',          false),
  ('exam-pdf',            'exam-pdf',            false),
  ('problem-files',       'problem-files',       false),
  ('question-images',     'question-images',     false),
  ('site-posters',        'site-posters',        false),
  ('sos-solution-photos', 'sos-solution-photos', false)
on conflict (id) do update set public = false;


-- 2) 이 버킷들을 가리키는 기존 정책을 전부 제거
--    (v1.1 / v1.6 / v2.0에서 만들어진 것들이 섞여 있을 수 있습니다)
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and (
        coalesce(qual, '')
          ~ 'exam-files|exam-pdf|problem-files|question-images|site-posters|sos-solution-photos'
        or coalesce(with_check, '')
          ~ 'exam-files|exam-pdf|problem-files|question-images|site-posters|sos-solution-photos'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;


-- 3) service_role 전용으로 재작성
--    서버 라우트만 접근할 수 있고, 화면에는 서명 URL로만 내려갑니다.
create policy "sos storage service read" on storage.objects
  for select to service_role
  using (bucket_id in ('exam-files','exam-pdf','problem-files','question-images','site-posters','sos-solution-photos'));

create policy "sos storage service insert" on storage.objects
  for insert to service_role
  with check (bucket_id in ('exam-files','exam-pdf','problem-files','question-images','site-posters','sos-solution-photos'));

create policy "sos storage service update" on storage.objects
  for update to service_role
  using      (bucket_id in ('exam-files','exam-pdf','problem-files','question-images','site-posters','sos-solution-photos'))
  with check (bucket_id in ('exam-files','exam-pdf','problem-files','question-images','site-posters','sos-solution-photos'));

create policy "sos storage service delete" on storage.objects
  for delete to service_role
  using (bucket_id in ('exam-files','exam-pdf','problem-files','question-images','site-posters','sos-solution-photos'));

notify pgrst, 'reload schema';


-- ============================================================
-- 4) 확인 — 아래를 실행해 결과를 보세요.
--    roles 열에 service_role만 있어야 정상입니다.
-- ============================================================
-- select policyname, cmd, roles
-- from pg_policies
-- where schemaname='storage' and tablename='objects'
-- order by policyname;

-- 버킷이 전부 비공개인지 확인
-- select id, public from storage.buckets order by id;
