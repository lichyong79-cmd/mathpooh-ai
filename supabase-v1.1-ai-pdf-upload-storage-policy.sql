-- SOS AI 문제등록: private exam-pdf 버킷 업로드 권한
-- Supabase SQL Editor에서 한 번 실행하세요.

create policy "exam-pdf insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'exam-pdf');

create policy "exam-pdf select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'exam-pdf');

create policy "exam-pdf delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'exam-pdf');
