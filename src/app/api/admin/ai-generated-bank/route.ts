import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

async function auth(){const user=await getSessionUser();if(!user||["student","parent"].includes(String(user.user_metadata?.role??"")))return null;return user;}
export async function GET(){
  if(!await auth())return NextResponse.json({message:"관리자 로그인이 필요합니다."},{status:401});
  const supabase=createClient();
  const [questions,jobs]=await Promise.all([
    supabase.from("sos_ai_generated_questions").select("id,generation_kind,subject,major_unit,subunit,subunit_key,topic,core_type,difficulty,difficulty_meter,question_text,display_latex,answer,solution,generation_reason,verification,status,use_count,source_problem_id,source_training_session_id,source_training_order,created_at,updated_at").order("created_at",{ascending:false}).limit(1000),
    supabase.from("sos_ai_generation_jobs").select("id,generation_kind,requested_count,status,attempt_count,last_error,result_session_id,requested_at,started_at,completed_at,updated_at").order("requested_at",{ascending:false}).limit(200)
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
