export type AiGenerationKind="HOMEWORK"|"SECOND_TRAINING";

export async function enqueueAiGeneration(args:{supabase:any;studentId:string;sourceTrainingSessionId:string;kind:AiGenerationKind;count:3|10}){
  const {supabase,studentId,sourceTrainingSessionId,kind,count}=args;
  const existing=await supabase.from("sos_ai_generation_jobs")
    .select("id,status,generation_kind,requested_count,result_session_id,requested_at,started_at,completed_at,last_error")
    .eq("source_training_session_id",sourceTrainingSessionId).eq("generation_kind",kind).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data)return {job:existing.data,existing:true};
  const created=await supabase.from("sos_ai_generation_jobs").insert({
    student_id:studentId,source_training_session_id:sourceTrainingSessionId,generation_kind:kind,requested_count:count,status:"QUEUED"
  }).select("id,status,generation_kind,requested_count,result_session_id,requested_at,started_at,completed_at,last_error").single();
  if(created.error||!created.data)throw created.error??new Error("AI 문항 생성 작업 예약 실패");
  return {job:created.data,existing:false};
}

export function aiJobLabel(job:any){
  const status=String(job?.status??"");
  if(status==="READY")return "READY";
  if(status==="GENERATING")return "생성·검증 중";
  if(status==="FAILED")return "생성 재시도 대기";
  return "생성 대기 중";
}
