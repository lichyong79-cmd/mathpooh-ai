-- SOS264 · AI 생성 문제은행 + 비동기 생성 큐
create extension if not exists pgcrypto;

create table if not exists public.sos_ai_generated_questions (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  source_problem_id uuid null,
  source_training_session_id uuid null references public.sos_training_sessions(id) on delete set null,
  source_training_order integer null,
  generation_kind text not null check (generation_kind in ('HOMEWORK','SECOND_TRAINING')),
  subject text not null default '',
  major_unit text not null default '',
  subunit text not null default '',
  subunit_key text not null default '',
  topic text not null default '',
  core_type text not null default '',
  difficulty integer null,
  difficulty_meter numeric null,
  question_text text not null,
  display_latex text not null default '',
  render_blocks jsonb not null default '[]'::jsonb,
  answer text not null,
  solution text not null default '',
  generation_reason text not null default '',
  verification jsonb not null default '{}'::jsonb,
  status text not null default 'READY' check (status in ('READY','DISABLED')),
  use_count integer not null default 0,
  first_used_student_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sos_ai_generated_questions_kind_idx on public.sos_ai_generated_questions(generation_kind,created_at desc);
create index if not exists sos_ai_generated_questions_subunit_idx on public.sos_ai_generated_questions(subunit_key,created_at desc);
create index if not exists sos_ai_generated_questions_source_idx on public.sos_ai_generated_questions(source_problem_id);

create table if not exists public.sos_ai_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  source_training_session_id uuid not null references public.sos_training_sessions(id) on delete cascade,
  generation_kind text not null check (generation_kind in ('HOMEWORK','SECOND_TRAINING')),
  requested_count integer not null check (requested_count in (3,10)),
  status text not null default 'QUEUED' check (status in ('QUEUED','GENERATING','READY','FAILED')),
  attempt_count integer not null default 0,
  last_error text null,
  result_session_id uuid null references public.sos_training_sessions(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique(source_training_session_id,generation_kind)
);
create index if not exists sos_ai_generation_jobs_status_idx on public.sos_ai_generation_jobs(status,requested_at);

-- 기존 generated_problem도 AI 문제은행에 가능한 만큼 이관한다.
insert into public.sos_ai_generated_questions (
  content_hash,source_problem_id,source_training_session_id,source_training_order,generation_kind,
  subject,major_unit,subunit,subunit_key,topic,core_type,difficulty,difficulty_meter,
  question_text,display_latex,render_blocks,answer,solution,generation_reason,verification,status,use_count,first_used_student_id
)
select
  encode(digest(coalesce(i.generated_problem->>'sourceProblemId','')||'|'||coalesce(i.generated_problem->>'generationKind',s.cycle_kind,'SECOND_TRAINING')||'|'||coalesce(i.generated_problem->>'question',''),'sha256'),'hex'),
  nullif(i.generated_problem->>'sourceProblemId','')::uuid,
  coalesce(s.parent_session_id,s.id),
  nullif(i.generated_problem->>'sourceTrainingOrder','')::integer,
  case when coalesce(i.generated_problem->>'generationKind',s.cycle_kind)='HOMEWORK' then 'HOMEWORK' else 'SECOND_TRAINING' end,
  coalesce(i.generated_problem->>'subject',''),coalesce(i.generated_problem->>'majorUnit',''),coalesce(i.generated_problem->>'subunit',''),coalesce(i.generated_problem->>'subunitKey',''),
  coalesce(i.generated_problem->>'topic',''),coalesce(i.generated_problem->>'coreType',i.generated_problem->>'topic',''),
  nullif(i.generated_problem->>'difficulty','')::integer,nullif(i.generated_problem->>'meter','')::numeric,
  coalesce(i.generated_problem->>'question',''),coalesce(i.generated_problem->>'displayLatex',''),coalesce(i.generated_problem->'renderBlocks','[]'::jsonb),
  coalesce(i.generated_problem->>'answer',''),coalesce(i.generated_problem->>'solution',''),coalesce(i.generated_problem->>'reason',''),coalesce(i.generated_problem->'verification','{}'::jsonb),
  'READY',1,s.student_id
from public.sos_training_items i
join public.sos_training_sessions s on s.id=i.session_id
where i.generated_problem is not null and coalesce(i.generated_problem->>'question','')<>''
on conflict (content_hash) do nothing;

alter table public.sos_ai_generated_questions enable row level security;
alter table public.sos_ai_generation_jobs enable row level security;
drop policy if exists "sos ai generated service access" on public.sos_ai_generated_questions;
create policy "sos ai generated service access" on public.sos_ai_generated_questions for all using (auth.role()='service_role') with check (auth.role()='service_role');
drop policy if exists "sos ai jobs service access" on public.sos_ai_generation_jobs;
create policy "sos ai jobs service access" on public.sos_ai_generation_jobs for all using (auth.role()='service_role') with check (auth.role()='service_role');
notify pgrst, 'reload schema';
