export type AiGenerationKind="HOMEWORK"|"SECOND_TRAINING";

export async function enqueueAiGeneration(args:{supabase:any;studentId:string;sourceTrainingSessionId:string;kind:AiGenerationKind;count:3|10}){
  const {supabase,studentId,sourceTrainingSessionId,kind,count}=args;
  const existing=await supabase.from("sos_ai_generation_jobs")
    .select("id,status,generation_kind,requested_count,result_session_id,requested_at,started_at,completed_at,last_error,pipeline_version,stage,stage_index,stage_total,stage_message,stage_updated_at")
    .eq("source_training_session_id",sourceTrainingSessionId).eq("generation_kind",kind).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data){
    // 실패 작업은 학생이 다시 이어갈 때 즉시 QUEUED로 되살린다.
    if(String(existing.data.status)==="FAILED"){
      const retried=await supabase.from("sos_ai_generation_jobs")
        .update({status:"QUEUED",stage:"QUEUED",stage_index:0,stage_total:8,stage_message:"생성 작업을 다시 예약했습니다.",last_error:null,stage_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()})
        .eq("id",existing.data.id)
        .select("id,status,generation_kind,requested_count,result_session_id,requested_at,started_at,completed_at,last_error,pipeline_version,stage,stage_index,stage_total,stage_message,stage_updated_at")
        .single();
      if(retried.error||!retried.data)throw retried.error??new Error("AI 문항 생성 재예약 실패");
      return {job:retried.data,existing:true,retried:true};
    }
    return {job:existing.data,existing:true};
  }
  const created=await supabase.from("sos_ai_generation_jobs").insert({
    student_id:studentId,source_training_session_id:sourceTrainingSessionId,generation_kind:kind,requested_count:count,status:"QUEUED",pipeline_version:"V2",stage:"QUEUED",stage_index:0,stage_total:8,stage_message:"생성 대기 중"
  }).select("id,status,generation_kind,requested_count,result_session_id,requested_at,started_at,completed_at,last_error,pipeline_version,stage,stage_index,stage_total,stage_message,stage_updated_at").single();
  if(created.error||!created.data)throw created.error??new Error("AI 문항 생성 작업 예약 실패");
  return {job:created.data,existing:false};
}

export function aiJobLabel(job:any){
  const status=String(job?.status??"");
  if(status==="READY")return "READY";
  if(status==="FAILED")return "생성 재시도 대기";
  const labels:Record<string,string>={QUEUED:"생성 대기 중",SOURCE_ANALYSIS:"1/8 원문 분석",TRANSFORM_DESIGN:"2/8 변형 설계",TEXT_GENERATION:"3/8 텍스트 생성",TEXT_CREATED:"4/8 텍스트 완료",RENDERING:"5/8 문제집 조판",RENDER_VERIFIED:"6/8 조판 검수",FINAL_RESOLVE:"7/8 최종 재풀이",FINAL_VERIFIED:"8/8 최종 검증",BANK_SAVED:"8/8 문제은행 저장",READY:"READY"};
  return labels[String(job?.stage??"")]??(status==="GENERATING"?"생성·검증 중":"생성 대기 중");
}
