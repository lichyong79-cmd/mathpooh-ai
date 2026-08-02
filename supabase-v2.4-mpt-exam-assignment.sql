-- SOS v2.4 · MPT 방식 시험 신청 → 관리자 배정
alter table public.exam_registrations
  add column if not exists status text not null default 'assigned';

alter table public.exam_registrations
  add column if not exists requested_at timestamptz not null default now();

alter table public.exam_registrations
  add column if not exists assigned_at timestamptz;

-- 기존 등록 데이터는 이미 배정된 데이터로 유지합니다.
update public.exam_registrations
set status = 'assigned',
    assigned_at = coalesce(assigned_at, registered_at)
where status is null or status not in ('requested', 'assigned');

notify pgrst, 'reload schema';
