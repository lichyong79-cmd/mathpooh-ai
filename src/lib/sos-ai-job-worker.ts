import { createClient } from "@/lib/supabase/server";
import { generateSimilarTraining } from "@/lib/sos-ai-training";

export async function processJob(jobId:string,job:any){
  const supabase=createClient();
  try{
    const result:any=await generateSimilarTraining({
      supabase,
      studentId:String(job.student_id),
      firstTrainingSessionId:String(job.source_training_session_id),
      count:Number(job.requested_count)===3?3:10,
      kind:String(job.generation_kind)==="HOMEWORK"?"HOMEWORK":"SECOND_TRAINING",
      jobId
    });
    const resultSessionId=String(result?.session?.id??"")||null;
    const done=await supabase.from("sos_ai_generation_jobs").update({
      status:"READY",stage:"READY",stage_index:8,stage_total:8,
      stage_message:"학생 학습 배정까지 완료되었습니다.",
      result_session_id:resultSessionId,
      completed_at:new Date().toISOString(),
      stage_updated_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
      last_error:null
    }).eq("id",jobId);
    if(done.error)throw done.error;
    return {status:"READY",resultSessionId,message:""};
  }catch(error){
    const message=error instanceof Error?error.message:"AI 생성 실패";

    // SOS292: 묶음 하나를 끝내고 시간이 남지 않아 스스로 멈춘 경우다.
    // 실패가 아니라 "여기까지 저장하고 다음 실행에 이어감"이므로
    // 시도 횟수를 올리지 않고 그대로 대기열로 돌려보낸다.
    if(message.startsWith("PARTIAL_BATCH_DONE:")){
      const progress=message.split(":")[1]??"";
      const requeuedAt=new Date().toISOString();
      await supabase.from("sos_ai_generation_jobs").update({
        status:"QUEUED",attempt_count:0,started_at:null,
        stage_message:`${progress}문항 완료 · 다음 실행에서 이어갑니다.`,last_error:null,
        // 완료한 묶음은 대기열 뒤로 보낸다. 7명이 한꺼번에 몰려도 앞의
        // 4명만 계속 선점하지 않고 나머지 학생도 다음 실행에서 생성이 시작된다.
        requested_at:requeuedAt,stage_updated_at:requeuedAt,updated_at:requeuedAt,
      }).eq("id",jobId);
      return {status:"PARTIAL",resultSessionId:null,message:progress};
    }

    await supabase.from("sos_ai_generation_jobs").update({
      status:"FAILED",stage:"FAILED",
      stage_message:message.slice(0,300),
      last_error:message.slice(0,1000),
      stage_updated_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    }).eq("id",jobId);
    return {status:"FAILED",resultSessionId:null,message};
  }
}

export async function resumeGenerationJob(supabase:any, jobId:string){
  const row=await supabase.from("sos_ai_generation_jobs").select("id,student_id,source_training_session_id,generation_kind,requested_count,status,attempt_count,started_at").eq("id",jobId).single();
  if(row.error)throw row.error;
  const job=row.data;
  if(!["QUEUED","FAILED"].includes(job.status))return {started:false};
  const now=new Date().toISOString();
  const claimed=await supabase.from("sos_ai_generation_jobs").update({status:"GENERATING",started_at:now,updated_at:now,attempt_count:Number(job.attempt_count??0)+1,last_error:null}).eq("id",jobId).eq("status",job.status).select("id").maybeSingle();
  if(claimed.error)throw claimed.error;
  if(!claimed.data)return {started:false};
  return {started:true,job};
}
