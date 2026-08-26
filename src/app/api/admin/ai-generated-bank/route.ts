import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { generateSimilarTraining } from "@/lib/sos-ai-training";

// SOS282: 허용목록으로 통일한다.
async function auth(){const user=await getSessionUser();return String(user?.user_metadata?.role??"")==="admin"?user:null;}

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
  const supabase=createClient();const result=await supabase.from("sos_ai_generated_questions").update({status,updated_at:new Date().toISOString()}).eq("id",id);
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
    const r=await supabase.from("sos_ai_generation_jobs").update({
      status:"QUEUED",attempt_count:0,batch_payload:{},
      stage:"QUEUED",stage_index:0,stage_message:"관리자가 멈춘 작업을 되살렸습니다.",
      last_error:null,started_at:null,
      stage_updated_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    }).in("status",["GENERATING","QUEUED","FAILED"]).gte("attempt_count",1).select("id");
    if(r.error)return NextResponse.json({message:r.error.message},{status:400});
    return NextResponse.json({success:true,revived:(r.data??[]).length});
  }

  if(action==="requeue"){
    const id=String(body?.id??"");
    if(!id)return NextResponse.json({message:"작업을 확인해 주세요."},{status:400});
    const r=await supabase.from("sos_ai_generation_jobs").update({
      status:"QUEUED",attempt_count:0,last_error:null,
      stage:"QUEUED",stage_index:0,stage_message:"관리자가 다시 대기열에 넣었습니다.",
      stage_updated_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    }).eq("id",id).select("id").maybeSingle();
    if(r.error)return NextResponse.json({message:r.error.message},{status:400});
    if(!r.data)return NextResponse.json({message:"해당 작업을 찾지 못했습니다."},{status:404});
    return NextResponse.json({success:true,requeued:1});
  }

  // run_next: 워커와 같은 규칙으로 한 건을 선점해 끝까지 처리한다.
  const cols="id,student_id,source_training_session_id,generation_kind,requested_count,status,attempt_count";
  const picked=await supabase.from("sos_ai_generation_jobs").select(cols)
    .in("status",["QUEUED","FAILED"]).lt("attempt_count",8)   // SOS295: 재시도 한도를 워커와 맞춘다
    .order("requested_at",{ascending:true}).limit(1).maybeSingle();
  if(picked.error)return NextResponse.json({message:picked.error.message},{status:400});
  const job:any=picked.data;
  if(!job)return NextResponse.json({success:true,processed:0,message:"대기 중인 생성 작업이 없습니다."});

  const claimed=await supabase.from("sos_ai_generation_jobs").update({
    status:"GENERATING",started_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    attempt_count:Number(job.attempt_count??0)+1,last_error:null,
  }).eq("id",job.id).in("status",["QUEUED","FAILED"]).select("id").maybeSingle();
  if(claimed.error)return NextResponse.json({message:claimed.error.message},{status:400});
  if(!claimed.data)return NextResponse.json({success:true,processed:0,message:"다른 실행이 먼저 처리 중입니다."});

  try{
    const result:any=await generateSimilarTraining({
      supabase,
      studentId:String(job.student_id),
      firstTrainingSessionId:String(job.source_training_session_id),
      count:Number(job.requested_count)===3?3:10,
      kind:String(job.generation_kind)==="HOMEWORK"?"HOMEWORK":"SECOND_TRAINING",
      jobId:String(job.id),
    });
    await supabase.from("sos_ai_generation_jobs").update({
      status:"READY",stage:"READY",stage_index:8,stage_total:8,
      stage_message:"학생 학습 배정까지 완료되었습니다.",
      result_session_id:String(result?.session?.id??"")||null,
      completed_at:new Date().toISOString(),stage_updated_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),last_error:null,
    }).eq("id",job.id);
    return NextResponse.json({success:true,processed:1,jobId:job.id,status:"READY"});
  }catch(error){
    const message=error instanceof Error?error.message:"AI 생성 실패";
    await supabase.from("sos_ai_generation_jobs").update({
      status:"FAILED",stage:"FAILED",stage_message:message.slice(0,300),
      last_error:message.slice(0,1000),stage_updated_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
    }).eq("id",job.id);
    return NextResponse.json({success:false,processed:1,jobId:job.id,status:"FAILED",message},{status:500});
  }
}
