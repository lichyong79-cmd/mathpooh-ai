import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { enqueueAiGeneration } from "@/lib/sos-ai-generation-queue";
import { processJob, resumeGenerationJob } from "@/lib/sos-ai-job-worker";

// SOS282: 허용목록으로 통일한다.
async function auth(){return getAdminUser();}

export const maxDuration=300;
export async function GET(){
  if(!await auth())return NextResponse.json({message:"관리자 로그인이 필요합니다."},{status:401});
  const supabase=createClient();
  const [questions,jobs]=await Promise.all([
    supabase.from("sos_ai_generated_questions").select("id,generation_kind,subject,major_unit,subunit,subunit_key,topic,core_type,difficulty,difficulty_meter,question_text,display_latex,answer,solution,generation_reason,verification,status,use_count,source_problem_id,source_training_session_id,source_training_order,created_at,updated_at").order("created_at",{ascending:false}).limit(1000),
    supabase.from("sos_ai_generation_jobs").select("id,student_id,source_training_session_id,generation_kind,requested_count,status,attempt_count,last_error,result_session_id,requested_at,started_at,completed_at,updated_at,pipeline_version,stage,stage_index,stage_total,stage_message,stage_updated_at,draft_payload,rendered_payload,verification_payload,batch_payload").order("requested_at",{ascending:false}).limit(200)
  ]);
  if(questions.error)return NextResponse.json({message:questions.error.message},{status:400});
  if(jobs.error)return NextResponse.json({message:jobs.error.message},{status:400});
  return NextResponse.json({success:true,questions:questions.data??[],jobs:jobs.data??[]},{headers:{"Cache-Control":"no-store,max-age=0"}});
}
export async function PATCH(request:Request){
  if(!await auth())return NextResponse.json({message:"관리자 로그인이 필요합니다."},{status:401});
  const body=await request.json();const id=String(body.id??"");const status=String(body.status??"");
  if(!id||!["READY","DISABLED"].includes(status))return NextResponse.json({message:"요청값을 확인해 주세요."},{status:400});
  const supabase=createClient();
  const current=await supabase.from("sos_ai_generated_questions").select("verification").eq("id",id).single();
  if(current.error)return NextResponse.json({message:current.error.message},{status:400});
  if(current.data?.verification?.errorReview?.open)return NextResponse.json({message:"오류문항 보관함에서 검수 후 복원해 주세요."},{status:409});
  const result=await supabase.from("sos_ai_generated_questions").update({status,updated_at:new Date().toISOString()}).eq("id",id);
  if(result.error)return NextResponse.json({message:result.error.message},{status:400});return NextResponse.json({success:true});
}

/**
 * SOS282 · 관리자 수동 생성 (안전판)
 *
 * 지금 AI 문항 생성 경로는 외부 스케줄러(cron-job.org) 하나뿐이다.
 * 그 무료 서비스가 멎거나 계정에 문제가 생기면 학생 학습이 멈추고 되살릴 수단이 없다.
 * 관리자가 직접 한 건씩 돌릴 수 있게 해 둔다.
 *
 *  { action: "run_next" }        대기/실패 작업 중 하나를 지금 처리
 *  { action: "requeue", id }     실패한 작업을 다시 대기로
 */
export async function POST(request:Request){
  if(!await auth())return NextResponse.json({message:"관리자 로그인이 필요합니다."},{status:401});
  const body=await request.json().catch(()=>({} as any));
  const action=String(body?.action??"run_next");
  const supabase=createClient();

  // SOS291: attempt_count가 3에 도달하면 cron도 수동 실행도 그 작업을 영영 선택하지 않는다.
  // GENERATING으로 죽어 있는 작업은 화면에서 손댈 방법이 없어 SQL을 직접 써야 했다.
  if(action==="revive_stuck"){
    const cutoff=new Date(Date.now()-7*60000).toISOString();
    const candidates=await supabase.from("sos_ai_generation_jobs").select("id,student_id,source_training_session_id,generation_kind,requested_count")
      .or(`status.eq.FAILED,and(status.eq.QUEUED,attempt_count.gte.8),and(status.eq.GENERATING,started_at.lt.${cutoff})`).limit(200);
    if(candidates.error)return NextResponse.json({message:candidates.error.message},{status:400});
    let revived=0;
    for(const row of candidates.data??[]){
      const result=await enqueueAiGeneration({supabase,studentId:row.student_id,sourceTrainingSessionId:row.source_training_session_id,kind:row.generation_kind,count:row.requested_count===3?3:10});
      if(result.retried)revived++;
    }
    return NextResponse.json({success:true,revived});
  }

  if(action==="requeue"){
    const id=String(body?.id??"");
    if(!id)return NextResponse.json({message:"작업을 확인해 주세요."},{status:400});
    const r=await supabase.from("sos_ai_generation_jobs").select("id,student_id,source_training_session_id,generation_kind,requested_count").eq("id",id).maybeSingle();
    if(r.error)return NextResponse.json({message:r.error.message},{status:400});
    if(!r.data)return NextResponse.json({message:"해당 작업을 찾지 못했습니다."},{status:404});
    try{
      await enqueueAiGeneration({supabase,studentId:r.data.student_id,sourceTrainingSessionId:r.data.source_training_session_id,kind:r.data.generation_kind,count:r.data.requested_count===3?3:10});
      const claim=await resumeGenerationJob(supabase,id);
      if(claim.started)after(async()=>{await processJob(id,claim.job);});
      return NextResponse.json({success:true,requeued:1,started:claim.started});
    }catch(error){
      return NextResponse.json({message:error instanceof Error?error.message:"생성 시작 실패"},{status:400});
    }
  }

  if(action!=="run_next")return NextResponse.json({message:"지원하지 않는 작업입니다."},{status:400});

  // run_next: 워커와 같은 규칙으로 한 건을 선점해 끝까지 처리한다.
  const cols="id,student_id,source_training_session_id,generation_kind,requested_count,status,attempt_count";
  const picked=await supabase.from("sos_ai_generation_jobs").select(cols)
    .in("status",["QUEUED","FAILED"]).lt("attempt_count",8)   // SOS295: 재시도 한도를 워커와 맞춘다
    .order("requested_at",{ascending:true}).limit(1).maybeSingle();
  if(picked.error)return NextResponse.json({message:picked.error.message},{status:400});
  const job:any=picked.data;
  if(!job)return NextResponse.json({success:true,processed:0,message:"대기 중인 생성 작업이 없습니다."});

  const claim=await resumeGenerationJob(supabase,String(job.id));
  if(!claim.started)return NextResponse.json({success:true,processed:0,message:"다른 실행이 먼저 처리 중입니다."});
  after(async()=>{await processJob(String(job.id),claim.job);});
  return NextResponse.json({success:true,processed:1,jobId:job.id,status:"GENERATING",message:"생성을 시작했습니다. 화면을 닫아도 계속 처리됩니다."},{status:202});
}
