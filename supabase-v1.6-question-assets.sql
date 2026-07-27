-- SOS26 · 시험지는 일괄 입력용, 문제은행은 문항별 독립 저장

alter table public.analysis_questions
  add column if not exists page_no integer,
  add column if not exists crop_x numeric,
  add column if not exists crop_y numeric,
  add column if not exists crop_width numeric,
  add column if not exists crop_height numeric,
  add column if not exists question_image_path text;

alter table public.problem_bank_questions
  add column if not exists page_no integer,
  add column if not exists crop_x numeric,
  add column if not exists crop_y numeric,
  add column if not exists crop_width numeric,
  add column if not exists crop_height numeric,
  add column if not exists question_image_path text;

insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "question images read" on storage.objects;
drop policy if exists "question images insert" on storage.objects;
drop policy if exists "question images update" on storage.objects;
drop policy if exists "question images delete" on storage.objects;

create policy "question images read"
on storage.objects for select to anon, authenticated
using (bucket_id = 'question-images');

create policy "question images insert"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'question-images');

create policy "question images update"
on storage.objects for update to anon, authenticated
using (bucket_id = 'question-images')
with check (bucket_id = 'question-images');

create policy "question images delete"
on storage.objects for delete to anon, authenticated
using (bucket_id = 'question-images');

create index if not exists problem_bank_question_image_idx
  on public.problem_bank_questions(question_image_path);
