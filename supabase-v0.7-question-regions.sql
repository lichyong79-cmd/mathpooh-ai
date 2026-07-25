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
