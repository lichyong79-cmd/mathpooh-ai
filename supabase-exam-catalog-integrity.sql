-- Catalog identity and atomic registration. Service-role RPC after API admin check.
begin;
create or replace function public.sos_paper_identity(p_code text) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare m text[];
begin
 m:=regexp_match(p_code,'^SOS_([ABC])_(?:실전모의고사_)?([0-9]+)$','i');
 if m is null or m[2]::integer<1 then raise exception '시험지 코드에 A/B/C 종류와 공식 순번이 필요합니다.'; end if;
 return jsonb_build_object('scope',case upper(m[1]) when 'A' then 'ALGEBRA' when 'B' then 'ALGEBRA_CALC1' else 'FULL' end,'sequence',m[2]::integer);
end $$;
create or replace function public.sos_guard_catalog_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare e public.exams%rowtype; identity jsonb;
begin
 if TG_OP='UPDATE' and (new.exam_id,new.scope_code,new.formal_sequence) is distinct from (old.exam_id,old.scope_code,old.formal_sequence) then
  raise exception '등록된 시험지 연결은 덮어쓸 수 없습니다.';
 end if;
 select * into strict e from public.exams where id=new.exam_id for update;
 identity:=public.sos_paper_identity(e.exam_code);
 if new.scope_code<>identity->>'scope' or new.formal_sequence<>(identity->>'sequence')::integer or e.round<>new.formal_sequence then
  raise exception '시험지 종류·순번과 연결 위치가 일치하지 않습니다.';
 end if;
 return new;
end $$;
drop trigger if exists sos_guard_catalog_identity on public.sos_exam_catalog;
create trigger sos_guard_catalog_identity before insert or update on public.sos_exam_catalog for each row execute function public.sos_guard_catalog_identity();
create or replace function public.sos_guard_linked_paper_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if (new.exam_code,new.round) is distinct from (old.exam_code,old.round) and exists(select 1 from public.sos_exam_catalog where exam_id=old.id) then
  raise exception '연결된 시험지의 종류·순번은 변경할 수 없습니다.';
 end if;
 return new;
end $$;
drop trigger if exists sos_guard_linked_paper_identity on public.exams;
create trigger sos_guard_linked_paper_identity before update of exam_code,round on public.exams for each row execute function public.sos_guard_linked_paper_identity();
create or replace function public.sos_register_paper(p_exam_id uuid,p_sequence integer,p_scope text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare e public.exams%rowtype; identity jsonb; linked uuid; count_regions integer;
begin
 select * into strict e from public.exams where id=p_exam_id for update;
 identity:=public.sos_paper_identity(e.exam_code);
 if p_scope is distinct from identity->>'scope' or p_sequence is distinct from (identity->>'sequence')::integer or e.round is distinct from p_sequence then raise exception '시험지 종류·순번과 연결 위치가 일치하지 않습니다.'; end if;
 if not coalesce(e.answer_verified,false) or not coalesce(e.cover_verified,false) or not coalesce(e.region_verified,false) or coalesce(e.test_file_path,'')='' then raise exception '파일·정답·표지·문항영역 검수를 완료해 주세요.'; end if;
 if jsonb_typeof(e.answer_keys) is distinct from 'array' or jsonb_typeof(e.question_points) is distinct from 'array' then raise exception '정답·배점을 확인해 주세요.'; end if;
 if jsonb_array_length(e.answer_keys)<>e.question_count or exists(select 1 from jsonb_array_elements_text(e.answer_keys) v where coalesce(trim(v),'')='') or jsonb_array_length(e.question_points)<>e.question_count or (select sum(v::numeric) from jsonb_array_elements_text(e.question_points) v) is distinct from e.total_score::numeric then raise exception '정답·배점을 확인해 주세요.'; end if;
 select count(*) into count_regions from public.question_regions where exam_id=e.id and verified and width>0 and height>0 and question_no between 1 and e.question_count;
 if count_regions<>e.question_count then raise exception '모든 문항영역을 검수하고 저장해 주세요.'; end if;
 insert into public.sos_exam_catalog(exam_id,scope_code,formal_sequence) values(e.id,p_scope,p_sequence) on conflict(formal_sequence,scope_code) do nothing;
 select exam_id into linked from public.sos_exam_catalog where formal_sequence=p_sequence and scope_code=p_scope;
 if linked is distinct from e.id then raise exception '해당 종류·순번에는 다른 시험지가 이미 연결되어 있습니다.'; end if;
 update public.exams set status='등록완료' where id=e.id;
 return jsonb_build_object('examId',e.id,'formalSequence',p_sequence,'scopeCode',p_scope,'status','등록완료');
end $$;
revoke all on function public.sos_register_paper(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.sos_register_paper(uuid,integer,text) to service_role;
revoke all on function public.sos_guard_catalog_identity() from public,anon,authenticated;
revoke all on function public.sos_guard_linked_paper_identity() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
