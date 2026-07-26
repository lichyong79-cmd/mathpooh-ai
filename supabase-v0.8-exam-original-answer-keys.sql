alter table public.exams
  add column if not exists original_file_name text not null default '',
  add column if not exists original_file_path text not null default '',
  add column if not exists answer_keys jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
