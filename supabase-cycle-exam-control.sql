-- One transaction and one clock origin for a whole operating cycle.
-- No source-paper timer mutation: a paper can be reused in another cycle.
begin;
create or replace function public.sos_control_cycle_exam(p_cycle_id uuid,p_action text,p_membership_ids uuid[])
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c learning_cycles%rowtype; m learning_cycle_students%rowtype; r exam_registrations%rowtype;
 e exams%rowtype; stamp timestamptz:=clock_timestamp(); affected integer:=0; remaining integer;
begin
 if p_action not in ('prepare','start','pause','resume') then raise exception '지원하지 않는 시험 제어입니다.'; end if;
 select * into c from learning_cycles where id=p_cycle_id for update;
 if not found then raise exception '회차를 찾지 못했습니다.'; end if;
 if coalesce(cardinality(p_membership_ids),0)=0 then raise exception '처리할 배정 학생이 없습니다.'; end if;
 if p_action in ('prepare','start') and exists(select 1 from learning_cycle_students where cycle_id=p_cycle_id and booking_status='IN_PROGRESS') then raise exception '이미 시작한 회차입니다. 일시정지·재개를 사용해 주세요.'; end if;
 if c.scheduled_at is null then raise exception '회차의 시작 예정 시각을 설정해 주세요.'; end if;
 for m in select * from learning_cycle_students where id=any(p_membership_ids) order by id for update loop
  if m.cycle_id<>p_cycle_id or m.status<>'ACTIVE' or m.booking_status in ('CANCELLED','NO_SHOW','COMPLETED') then raise exception '참가 상태가 변경됐습니다. 새로고침해 주세요.'; end if;
  if not exists(select 1 from students where id=m.student_id and active=true and status is distinct from '퇴원') then raise exception '응시 대상이 아닌 학생이 포함됐습니다.'; end if;
  select * into r from exam_registrations where cycle_student_id=m.id and student_id=m.student_id and status='assigned' for update;
  if not found or r.booking_status in ('CANCELLED','NO_SHOW','COMPLETED') then raise exception '시험지 배정을 먼저 완료해 주세요.'; end if;
  if r.formal_sequence is distinct from m.formal_sequence or r.scope_code is distinct from m.scope_code or not exists(select 1 from learning_cycle_exams where cycle_id=c.id and exam_id=r.exam_id and formal_sequence=r.formal_sequence and scope_code=r.scope_code) then raise exception '회차의 시험지 연결과 학생 배정이 일치하지 않습니다.'; end if;
  select * into e from exams where id=r.exam_id;
  if not found or coalesce(e.test_file_path,'')='' then raise exception '배정된 시험지 파일을 확인해 주세요.'; end if;
  if p_action='prepare' then
   update exam_registrations set clock_initialized=true,clock_open_at=c.scheduled_at,clock_close_at=null,clock_paused_at=null,clock_remaining_seconds=null where id=r.id;
  elsif p_action='start' then
   if not r.clock_initialized or r.clock_open_at is distinct from c.scheduled_at then raise exception '선택한 회차의 타이머를 먼저 생성해 주세요.'; end if;
   update exam_registrations set clock_initialized=true,clock_open_at=stamp,clock_close_at=stamp+make_interval(mins=>greatest(1,coalesce(e.time_limit,100))),clock_paused_at=null,clock_remaining_seconds=null,booking_status='IN_PROGRESS' where id=r.id;
   update learning_cycle_students set booking_status='IN_PROGRESS',updated_at=stamp where id=m.id;
  elsif p_action='pause' then
   if m.booking_status<>'IN_PROGRESS' or r.booking_status<>'IN_PROGRESS' or r.clock_paused_at is not null or r.clock_close_at is null or r.clock_close_at<=stamp then raise exception '진행 중인 회차만 일시정지할 수 있습니다.'; end if;
   remaining:=greatest(1,ceil(extract(epoch from r.clock_close_at-stamp))::integer);
   update exam_registrations set clock_paused_at=stamp,clock_remaining_seconds=remaining,clock_close_at=null where id=r.id;
  else
   if m.booking_status<>'IN_PROGRESS' or r.booking_status<>'IN_PROGRESS' or r.clock_paused_at is null or coalesce(r.clock_remaining_seconds,0)<=0 then raise exception '일시정지된 회차만 재개할 수 있습니다.'; end if;
   update exam_registrations set clock_close_at=stamp+make_interval(secs=>r.clock_remaining_seconds),clock_paused_at=null,clock_remaining_seconds=null where id=r.id;
  end if;
  update exams set student_open=true where id=e.id and student_open is distinct from true;
  affected:=affected+1;
 end loop;
 if affected<>(select count(distinct x) from unnest(p_membership_ids) x) then raise exception '배정 학생을 모두 찾지 못했습니다.'; end if;
 return jsonb_build_object('success',true,'affected',affected,'action',p_action,'at',stamp);
end $$;
revoke all on function public.sos_control_cycle_exam(uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.sos_control_cycle_exam(uuid,text,uuid[]) to service_role;
commit;
