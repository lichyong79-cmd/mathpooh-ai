-- SOS v3.0 매쓰푸 학생 홈 포스터 관리
create extension if not exists pgcrypto;

create table if not exists public.site_posters (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_path text not null,
  link_url text not null default '',
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_posters_public_order_idx
  on public.site_posters (is_published, sort_order, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-posters',
  'site-posters',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.site_posters enable row level security;
revoke all on public.site_posters from anon, authenticated;
notify pgrst, 'reload schema';
