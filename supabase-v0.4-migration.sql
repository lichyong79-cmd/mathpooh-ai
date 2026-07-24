create extension if not exists pgcrypto;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school text not null default '',
  grade text not null default '고1',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  exam_date date not null,
  status text not null default 'planned' check (status in ('planned','open','closed')),
  created_at timestamptz not null default now()
);

alter table public.students enable row level security;
alter table public.exams enable row level security;
drop policy if exists "students public all" on public.students;
drop policy if exists "exams public all" on public.exams;
create policy "students public all" on public.students for all using (true) with check (true);
create policy "exams public all" on public.exams for all using (true) with check (true);
grant select, insert, update, delete on public.students, public.exams to anon, authenticated;
notify pgrst, 'reload schema';
