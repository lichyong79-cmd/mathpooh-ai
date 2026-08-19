import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { generateSimilarTraining } from "@/lib/sos-ai-training";

export const maxDuration=300;

async function auth(){const user=await getSessionUser();if(!user||["student","parent"].includes(String(user.user_metadata?.role??"")))return null;return user;}
export async function GET(){
  if(!await auth())return NextResponse.json({message:"관리자 로그인이 필요합니다."},{status:401});
  const supabase=createClient();
  const [questions,jobs]=await Promise.all([
    supabase.from("sos_ai_generated_questions").select("id,generation_kind,subject,major_unit,subunit,subunit_key,topic,core_type,difficulty,difficulty_meter,question_text,display_latex,answer,solution,generation_reason,verification,status,use_count,source_problem_id,source_training_session_id,source_training_order,created_at,updated_at").order("created_at",{ascending:false}).limit(1000),
    supabase.from("sos_ai_generation_jobs").select("id,generation_kind,requested_count,status,attempt_count,last_error,result_session_id,requested_at,started_at,completed_at,updated_at,pipeline_version,stage,stage_index,stage_total,stage_message,stage_updated_at,draft_payload,rendered_payload,verification_payload").order("requested_at",{ascending:false}).limit(200)
  ]);
  if(questions.error)return NextResponse.json({message:questions.error.message},{status:400});
  if(jobs.error)return NextResponse.json({message:jobs.error.message},{status:400});
  return NextResponse.json({success:true,questions:questions.data??[],jobs:jobs.data??[]},{headers:{"Cache-Control":"no-store,max-age=0"}});
}

export async function POST(request:Request){
  if(!await auth())return NextResponse.json({message:"관리자 로그인이 필요합니다."},{status:401});
  const body=await request.json();
  const jobId=String(body.jobId??"").trim();
  const action=String(body.action??"").trim();
  if(!jobId)return NextResponse.json({message:"작업 ID가 없습니다."},{status:400});
  const allowed=["RETRY_CURRENT","RESTART_TEXT","CONTINUE_FROM_TEXT","CONTINUE_FROM_RENDER","FORCE_VERIFY"];
  if(!allowed.includes(action))return NextResponse.json({message:"지원하지 않는 수동 공정입니다."},{status:400});
  const supabase=createClient();
  const found=await supabase.from("sos_ai_generation_jobs")
    .select("id,status,student_id,source_training_session_id,generation_kind,requested_count,draft_payload,rendered_payload,verification_payload")
    .eq("id",jobId).maybeSingle();
  if(found.error)return NextResponse.json({message:found.error.message},{status:400});
  if(!found.data)return NextResponse.json({message:"생성 작업을 찾을 수 없습니다."},{status:404});
  const job:any=found.data;
  const drafts=Array.isArray(job.draft_payload?.problems)?job.draft_payload.problems:[];
  const rendered=Array.isArray(job.rendered_payload?.problems)?job.rendered_payload.problems:[];
  const count=Number(job.requested_count??0);
  const now=new Date().toISOString();
  let patch:any={status:"QUEUED",attempt_count:0,last_error:null,stage_updated_at:now,updated_at:now};
  if(action==="RETRY_CURRENT")patch={...patch,stage_message:"관리자 수동 재실행 · 저장된 정상 단계부터 이어갑니다."};
  if(action==="RESTART_TEXT")patch={...patch,stage:"QUEUED",stage_index:0,stage_message:"관리자 수동 지시 · 텍스트 생성부터 다시 시작합니다.",draft_payload:{},rendered_payload:{},verification_payload:{}};
  if(action==="CONTINUE_FROM_TEXT") {
    if(!count||drafts.length!==count)return NextResponse.json({message:`저장된 텍스트 문항이 부족합니다. (${drafts.length}/${count})`},{status:400});
    patch={...patch,stage:"TEXT_CREATED",stage_index:4,stage_message:"관리자 텍스트 승인 · 조판 공정으로 강제 진행합니다.",rendered_payload:{},verification_payload:{}};
  }
  if(action==="CONTINUE_FROM_RENDER") {
    if(!count||rendered.length!==count)return NextResponse.json({message:`저장된 조판 문항이 부족합니다. (${rendered.length}/${count})`},{status:400});
    patch={...patch,stage:"RENDER_VERIFIED",stage_index:6,stage_message:"관리자 조판 승인 · 최종 재풀이 공정으로 강제 진행합니다.",verification_payload:{}};
  }
  if(action==="FORCE_VERIFY") {
    if(!count||rendered.length!==count)return NextResponse.json({message:`강제 승인할 조판 문항이 부족합니다. (${rendered.length}/${count})`},{status:400});
    const checks=rendered.map((p:any,index:number)=>({index:index+1,valid:true,sourceFaithful:true,computedAnswer:String(p?.answer??""),reason:"ADMIN_MANUAL_OVERRIDE"}));
    patch={...patch,stage:"FINAL_VERIFIED",stage_index:8,stage_message:"관리자 최종검증 강제 승인 · 문제은행 저장 및 학생 배정 대기",verification_payload:{checks,manualOverride:true,approvedAt:now}};
  }
  const updated=await supabase.from("sos_ai_generation_jobs").update({...patch,status:"GENERATING",started_at:now}).eq("id",jobId).select("id,status,stage,stage_index,stage_message").single();
  if(updated.error)return NextResponse.json({message:updated.error.message},{status:400});
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
    const done=await supabase.from("sos_ai_generation_jobs").update({status:"READY",stage:"READY",stage_index:8,stage_total:8,stage_message:"관리자 수동 공정 실행 · 학생 학습 배정까지 완료",result_session_id:resultSessionId,completed_at:new Date().toISOString(),stage_updated_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:null}).eq("id",jobId);
    if(done.error)throw done.error;
    return NextResponse.json({success:true,jobId,status:"READY",resultSessionId});
  }catch(error){
    const message=error instanceof Error?error.message:"수동 공정 실행 실패";
    await supabase.from("sos_ai_generation_jobs").update({status:"FAILED",last_error:message.slice(0,1000),stage_message:`관리자 수동 공정 실패 · ${message}`.slice(0,300),stage_updated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",jobId);
    return NextResponse.json({message},{status:500});
  }
}

export async function PATCH(request:Request){
  if(!await auth())return NextResponse.json({message:"관리자 로그인이 필요합니다."},{status:401});
  const body=await request.json();const id=String(body.id??"");const status=String(body.status??"");
  if(!id||!["READY","DISABLED"].includes(status))return NextResponse.json({message:"요청값을 확인해 주세요."},{status:400});
  const supabase=createClient();const result=await supabase.from("sos_ai_generated_questions").update({status,updated_at:new Date().toISOString()}).eq("id",id);
  if(result.error)return NextResponse.json({message:result.error.message},{status:400});return NextResponse.json({success:true});
}
