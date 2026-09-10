-- SOS373: run after SOS372. No answers, scores or training records are deleted.
begin;

alter table public.exams add column if not exists timer_cycle_id uuid;
alter table public.exam_registrations
  add column if not exists clock_initialized boolean not null default false,
  add column if not exists clock_open_at timestamptz,
  add column if not exists clock_close_at timestamptz,
  add column if not exists clock_paused_at timestamptz,
  add column if not exists clock_remaining_seconds integer;

-- Store clocks on each student's booking, not only on the reused source exam.
create or replace function public.sos373_booking_clock()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.timer_cycle_id is distinct from old.timer_cycle_id and exists(
    select 1 from exam_registrations r join learning_cycle_students m on m.id=r.cycle_student_id
    where r.exam_id=new.id and r.booking_status='IN_PROGRESS' and m.cycle_id is distinct from new.timer_cycle_id
  ) then raise exception '다른 일정에서 진행 중인 시험입니다. 종료 후 타이머를 생성하세요.'; end if;
  update exam_registrations r set clock_initialized=true,clock_open_at=new.open_at,
    clock_close_at=new.close_at,clock_paused_at=new.paused_at,clock_remaining_seconds=new.paused_remaining_seconds
  from learning_cycle_students m where r.cycle_student_id=m.id and r.exam_id=new.id
    and r.status='assigned' and r.booking_status not in ('COMPLETED','CANCELLED','NO_SHOW')
    and (m.cycle_id=new.timer_cycle_id or (new.timer_cycle_id is null and r.booking_status='IN_PROGRESS'));
  return new;
end $$;
drop trigger if exists sos373_booking_clock on public.exams;
create trigger sos373_booking_clock after update of open_at,close_at,paused_at,paused_remaining_seconds,timer_cycle_id
on public.exams for each row execute function public.sos373_booking_clock();
revoke all on function public.sos373_booking_clock() from public;

update exam_registrations r set clock_initialized=true,clock_open_at=e.open_at,clock_close_at=e.close_at,
  clock_paused_at=e.paused_at,clock_remaining_seconds=e.paused_remaining_seconds
from exams e where r.exam_id=e.id and r.booking_status in ('IN_PROGRESS','COMPLETED') and not r.clock_initialized;

-- Every submission path (student, automatic, admin) completes its booking
create or replace function public.sos373_protect_membership()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.booking_status in ('IN_PROGRESS','COMPLETED') and (
    new.scope_code is distinct from old.scope_code or
    new.formal_sequence is distinct from old.formal_sequence or
    new.cycle_id is distinct from old.cycle_id or
    new.application_id is distinct from old.application_id or
    new.status is distinct from old.status
  ) then raise exception '응시 중·완료 기록의 배정 정보를 변경할 수 없습니다.'; end if;
  if old.status='ACTIVE' and new.application_id is distinct from old.application_id
  then raise exception '다른 신청에 이미 등록된 참가일입니다.'; end if;
  return new;
end $$;
drop trigger if exists sos373_protect_membership on public.learning_cycle_students;
create trigger sos373_protect_membership before update on public.learning_cycle_students
for each row execute function public.sos373_protect_membership();

-- inside the SAME database transaction as the score write.
create or replace function public.sos373_complete_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' then
    update public.learning_cycle_students m
       set booking_status = 'COMPLETED', updated_at = now()
      from public.exam_registrations r
     where r.exam_id = new.exam_id and r.student_id = new.student_id
       and r.cycle_student_id = m.id;
    update public.exam_registrations
       set booking_status = 'COMPLETED'
     where exam_id = new.exam_id and student_id = new.student_id;
  end if;
  return new;
end $$;
drop trigger if exists sos373_complete_booking on public.exam_attempts;
create trigger sos373_complete_booking after insert or update of status
on public.exam_attempts for each row execute function public.sos373_complete_booking();

-- Repair only completion flags of previously submitted attempts.
update public.learning_cycle_students m set booking_status='COMPLETED',updated_at=now()
from public.exam_registrations r
where r.cycle_student_id=m.id and m.booking_status <> 'COMPLETED'
and exists(select 1 from public.exam_attempts a where a.exam_id=r.exam_id
and a.student_id=r.student_id and a.status='submitted');
update public.exam_registrations r set booking_status='COMPLETED'
where r.booking_status <> 'COMPLETED' and exists(select 1 from public.exam_attempts a
where a.exam_id=r.exam_id and a.student_id=r.student_id and a.status='submitted');

create or replace function public.sos373_change_application(p_application uuid, p_ids uuid[], p_scopes jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  a public.sos_program_applications%rowtype;
  m public.learning_cycle_students%rowtype;
  c record;
  s text;
  n integer;
begin
  select * into strict a from public.sos_program_applications where id=p_application for update;
  if a.status in ('CANCELLED','REFUNDED') then raise exception '취소된 신청입니다.'; end if;
  if cardinality(p_ids) <> coalesce(a.purchased_count,nullif(cardinality(a.selected_cycle_ids),0),5)
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
  then raise exception '결제된 횟수와 같은 수의 날짜를 선택하세요.'; end if;
  if exists(select 1 from unnest(p_ids) x where not exists(select 1 from learning_cycles where id=x))
  then raise exception '참가 일정을 확인하세요.'; end if;
  perform 1 from students where id=a.student_id for update;
  for m in select * from learning_cycle_students where application_id=a.id for update loop
    if m.booking_status in ('IN_PROGRESS','COMPLETED') or exists(
      select 1 from exam_registrations r join exam_attempts t on t.exam_id=r.exam_id and t.student_id=r.student_id
      where r.cycle_student_id=m.id and t.status in ('in_progress','submitted')) then
      if not(m.cycle_id=any(p_ids)) or coalesce(p_scopes->>m.cycle_id::text,m.scope_code)<>m.scope_code
      then raise exception '응시 중·완료한 날짜와 범위는 변경할 수 없습니다.'; end if;
    end if;
  end loop;
  if a.status='ENROLLED' then
    for c in select * from learning_cycles where id=any(p_ids) order by start_date,id loop
      s=coalesce(p_scopes->>c.id::text,a.scope_code,'FULL');
      if s not in ('ALGEBRA','ALGEBRA_CALC1','FULL') then raise exception 'A/B/C 범위를 확인하세요.'; end if;
      select * into m from learning_cycle_students where cycle_id=c.id and student_id=a.student_id;
      if found and m.application_id is distinct from a.id and m.status='ACTIVE'
      then raise exception '다른 신청에 이미 등록된 참가일입니다.'; end if;
      if m.booking_status in ('IN_PROGRESS','COMPLETED') then continue; end if;
      select coalesce(max(formal_sequence),0)+1 into n from exam_attempts
        where student_id=a.student_id and status='submitted' and not coalesce(is_practice,false)
        and coalesce(scope_code,'FULL')=s;
      if m.id is not null and (m.scope_code<>s or m.formal_sequence is distinct from n) then
        update exam_registrations set status='cancelled',booking_status='CANCELLED'
        where cycle_student_id=m.id and status='assigned';
      end if;
      insert into learning_cycle_students(cycle_id,student_id,application_id,source,status,registered_at,updated_at,
        formal_sequence,scope_code,attendance_mode,scheduled_at,booking_status,sos_gate_status,is_practice)
      values(c.id,a.student_id,a.id,'SOS_APPLICATION','ACTIVE',now(),now(),n,s,'ZOOM',c.scheduled_at,'SCHEDULED','LOCKED',false)
      on conflict(cycle_id,student_id) do update set application_id=a.id,status='ACTIVE',updated_at=now(),
        formal_sequence=n,scope_code=s,scheduled_at=c.scheduled_at,booking_status='SCHEDULED',sos_gate_status='LOCKED';
    end loop;
    update exam_registrations r set status='cancelled',booking_status='CANCELLED'
      from learning_cycle_students m where r.cycle_student_id=m.id and m.application_id=a.id
      and not(m.cycle_id=any(p_ids));
    update learning_cycle_students set status='CANCELLED',booking_status='CANCELLED',updated_at=now()
      where application_id=a.id and not(cycle_id=any(p_ids));
  end if;
  update sos_program_applications set application_mode='CYCLES',selected_cycle_ids=p_ids,
    selected_cycle_scopes=p_scopes,updated_at=now() where id=a.id;
end $$;
revoke all on function public.sos373_change_application(uuid,uuid[],jsonb) from public;
grant execute on function public.sos373_change_application(uuid,uuid[],jsonb) to service_role;
create or replace function public.sos373_enroll(p_application uuid,p_student uuid,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare a sos_program_applications%rowtype; r jsonb; n integer; s text;
begin
  select * into strict a from sos_program_applications where id=p_application for update;
  if a.status='ENROLLED' and a.student_id=p_student then return; end if;
  if a.status not in ('REQUESTED','PAID') then raise exception '등록 가능한 신청 상태가 아닙니다.'; end if;
  perform 1 from students where id=p_student for update;
  if not found then raise exception '학생을 찾을 수 없습니다.'; end if;
  if jsonb_array_length(p_rows)<>coalesce(a.purchased_count,nullif(cardinality(a.selected_cycle_ids),0),5)
  then raise exception '신청 횟수와 등록 일정이 다릅니다.'; end if;
  insert into sos_program_enrollments(application_id,batch_id,student_id,status,enrolled_at)
  values(a.id,a.batch_id,p_student,'ACTIVE',now()) on conflict(application_id)
  do update set student_id=p_student,status='ACTIVE',enrolled_at=now();
  for r in select value from jsonb_array_elements(p_rows) loop
    s=r->>'scope_code';
    if s not in ('ALGEBRA','ALGEBRA_CALC1','FULL') or s is null then raise exception '시험 범위를 확인하세요.'; end if;
    select coalesce(max(formal_sequence),0)+1 into n from exam_attempts where student_id=p_student
      and status='submitted' and not coalesce(is_practice,false) and coalesce(scope_code,'FULL')=s;
    insert into learning_cycle_students(application_id,cycle_id,student_id,source,status,registered_at,updated_at,
      formal_sequence,scope_code,attendance_mode,scheduled_at,booking_status,sos_gate_status,is_practice)
    values(a.id,(r->>'cycle_id')::uuid,p_student,'SOS_APPLICATION','ACTIVE',now(),now(),n,s,'ZOOM',
      (r->>'scheduled_at')::timestamptz,'SCHEDULED','LOCKED',false)
    on conflict(cycle_id,student_id) do update set application_id=a.id,status='ACTIVE',updated_at=now(),
      formal_sequence=n,scope_code=s,scheduled_at=excluded.scheduled_at,booking_status='SCHEDULED',sos_gate_status='LOCKED';
  end loop;
  update sos_program_applications set student_id=p_student,status='ENROLLED',paid_at=now(),enrolled_at=now(),updated_at=now()
    where id=a.id;
end $$;
revoke all on function public.sos373_enroll(uuid,uuid,jsonb) from public;
grant execute on function public.sos373_enroll(uuid,uuid,jsonb) to service_role;
revoke all on function public.sos373_complete_booking() from public;
commit;
