alter table public.exams
  add column if not exists answer_verified boolean not null default false,
  add column if not exists cover_verified boolean not null default false,
  add column if not exists region_verified boolean not null default false;
