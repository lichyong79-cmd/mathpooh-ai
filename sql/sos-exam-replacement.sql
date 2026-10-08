-- SOS exam replacement workflow.
-- Keeps historical attempts on the source exam ID and switches the default catalog only after
-- the replacement has completed the same validation required for a normal registered paper.

create or replace function public.sos_create_replacement_paper(
  p_source_exam_id uuid,
  p_from_question integer,
  p_to_question integer,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  src public.exams%rowtype;
  identity jsonb;
  scope text;
  seq integer;
  clean_subject text;
  next_answers jsonb;
  replacement_id uuid;
begin
  if p_admin_id is null then raise exception '관리자 정보를 확인해 주세요.'; end if;

  select * into strict src
  from public.exams
  where id=p_source_exam_id
  for update;

  identity := public.sos_paper_identity(src.exam_code);
  scope := identity->>'scope';
  seq := (identity->>'sequence')::integer;
  if scope not in ('ALGEBRA','ALGEBRA_CALC1','FULL') or seq is null or seq < 1
  then raise exception 'A/B/C 정식 SOS 시험지만 교체본을 만들 수 있습니다.'; end if;

  if p_from_question < 1 or p_to_question < p_from_question or p_to_question > src.question_count
  then raise exception '교체 문항 범위를 확인해 주세요.'; end if;

  if jsonb_typeof(src.answer_keys) is distinct from 'array'
     or jsonb_array_length(src.answer_keys) <> src.question_count
  then raise exception '원본 시험의 정답 배열을 먼저 확인해 주세요.'; end if;

  select jsonb_agg(
    case when ord between p_from_question and p_to_question then to_jsonb(''::text) else to_jsonb(value) end
    order by ord
  )
  into next_answers
  from jsonb_array_elements_text(src.answer_keys) with ordinality a(value,ord);

  clean_subject := case scope
    when 'ALGEBRA' then '대수'
    when 'ALGEBRA_CALC1' then '대수+미적1'
    else '대수+미적1+확통'
  end;

  insert into public.exams(
    title,exam_date,status,round,exam_code,grade,subject,exam_range,
    question_count,time_limit,total_score,objective_count,short_answer_count,
    test_file_name,solution_file_name,test_file_path,solution_file_path,
    memo,original_file_name,original_file_path,answer_keys,
    answer_verified,cover_verified,region_verified,student_open,
    open_at,close_at,solution_open,paused_at,pause_remaining_seconds,
    exam_status,paused_remaining_seconds,question_points,timer_cycle_id
  )
  values(
    src.title,src.exam_date,'작성중',seq,src.exam_code,src.grade,clean_subject,clean_subject,
    src.question_count,src.time_limit,src.total_score,src.objective_count,src.short_answer_count,
    '','','','',
    format('SOS_REPLACEMENT|SOURCE=%s|RANGE=%s-%s|CREATED_BY=%s',src.id,p_from_question,p_to_question,p_admin_id),
    '','',next_answers,
    false,false,false,false,
    null,null,false,null,null,
    'ready',null,src.question_points,null
  )
  returning id into replacement_id;

  return jsonb_build_object(
    'success',true,
    'sourceExamId',src.id,
    'replacementExamId',replacement_id,
    'examCode',src.exam_code,
    'formalSequence',seq,
    'scopeCode',scope,
    'fromQuestion',p_from_question,
    'toQuestion',p_to_question
  );
end
$fn$;

revoke all on function public.sos_create_replacement_paper(uuid,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.sos_create_replacement_paper(uuid,integer,integer,uuid) to service_role;

create or replace function public.sos_activate_replacement_paper(
  p_replacement_exam_id uuid,
  p_source_exam_id uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  src public.exams%rowtype;
  rep public.exams%rowtype;
  identity_src jsonb;
  identity_rep jsonb;
  scope text;
  seq integer;
  count_regions integer;
  active_count integer;
  catalog_id uuid;
  linked_exam uuid;
begin
  if p_admin_id is null then raise exception '관리자 정보를 확인해 주세요.'; end if;

  select * into strict src from public.exams where id=p_source_exam_id for update;
  select * into strict rep from public.exams where id=p_replacement_exam_id for update;

  identity_src := public.sos_paper_identity(src.exam_code);
  identity_rep := public.sos_paper_identity(rep.exam_code);
  scope := identity_src->>'scope';
  seq := (identity_src->>'sequence')::integer;

  if identity_rep->>'scope' is distinct from scope
     or (identity_rep->>'sequence')::integer is distinct from seq
     or rep.round is distinct from seq
  then raise exception '교체본의 시험지 종류·순번이 원본과 일치하지 않습니다.'; end if;

  if position('SOS_REPLACEMENT|SOURCE='||src.id::text||'|' in coalesce(rep.memo,'')) <> 1
  then raise exception '이 시험지는 선택한 원본에서 만든 교체본이 아닙니다.'; end if;

  if not coalesce(rep.answer_verified,false)
     or not coalesce(rep.cover_verified,false)
     or not coalesce(rep.region_verified,false)
     or coalesce(rep.test_file_path,'')=''
  then raise exception '교체본의 파일·정답·표지·문항영역 검수를 완료해 주세요.'; end if;

  if jsonb_typeof(rep.answer_keys) is distinct from 'array'
     or jsonb_typeof(rep.question_points) is distinct from 'array'
     or jsonb_array_length(rep.answer_keys)<>rep.question_count
     or exists(select 1 from jsonb_array_elements_text(rep.answer_keys) v where coalesce(trim(v),'')='')
     or jsonb_array_length(rep.question_points)<>rep.question_count
     or (select sum(v::numeric) from jsonb_array_elements_text(rep.question_points) v) is distinct from rep.total_score::numeric
  then raise exception '교체본의 정답·배점을 확인해 주세요.'; end if;

  select count(*) into count_regions
  from public.question_regions
  where exam_id=rep.id and verified and width>0 and height>0
    and question_no between 1 and rep.question_count;
  if count_regions<>rep.question_count then
    raise exception '교체본의 모든 문항영역을 검수하고 저장해 주세요.';
  end if;

  select count(*) into active_count
  from public.exam_registrations r
  where r.exam_id=src.id
    and r.status='assigned'
    and coalesce(r.booking_status,'SCHEDULED') not in ('COMPLETED','CANCELLED','NO_SHOW');
  if active_count>0 then
    raise exception '기존 시험지에 아직 미응시·진행 중 학생 %명이 있습니다. 학생별 시험지 직접 변경 후 교체본을 활성화해 주세요.',active_count;
  end if;

  select c.id,c.exam_id into catalog_id,linked_exam
  from public.sos_exam_catalog c
  where c.formal_sequence=seq and c.scope_code=scope
  for update;

  if catalog_id is null then
    insert into public.sos_exam_catalog(exam_id,scope_code,formal_sequence)
    values(rep.id,scope,seq);
  elsif linked_exam=src.id then
    update public.sos_exam_catalog set exam_id=rep.id,updated_at=now() where id=catalog_id;
  elsif linked_exam is distinct from rep.id then
    raise exception '현재 %형 %회차에는 다른 시험지가 연결되어 있습니다. 목록을 새로고침해 주세요.',
      case scope when 'ALGEBRA' then 'A' when 'ALGEBRA_CALC1' then 'B' else 'C' end,seq;
  end if;

  update public.exams
  set status='등록완료',updated_at=now()
  where id=rep.id;

  update public.exams
  set student_open=false,
      memo=concat_ws(E'\n',nullif(memo,''),format('SOS_REPLACED_BY=%s|AT=%s',rep.id,now())),
      updated_at=now()
  where id=src.id;

  return jsonb_build_object(
    'success',true,
    'sourceExamId',src.id,
    'replacementExamId',rep.id,
    'examCode',rep.exam_code,
    'formalSequence',seq,
    'scopeCode',scope,
    'status','등록완료'
  );
end
$fn$;

revoke all on function public.sos_activate_replacement_paper(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.sos_activate_replacement_paper(uuid,uuid,uuid) to service_role;

notify pgrst,'reload schema';
