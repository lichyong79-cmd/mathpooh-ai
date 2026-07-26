-- SOS v1.3: AI 문제등록 source_files 저장 권한
-- Supabase > SQL Editor > New query 에 붙여넣고 Run을 한 번만 누르세요.

alter table public.source_files enable row level security;

drop policy if exists "source_files select" on public.source_files;
create policy "source_files select"
on public.source_files
for select
to anon, authenticated
using (true);

drop policy if exists "source_files insert" on public.source_files;
create policy "source_files insert"
on public.source_files
for insert
to anon, authenticated
with check (true);

drop policy if exists "source_files update" on public.source_files;
create policy "source_files update"
on public.source_files
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "source_files delete" on public.source_files;
create policy "source_files delete"
on public.source_files
for delete
to anon, authenticated
using (true);
