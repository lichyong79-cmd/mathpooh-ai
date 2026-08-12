-- SOS 3.3 · 진단 응시 증거(문항 공개/답 확정/풀이사진/화면이탈)
-- supabase-v3.2-sos-live-diagnosis-training.sql 이후 실행

alter table public.sos_training_items
  add column if not exists revealed_at timestamptz,
  add column if not exists answer_locked_at timestamptz,
  add column if not exists solution_photo_path text,
  add column if not exists photo_submitted_at timestamptz,
  add column if not exists photo_submit_seconds integer,
  add column if not exists screen_exit_count integer not null default 0;

create table if not exists public.sos_training_activity_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sos_training_sessions(id) on delete cascade,
  item_id uuid references public.sos_training_items(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists sos_training_activity_logs_session_time_idx
  on public.sos_training_activity_logs(session_id,occurred_at desc);
create index if not exists sos_training_activity_logs_item_time_idx
  on public.sos_training_activity_logs(item_id,occurred_at desc);

alter table public.sos_training_activity_logs enable row level security;
drop policy if exists "sos training activity service access" on public.sos_training_activity_logs;
create policy "sos training activity service access" on public.sos_training_activity_logs
  for all using (auth.role()='service_role') with check (auth.role()='service_role');

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('sos-solution-photos','sos-solution-photos',false,10485760,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set
  public=false,
  file_size_limit=10485760,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/heic','image/heif'];

comment on column public.sos_training_items.revealed_at is '10초 준비 후 실제 문항이 공개된 시각';
comment on column public.sos_training_items.answer_locked_at is '학생이 답안을 확정한 시각';
comment on column public.sos_training_items.photo_submit_seconds is '답안 확정부터 풀이사진 업로드 완료까지 초';
