-- SOS v0.6: 모든 컴퓨터에서 동일한 시험정보/PDF 사용
create extension if not exists pgcrypto;

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  round integer not null default 1,
  title text not null,
  exam_code text not null unique,
  exam_date date not null,
  grade text not null default '고1',
  subject text not null default '',
  exam_range text not null default '',
  question_count integer not null default 30,
  time_limit integer not null default 100,
  total_score integer not null default 100,
  objective_count integer not null default 21,
  short_answer_count integer not null default 9,
  status text not null default '작성중',
  test_file_name text not null default '',
  solution_file_name text not null default '',
  test_file_path text not null default '',
  solution_file_path text not null default '',
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exams add column if not exists round integer not null default 1;
alter table public.exams add column if not exists exam_code text;
alter table public.exams add column if not exists grade text not null default '고1';
alter table public.exams add column if not exists subject text not null default '';
alter table public.exams add column if not exists exam_range text not null default '';
alter table public.exams add column if not exists question_count integer not null default 30;
alter table public.exams add column if not exists time_limit integer not null default 100;
alter table public.exams add column if not exists total_score integer not null default 100;
alter table public.exams add column if not exists objective_count integer not null default 21;
alter table public.exams add column if not exists short_answer_count integer not null default 9;
alter table public.exams add column if not exists test_file_name text not null default '';
alter table public.exams add column if not exists solution_file_name text not null default '';
alter table public.exams add column if not exists test_file_path text not null default '';
alter table public.exams add column if not exists solution_file_path text not null default '';
alter table public.exams add column if not exists memo text not null default '';
alter table public.exams add column if not exists updated_at timestamptz not null default now();

-- 이전 planned/open/closed 제약이 있으면 제거하고 한글 상태값 허용
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.exams'::regclass AND contype='c' LOOP
    EXECUTE format('alter table public.exams drop constraint if exists %I', c.conname);
  END LOOP;
END $$;

alter table public.exams enable row level security;
drop policy if exists "exams public all" on public.exams;
create policy "exams public all" on public.exams for all using (true) with check (true);
grant select, insert, update, delete on public.exams to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('exam-files', 'exam-files', true)
on conflict (id) do update set public = true;

drop policy if exists "exam files public read" on storage.objects;
drop policy if exists "exam files public write" on storage.objects;
drop policy if exists "exam files public update" on storage.objects;
drop policy if exists "exam files public delete" on storage.objects;
create policy "exam files public read" on storage.objects for select using (bucket_id = 'exam-files');
create policy "exam files public write" on storage.objects for insert with check (bucket_id = 'exam-files');
create policy "exam files public update" on storage.objects for update using (bucket_id = 'exam-files') with check (bucket_id = 'exam-files');
create policy "exam files public delete" on storage.objects for delete using (bucket_id = 'exam-files');

notify pgrst, 'reload schema';

-- SOS v0.7: 문항 영역을 파일 다운로드가 아니라 DB에 저장
create table if not exists public.question_regions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_no integer not null,
  page_no integer not null default 1,
  x numeric not null default 0,
  y numeric not null default 0,
  width numeric not null default 0,
  height numeric not null default 0,
  question_type text not null default 'choice',
  answer text not null default '',
  verified boolean not null default false,
  source text not null default 'auto',
  updated_at timestamptz not null default now(),
  unique(exam_id, question_no)
);
alter table public.question_regions enable row level security;
drop policy if exists "question regions public all" on public.question_regions;
create policy "question regions public all" on public.question_regions for all using (true) with check (true);
grant select, insert, update, delete on public.question_regions to anon, authenticated;
notify pgrst, 'reload schema';
