import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSimilarTraining } from "@/lib/sos-ai-training";

export const maxDuration=300;

async function run(request:Request){
  const expected=String(process.env.CRON_SECRET??"").trim();
  if(expected){
    const auth=request.headers.get("authorization")??"";
    if(auth!==`Bearer ${expected}`)return NextResponse.json({success:false,message:"cron unauthorized"},{status:401});
  }
  const supabase=createClient();
  // 실패 작업은 3회까지 다시 큐로 본다. 오래 걸리는 AI는 한 cron에서 1건만 처리한다.
  const pick=await supabase.from("sos_ai_generation_jobs")
    .select("id,student_id,source_training_session_id,generation_kind,requested_count,status,attempt_count")
    .in("status",["QUEUED","FAILED"]).lt("attempt_count",3).order("requested_at",{ascending:true}).limit(1).maybeSingle();
  if(pick.error)throw pick.error;
  const job:any=pick.data;
  if(!job)return NextResponse.json({success:true,processed:0});

  const claimed=await supabase.from("sos_ai_generation_jobs").update({status:"GENERATING",started_at:new Date().toISOString(),updated_at:new Date().toISOString(),attempt_count:Number(job.attempt_count??0)+1,last_error:null}).eq("id",job.id).in("status",["QUEUED","FAILED"]).select("id").maybeSingle();
  if(claimed.error)throw claimed.error;
  if(!claimed.data)return NextResponse.json({success:true,processed:0,raced:true});

  try{
    const result:any=await generateSimilarTraining({
      supabase,studentId:String(job.student_id),firstTrainingSessionId:String(job.source_training_session_id),
      count:Number(job.requested_count)===3?3:10,kind:String(job.generation_kind)==="HOMEWORK"?"HOMEWORK":"SECOND_TRAINING"
    });
    const resultSessionId=String(result?.session?.id??"")||null;
    const done=await supabase.from("sos_ai_generation_jobs").update({status:"READY",result_session_id:resultSessionId,completed_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:null}).eq("id",job.id);
    if(done.error)throw done.error;
    return NextResponse.json({success:true,processed:1,jobId:job.id,status:"READY",resultSessionId});
  }catch(error){
    const message=error instanceof Error?error.message:"AI 생성 실패";
    await supabase.from("sos_ai_generation_jobs").update({status:"FAILED",last_error:message.slice(0,1000),updated_at:new Date().toISOString()}).eq("id",job.id);
    return NextResponse.json({success:false,processed:1,jobId:job.id,status:"FAILED",message},{status:500});
  }
}
export async function GET(request:Request){try{return await run(request);}catch(error){return NextResponse.json({success:false,message:error instanceof Error?error.message:"worker error"},{status:500});}}
export async function POST(request:Request){return GET(request);}
