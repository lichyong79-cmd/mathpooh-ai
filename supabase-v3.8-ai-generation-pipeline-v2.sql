-- SOS268 · AI 변형문항 제작 파이프라인 V2
-- 실행 순서: 이 SQL을 먼저 실행한 뒤 SOS268을 배포하세요.

alter table public.sos_ai_generation_jobs
  add column if not exists pipeline_version text not null default 'V2',
  add column if not exists stage text not null default 'QUEUED',
  add column if not exists stage_index integer not null default 0,
  add column if not exists stage_total integer not null default 8,
  add column if not exists stage_message text null,
  add column if not exists draft_payload jsonb not null default '{}'::jsonb,
  add column if not exists rendered_payload jsonb not null default '{}'::jsonb,
  add column if not exists verification_payload jsonb not null default '{}'::jsonb,
  add column if not exists stage_updated_at timestamptz null;

update public.sos_ai_generation_jobs
set pipeline_version='V2',
    stage=case
      when status='READY' then 'READY'
      when status='FAILED' then 'FAILED'
      when status='GENERATING' then 'SOURCE_ANALYSIS'
      else 'QUEUED'
    end,
    stage_index=case when status='READY' then 8 when status='GENERATING' then 1 else 0 end,
    stage_total=8,
    stage_message=coalesce(stage_message,case
      when status='READY' then '기존 생성 완료 작업'
      when status='FAILED' then '기존 생성 실패 작업'
      when status='GENERATING' then '기존 생성 작업 이어가기'
      else '생성 대기 중'
    end),
    stage_updated_at=coalesce(stage_updated_at,updated_at,now())
where pipeline_version is null or stage is null or stage_message is null or stage_updated_at is null;

create index if not exists sos_ai_generation_jobs_stage_idx on public.sos_ai_generation_jobs(stage,updated_at desc);
notify pgrst, 'reload schema';
