-- Applied through Supabase migration sos_admin_paper_override, 2026-10-07.
-- This migration changes definitions only; it never retargets existing live students.
begin;
set local lock_timeout='3s';
create or replace function public.sos_admin_override_paper(p_membership_id uuid,p_exam_id uuid,p_expected_exam_id uuid,p_admin_id uuid,p_reason text default '관리자 직접 지정')
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare m public.learning_cycle_students%rowtype; r public.exam_registrations%rowtype; cy public.learning_cycles%rowtype; cat public.sos_exam_catalog%rowtype; paper public.exams%rowtype; n integer; old_code text; active_count integer;
begin
 if p_admin_id is null then raise exception '관리자 정보를 확인해 주세요.'; end if;
 select c.* into strict cy from public.learning_cycles c where c.id=(select x.cycle_id from public.learning_cycle_students x where x.id=p_membership_id) for update;
 select x.* into strict m from public.learning_cycle_students x where x.id=p_membership_id for update;
 perform 1 from public.students s where s.id=m.student_id and s.active=true and s.status is distinct from '퇴원' for update;
 if not found then raise exception '응시 가능한 학생이 아닙니다.'; end if;
 if m.status<>'ACTIVE' or m.booking_status in ('COMPLETED','CANCELLED','NO_SHOW') then raise exception '완료·취소된 일정은 변경할 수 없습니다.'; end if;
 if cy.start_date::date<(now() at time zone 'Asia/Seoul')::date and m.booking_status<>'IN_PROGRESS' then raise exception '지난 일정은 변경할 수 없습니다.'; end if;
 select count(*) into active_count from public.exam_registrations x where x.cycle_student_id=m.id and x.student_id=m.student_id and x.status='assigned';
 if active_count<>1 then raise exception '기본 시험지 배정을 먼저 완료해 주세요. 중복 배정이 있으면 정리가 필요합니다.'; end if;
 select x.* into strict r from public.exam_registrations x where x.cycle_student_id=m.id and x.student_id=m.student_id and x.status='assigned' for update;
 if r.exam_id is distinct from p_expected_exam_id then raise exception '다른 창에서 배정이 변경되었습니다. 새로고침 후 다시 선택해 주세요.'; end if;
 if r.booking_status in ('COMPLETED','CANCELLED','NO_SHOW') then raise exception '변경할 수 없는 배정 상태입니다.'; end if;
 if r.exam_id=p_exam_id then return jsonb_build_object('success',true,'unchanged',true,'examId',p_exam_id); end if;
 if exists(select 1 from public.exam_attempts a where a.student_id=m.student_id and a.exam_id in(r.exam_id,p_exam_id)) then raise exception '이미 응시를 시작했거나 응시기록이 있는 시험지입니다. 답안 보호를 위해 직접 변경할 수 없습니다.'; end if;
 select x.* into strict cat from public.sos_exam_catalog x where x.exam_id=p_exam_id;
 select e.* into strict paper from public.exams e where e.id=p_exam_id;
 if coalesce(paper.test_file_path,'')='' or coalesce(paper.question_count,0)<1 then raise exception '시험지 파일·문항수가 확인된 시험지를 선택해 주세요.'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='exam-files' and o.name=paper.test_file_path) then raise exception '시험지 파일을 저장소에서 찾지 못했습니다.'; end if;
 if exists(select 1 from public.exam_registrations x where x.student_id=m.student_id and x.exam_id=p_exam_id and x.id<>r.id) then raise exception '다른 일정에 연결된 시험지입니다. 기존 배정을 먼저 확인해 주세요.'; end if;
 if m.booking_status='IN_PROGRESS' and cat.scope_code<>m.scope_code then raise exception '타이머 진행 중에는 같은 A/B/C 유형 안에서만 시험지를 교체할 수 있습니다.'; end if;
 if r.clock_close_at is not null and r.clock_close_at<=clock_timestamp() and r.clock_paused_at is null then raise exception '시험 시간이 종료되었습니다.'; end if;
 n:=coalesce(m.formal_sequence,r.formal_sequence);
 if cat.scope_code<>m.scope_code or coalesce(n,0)<1 then select coalesce(max(a.formal_sequence),0)+1 into n from public.exam_attempts a where a.student_id=m.student_id and a.status='submitted' and not coalesce(a.is_practice,false) and coalesce(a.scope_code,'FULL')=cat.scope_code; end if;
 if exists(select 1 from public.learning_cycle_exams x where x.cycle_id=m.cycle_id and x.formal_sequence=cat.formal_sequence and x.scope_code=cat.scope_code and x.exam_id<>p_exam_id) then raise exception '회차의 시험지 목록 연결을 확인해 주세요.'; end if;
 insert into public.learning_cycle_exams(cycle_id,exam_id,formal_sequence,scope_code,linked_at) values(m.cycle_id,p_exam_id,cat.formal_sequence,cat.scope_code,now()) on conflict(cycle_id,exam_id) do nothing;
 if not exists(select 1 from public.learning_cycle_exams x where x.cycle_id=m.cycle_id and x.exam_id=p_exam_id and x.scope_code=cat.scope_code) then raise exception '시험지 유형 연결이 일치하지 않습니다.'; end if;
 select e.exam_code into old_code from public.exams e where e.id=r.exam_id;
 -- Do not update clock_*, booking_status, consent or any other student's booking.
 update public.exam_registrations x set exam_id=p_exam_id,formal_sequence=n,scope_code=cat.scope_code,assigned_at=now() where x.id=r.id;
 if m.formal_sequence is distinct from n or m.scope_code is distinct from cat.scope_code then update public.learning_cycle_students x set formal_sequence=n,scope_code=cat.scope_code,updated_at=now() where x.id=m.id; end if;
 if cat.scope_code is distinct from m.scope_code and m.application_id is not null then update public.sos_program_applications a set selected_cycle_scopes=jsonb_set(coalesce(a.selected_cycle_scopes,'{}'::jsonb),array[m.cycle_id::text],to_jsonb(cat.scope_code),true),updated_at=now() where a.id=m.application_id and a.student_id=m.student_id and a.status in('REQUESTED','PAID','ENROLLED'); end if;
 update public.exams set student_open=true where id=p_exam_id and student_open is distinct from true;
 insert into public.exam_activity_logs(exam_id,student_id,event_type,detail,occurred_at) values(p_exam_id,m.student_id,'admin_paper_override',jsonb_build_object('adminId',p_admin_id,'cycleId',m.cycle_id,'registrationId',r.id,'previousExamId',r.exam_id,'previousCode',old_code,'newCode',paper.exam_code,'attendanceSequence',n,'paperSequence',cat.formal_sequence,'reason',left(coalesce(p_reason,''),200),'clockPreserved',true)::text,now());
 return jsonb_build_object('success',true,'examId',p_exam_id,'examCode',paper.exam_code,'attendanceSequence',n,'paperSequence',cat.formal_sequence,'timerPreserved',true,'clockCloseAt',r.clock_close_at);
end $fn$;
revoke all on function public.sos_admin_override_paper(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.sos_admin_override_paper(uuid,uuid,uuid,uuid,text) to service_role;

create or replace function public.sos_guard_assigned_attempt() returns trigger language plpgsql security invoker set search_path='' as $guard$
declare booking public.exam_registrations%rowtype;
begin
 if new.formal_sequence is null or coalesce(new.is_practice,false) then return new; end if;
 select r.* into booking from public.exam_registrations r where r.student_id=new.student_id and r.exam_id=new.exam_id and r.status='assigned' for update;
 if not found or booking.formal_sequence is distinct from new.formal_sequence or booking.scope_code is distinct from new.scope_code then raise exception '시험지 배정이 변경되었습니다. 새로고침 후 현재 배정된 시험지를 시작해 주세요.'; end if;
 return new;
end $guard$;
revoke all on function public.sos_guard_assigned_attempt() from public,anon,authenticated;
do $trigger$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.exam_attempts'::regclass and tgname='sos_guard_assigned_attempt') then
  create trigger sos_guard_assigned_attempt before insert on public.exam_attempts for each row execute function public.sos_guard_assigned_attempt();
 end if;
end $trigger$;

do $patch$
declare definition text; old_fragment text; new_fragment text;
begin
 definition:=pg_get_functiondef('public.sos_control_cycle_exam(uuid,text,uuid[])'::regprocedure);
 old_fragment:='           and formal_sequence = r.formal_sequence';
 if strpos(definition,old_fragment)>0 then execute replace(definition,old_fragment,'           -- Individual attendance sequence is verified against m above; this link is by actual paper.');
 elsif strpos(definition,'Individual attendance sequence is verified against m above')=0 then raise exception '타이머 함수가 변경되었습니다. 수동 검토가 필요합니다.'; end if;
 definition:=pg_get_functiondef('public.sos_assign_papers(uuid,jsonb,boolean)'::regprocedure);
 old_fragment:='select exam_id into paper from public.sos_exam_catalog where formal_sequence=n and scope_code=scope;';
 new_fragment:='select sc.exam_id into paper from public.sos_exam_catalog sc where sc.formal_sequence>=n and sc.scope_code=scope and not exists(select 1 from public.exam_attempts used where used.student_id=m.student_id and used.exam_id=sc.exam_id and used.status in (''in_progress'',''submitted'')) order by sc.formal_sequence limit 1;';
 if strpos(definition,old_fragment)>0 then definition:=replace(definition,old_fragment,new_fragment);
 elsif strpos(definition,new_fragment)=0 then raise exception '기본 선정 함수가 변경되었습니다. 수동 검토가 필요합니다.'; end if;
 old_fragment:='values(m.cycle_id,paper,n,scope,now())';
 new_fragment:='values(m.cycle_id,paper,(select sc.formal_sequence from public.sos_exam_catalog sc where sc.exam_id=paper),scope,now())';
 if strpos(definition,old_fragment)>0 then definition:=replace(definition,old_fragment,new_fragment);
 elsif strpos(definition,new_fragment)=0 then raise exception '기본 연결 함수가 변경되었습니다. 수동 검토가 필요합니다.'; end if;
 execute definition;
end $patch$;
notify pgrst,'reload schema';
commit;
