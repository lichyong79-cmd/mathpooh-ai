-- SOS372: 참가 날짜별 A/B/C 범위 저장
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.

alter table public.sos_program_applications
  add column if not exists selected_cycle_scopes jsonb not null default '{}'::jsonb;

-- 기존 신청은 종전의 단일 범위를 각 선택 날짜에 복사해 호환성을 유지합니다.
update public.sos_program_applications a
set selected_cycle_scopes = coalesce((
  select jsonb_object_agg(cycle_id::text, coalesce(a.scope_code, 'FULL'))
  from unnest(coalesce(a.selected_cycle_ids, '{}'::uuid[])) as cycle_id
), '{}'::jsonb)
where coalesce(a.selected_cycle_scopes, '{}'::jsonb) = '{}'::jsonb
  and cardinality(coalesce(a.selected_cycle_ids, '{}'::uuid[])) > 0;

comment on column public.sos_program_applications.selected_cycle_scopes is
  '선택 참가일별 시험 범위. JSON object: {cycle_uuid: ALGEBRA|ALGEBRA_CALC1|FULL}';
