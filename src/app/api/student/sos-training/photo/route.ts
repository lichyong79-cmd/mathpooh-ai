import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

async function context(){
  const user=await getSessionUser();
  if(!user)return {error:NextResponse.json({message:"로그인이 필요합니다."},{status:401})};
  if(user.user_metadata?.role!=="student")return {error:NextResponse.json({message:"학생 계정으로 로그인해 주세요."},{status:403})};
  const supabase=createClient();
  const student=await supabase.from("students").select("id").eq("auth_user_id",user.id).maybeSingle();
  if(student.error||!student.data)return {error:NextResponse.json({message:student.error?.message||"학생 정보를 찾을 수 없습니다."},{status:404})};
  return {supabase,student:student.data};
}

export async function POST(request:Request){
  const ctx=await context();
  if("error" in ctx)return ctx.error;
  const {supabase,student}=ctx;
  const form=await request.formData();
  const sessionId=String(form.get("sessionId")??"");
  const itemId=String(form.get("itemId")??"");
  const file=form.get("photo");
  if(!sessionId||!itemId||!(file instanceof File))return NextResponse.json({message:"풀이사진 정보가 올바르지 않습니다."},{status:400});
  if(file.size<=0||file.size>10*1024*1024)return NextResponse.json({message:"풀이사진은 10MB 이하로 올려 주세요."},{status:400});
  if(!String(file.type||"").startsWith("image/"))return NextResponse.json({message:"이미지 파일만 제출할 수 있습니다."},{status:400});

  const itemResult=await supabase
    .from("sos_training_items")
    .select("id,session_id,answer_locked_at,solution_photo_path,sos_training_sessions!inner(student_id,phase,status)")
    .eq("id",itemId).eq("session_id",sessionId).single();
  if(itemResult.error||!itemResult.data)return NextResponse.json({message:itemResult.error?.message||"진단 문항을 찾을 수 없습니다."},{status:404});
  const item:any=itemResult.data;
  const parent=Array.isArray(item.sos_training_sessions)?item.sos_training_sessions[0]:item.sos_training_sessions;
  if(String(parent?.student_id)!==String(student.id))return NextResponse.json({message:"본인의 진단 문항만 제출할 수 있습니다."},{status:403});
  if(String(parent?.phase)!=="DIAGNOSIS")return NextResponse.json({message:"풀이사진 제출은 진단 문항에서 사용합니다."},{status:400});
  if(String(parent?.status)!=="IN_PROGRESS")return NextResponse.json({message:"진행 중인 진단이 아닙니다."},{status:409});
  if(!item.answer_locked_at)return NextResponse.json({message:"먼저 답안을 확정해 주세요."},{status:409});

  const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
  const path=`${student.id}/${sessionId}/${itemId}-${Date.now()}.${ext}`;
  const uploaded=await supabase.storage.from("sos-solution-photos").upload(path,Buffer.from(await file.arrayBuffer()),{contentType:file.type||"image/jpeg",upsert:false});
  if(uploaded.error)return NextResponse.json({message:uploaded.error.message},{status:400});

  const photoAt=new Date();
  const lockedAt=new Date(item.answer_locked_at);
  const photoSeconds=Math.max(0,Math.round((photoAt.getTime()-lockedAt.getTime())/1000));
  const updated=await supabase.from("sos_training_items").update({
    solution_photo_path:path,
    photo_submitted_at:photoAt.toISOString(),
    photo_submit_seconds:photoSeconds,
  }).eq("id",itemId);
  if(updated.error){
    await supabase.storage.from("sos-solution-photos").remove([path]);
    return NextResponse.json({message:updated.error.message},{status:400});
  }
  if(item.solution_photo_path&&item.solution_photo_path!==path)await supabase.storage.from("sos-solution-photos").remove([item.solution_photo_path]);
  await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:itemId,student_id:student.id,event_type:"PHOTO_SUBMITTED",detail:{photoSeconds}});
  return NextResponse.json({success:true,photoSeconds,photoSubmittedAt:photoAt.toISOString()});
}
