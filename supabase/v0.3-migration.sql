-- MathPooh AI v0.3: real problem source library
create table if not exists problem_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  year integer,
  exam_type text,
  question_file_path text,
  answer_file_path text,
  solution_file_path text,
  status text not null default 'uploaded' check (status in ('uploaded','analyzing','ready','error')),
  problem_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table problem_sources enable row level security;
drop policy if exists "pilot problem sources all" on problem_sources;
create policy "pilot problem sources all" on problem_sources for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('problem-files', 'problem-files', false)
on conflict (id) do nothing;

drop policy if exists "pilot problem files insert" on storage.objects;
drop policy if exists "pilot problem files read" on storage.objects;
drop policy if exists "pilot problem files update" on storage.objects;
drop policy if exists "pilot problem files delete" on storage.objects;

create policy "pilot problem files insert" on storage.objects for insert with check (bucket_id = 'problem-files');
create policy "pilot problem files read" on storage.objects for select using (bucket_id = 'problem-files');
create policy "pilot problem files update" on storage.objects for update using (bucket_id = 'problem-files') with check (bucket_id = 'problem-files');
create policy "pilot problem files delete" on storage.objects for delete using (bucket_id = 'problem-files');
