begin;
create or replace function public.sos_assign_papers(p_cycle_id uuid,p_items jsonb,p_only_unassigned boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item jsonb; m public.learning_cycle_students%rowtype; st public.students%rowtype; cy public.learning_cycles%rowtype; paper uuid; n integer; scope text; next_n integer; results jsonb:='[]'; student_name text;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>100 or jsonb_array_length(p_items)<1 then raise exception '배정 대상은 1~100명씩 선택해 주세요.'; end if;
 for item in select value from jsonb_array_elements(p_items) order by value->>'membershipId' loop
  student_name:='';
  begin
   select * into strict m from public.learning_cycle_students where id=(item->>'membershipId')::uuid for update;
   select * into strict st from public.students where id=m.student_id for update;
   student_name:=st.name;
   if st.active is false or st.status='퇴원' or m.status<>'ACTIVE' or m.booking_status in ('COMPLETED','IN_PROGRESS','CANCELLED','NO_SHOW') then raise exception '퇴원·취소·진행 완료 학생은 배정할 수 없습니다.'; end if;
   if p_cycle_id is not null and m.cycle_id<>p_cycle_id then raise exception '선택한 일정의 학생이 아닙니다.'; end if;
   select * into strict cy from public.learning_cycles where id=m.cycle_id;
   if cy.start_date::date<(now() at time zone 'Asia/Seoul')::date then raise exception '지난 일정에는 배정할 수 없습니다.'; end if;
   n:=(item->>'formalSequence')::integer; scope:=item->>'scopeCode';
   if n is null or n<1 or scope is null or scope not in ('ALGEBRA','ALGEBRA_CALC1','FULL') then raise exception '시험 종류·순번을 확인해 주세요.'; end if;
   if p_only_unassigned and exists(select 1 from public.exam_registrations where cycle_student_id=m.id and status='assigned') then
    results:=results||jsonb_build_array(jsonb_build_object('membershipId',m.id,'name',st.name,'status','skipped','message','이미 배정됨')); continue;
   end if;
   select exam_id into paper from public.sos_exam_catalog where formal_sequence=n and scope_code=scope;
   if paper is null then raise exception '해당 종류·순번의 시험지를 먼저 등록해 주세요.'; end if;
   select coalesce(max(formal_sequence),0)+1 into next_n from public.exam_attempts where student_id=m.student_id and status='submitted' and not coalesce(is_practice,false) and coalesce(scope_code,'FULL')=scope;
   if n<>next_n then raise exception '실제 응시기록 기준 다음 시험은 %회입니다.',next_n; end if;
   if exists(select 1 from public.exam_attempts a where a.student_id=m.student_id and a.status in ('submitted','in_progress') and (a.exam_id=paper or a.exam_id in (select r.exam_id from public.exam_registrations r where r.cycle_student_id=m.id and r.status='assigned'))) then raise exception '응시기록이 있는 시험지는 재배정할 수 없습니다.'; end if;
   if exists(select 1 from public.exam_registrations where student_id=m.student_id and exam_id=paper and status='assigned' and cycle_student_id is not null and cycle_student_id<>m.id) then raise exception '다른 일정에 이미 배정된 시험지입니다.'; end if;
   insert into public.learning_cycle_exams(cycle_id,exam_id,formal_sequence,scope_code,linked_at) values(m.cycle_id,paper,n,scope,now()) on conflict(cycle_id,exam_id) do update set formal_sequence=excluded.formal_sequence,scope_code=excluded.scope_code;
   insert into public.exam_registrations(exam_id,student_id,cycle_student_id,formal_sequence,scope_code,scheduled_at,attendance_mode,booking_status,status,assigned_at) values(paper,m.student_id,m.id,n,scope,m.scheduled_at,coalesce(m.attendance_mode,'ZOOM'),'SCHEDULED','assigned',now()) on conflict(exam_id,student_id) do update set cycle_student_id=excluded.cycle_student_id,formal_sequence=excluded.formal_sequence,scope_code=excluded.scope_code,scheduled_at=excluded.scheduled_at,attendance_mode=excluded.attendance_mode,booking_status=excluded.booking_status,status=excluded.status,assigned_at=excluded.assigned_at;
   update public.learning_cycle_students set formal_sequence=n,scope_code=scope,sos_gate_status=case when sos_gate_status='OVERRIDE' then 'OVERRIDE' when n=1 then 'OPEN' else 'LOCKED' end,updated_at=now() where id=m.id;
   update public.exam_registrations set status='cancelled',booking_status='CANCELLED' where cycle_student_id=m.id and exam_id<>paper;
   update public.exams set student_open=true where id=paper;
   results:=results||jsonb_build_array(jsonb_build_object('membershipId',m.id,'name',st.name,'status','assigned','examId',paper));
  exception when others then
   results:=results||jsonb_build_array(jsonb_build_object('membershipId',item->>'membershipId','name',student_name,'status','failed','message',sqlerrm));
  end;
 end loop;
 return jsonb_build_object('results',results);
end $$;
revoke all on function public.sos_assign_papers(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.sos_assign_papers(uuid,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
