import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { clampMeter, nextProblemMeter } from "@/lib/difficulty-meter";

async function admin(){
  const user=await getSessionUser();
  if(!user||["student","parent"].includes(user.user_metadata?.role))return null;
  return {supabase:createClient(),user};
}

function descendants(all:any[],startId:string){
  const result=new Set<string>();
  const queue=[startId];
  while(queue.length){
    const parent=queue.shift()!;
    for(const s of all){
      if(String(s.parent_session_id??"")===parent&&!result.has(String(s.id))){
        const id=String(s.id);result.add(id);queue.push(id);
      }
    }
  }
  return [...result];
}

function rootOf(all:any[],session:any){
  const map=new Map(all.map((s:any)=>[String(s.id),s]));
  let current=session;
  const seen=new Set<string>();
  while(current?.parent_session_id&&!seen.has(String(current.id))){
    seen.add(String(current.id));
    const parent=map.get(String(current.parent_session_id));
    if(!parent)break;
    current=parent;
  }
  return current??session;
}

async function restoreStudentMeter(supabase:any,studentId:string,session:any,mode:"STAGE"|"REVIEW"){
  const key=String(session?.target_snapshot?.subunitKey??"");
  if(!key)return;
  let meter:number|null=null;
  if(mode==="REVIEW"){
    if(String(session.phase)==="TRAINING"&&session.training_meter!=null)meter=Number(session.training_meter);
    else{
      const items=await supabase.from("sos_training_items").select("student_meter_after,item_order").eq("session_id",session.id).order("item_order",{ascending:false}).limit(1);
      const value=items.data?.[0]?.student_meter_after;
      if(value!=null)meter=Number(value);
    }
  }else{
    if(session.baseline_meter!=null)meter=Number(session.baseline_meter);
    else if(session?.target_snapshot?.studentDifficultyMeter!=null)meter=Number(session.target_snapshot.studentDifficultyMeter);
    else{
      const items=await supabase.from("sos_training_items").select("student_meter_before,item_order").eq("session_id",session.id).order("item_order",{ascending:true}).limit(1);
      const value=items.data?.[0]?.student_meter_before;
      if(value!=null)meter=Number(value);
    }
  }
  if(meter==null||!Number.isFinite(meter))return;
  await supabase.from("sos_student_subunit_meters").update({difficulty_meter:clampMeter(meter),updated_at:new Date().toISOString()}).eq("student_id",studentId).eq("subunit_key",key);
}

async function recalcProblems(supabase:any,problemIds:string[]){
  for(const problemId of [...new Set(problemIds.filter(Boolean))]){
    const problemResult=await supabase.from("problem_bank_questions").select("id,difficulty,difficulty_meter").eq("id",problemId).maybeSingle();
    if(problemResult.error||!problemResult.data)continue;
    const base=clampMeter(problemResult.data.difficulty,3);
    const eventsResult=await supabase.from("sos_difficulty_events")
      .select("student_id,is_correct,student_meter_before,created_at")
      .eq("problem_id",problemId).order("created_at",{ascending:true});
    if(eventsResult.error)continue;
    let meter=base;
    const students=new Set<string>();
    let unique=0;
    const events=eventsResult.data??[];
    for(const e of events){
      const sid=String(e.student_id);
      const first=!students.has(sid);
      if(first){students.add(sid);unique++;meter=nextProblemMeter({problemMeter:meter,studentMeterBefore:Number(e.student_meter_before??3),correct:e.is_correct===true,uniqueStudents:unique});}
    }
    await supabase.from("problem_bank_questions").update({
      difficulty_meter:meter,
      difficulty_meter_samples:events.length,
      difficulty_meter_unique_students:unique,
      difficulty_meter_origin:unique>=20?"EMPIRICAL":"DNA",
      difficulty_meter_updated_at:new Date().toISOString(),
    }).eq("id",problemId);
  }
}

export async function POST(request:Request){
  const ctx=await admin();
  if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  try{
    const body=await request.json();
    const studentId=String(body.studentId??"");
    const sessionId=String(body.sessionId??"");
    const scope=String(body.scope??"").toUpperCase() as "STAGE"|"REVIEW"|"FULL";
    if(!studentId||!sessionId||!["STAGE","REVIEW","FULL"].includes(scope))return NextResponse.json({message:"리셋 대상 정보가 올바르지 않습니다."},{status:400});

    const sessionsResult=await ctx.supabase.from("sos_training_sessions")
      .select("id,student_id,parent_session_id,phase,status,round_no,cycle_kind,target_snapshot,baseline_meter,training_meter,review_meter")
      .eq("student_id",studentId).order("created_at",{ascending:true});
    if(sessionsResult.error)throw sessionsResult.error;
    const all=sessionsResult.data??[];
    const selected=all.find((s:any)=>String(s.id)===sessionId);
    if(!selected)return NextResponse.json({message:"리셋할 단계를 찾을 수 없습니다."},{status:404});
    const root=rootOf(all,selected);
    const target=scope==="FULL"?root:selected;
    const childIds=descendants(all,String(target.id));
    const affectedSessionIds=[String(target.id),...childIds];

    const itemsResult=await ctx.supabase.from("sos_training_items").select("id,session_id,problem_id,solution_photo_path").in("session_id",affectedSessionIds);
    if(itemsResult.error)throw itemsResult.error;
    const affectedItems=itemsResult.data??[];
    const itemIds=affectedItems.map((x:any)=>String(x.id));
    const problemIds=affectedItems.map((x:any)=>String(x.problem_id??"")).filter(Boolean);

    if(scope==="REVIEW"){
      if(childIds.length){const del=await ctx.supabase.from("sos_training_sessions").delete().in("id",childIds);if(del.error)throw del.error;}
      const wrong=await ctx.supabase.from("sos_training_items").select("id").eq("session_id",target.id).eq("is_correct",false);
      if(wrong.error)throw wrong.error;
      if(!(wrong.data??[]).length)return NextResponse.json({message:"오답 문항이 없어 오답만 리셋할 수 없습니다."},{status:409});
      const itemReset=await ctx.supabase.from("sos_training_items").update({review_answer:null,review_is_correct:null,review_response_seconds:null,review_answered_at:null}).eq("session_id",target.id).eq("is_correct",false);
      if(itemReset.error)throw itemReset.error;
      const reviewTypes=["REVIEW_ITEM_DONE","REVIEW_ITEM_RETRY_WRONG","REVIEW_ITEM_CORRECTED","REVIEW_HINT_USED","REVIEW_ITEM_EXPLAINED","REVIEW_COMPLETED"];
      const logDelete=await ctx.supabase.from("sos_training_activity_logs").delete().eq("session_id",target.id).in("event_type",reviewTypes);
      if(logDelete.error)throw logDelete.error;
      await restoreStudentMeter(ctx.supabase,studentId,target,"REVIEW");
      const sessionReset=await ctx.supabase.from("sos_training_sessions").update({status:"RETRAIN",review_meter:null,decision:"ADMIN_REVIEW_RESET",updated_at:new Date().toISOString()}).eq("id",target.id);
      if(sessionReset.error)throw sessionReset.error;
    }else{
      if(childIds.length){const del=await ctx.supabase.from("sos_training_sessions").delete().in("id",childIds);if(del.error)throw del.error;}
      if(itemIds.length){
        const eventDelete=await ctx.supabase.from("sos_difficulty_events").delete().in("training_item_id",itemIds);
        if(eventDelete.error)throw eventDelete.error;
      }
      await recalcProblems(ctx.supabase,problemIds);
      const logDelete=await ctx.supabase.from("sos_training_activity_logs").delete().eq("session_id",target.id);
      if(logDelete.error)throw logDelete.error;
      const itemReset=await ctx.supabase.from("sos_training_items").update({
        student_answer:null,is_correct:null,response_seconds:null,answered_at:null,revealed_at:null,answer_locked_at:null,
        solution_photo_path:null,photo_submitted_at:null,photo_submit_seconds:null,screen_exit_count:0,
        student_meter_before:null,student_meter_after:null,problem_meter_before:null,problem_meter_after:null,
        review_answer:null,review_is_correct:null,review_response_seconds:null,review_answered_at:null,
      }).eq("session_id",target.id);
      if(itemReset.error)throw itemReset.error;
      await restoreStudentMeter(ctx.supabase,studentId,target,"STAGE");
      const sessionReset=await ctx.supabase.from("sos_training_sessions").update({
        status:"ASSIGNED",correct_count:null,decision:scope==="FULL"?"ADMIN_FULL_RESET":"ADMIN_STAGE_RESET",
        weakness_snapshot:String(target.phase)==="DIAGNOSIS"?{}:undefined,
        training_meter:null,review_meter:null,updated_at:new Date().toISOString(),
      }).eq("id",target.id);
      if(sessionReset.error)throw sessionReset.error;
    }

    await ctx.supabase.from("sos_admin_reset_logs").insert({
      student_id:studentId,root_session_id:String(root.id),target_session_id:String(target.id),reset_scope:scope,
      target_phase:String(target.phase??""),target_round_no:Number(target.round_no??1),target_cycle_kind:String(target.cycle_kind??"STANDARD"),
      admin_user_id:ctx.user.id,admin_email:String(ctx.user.email??""),
      detail:{requestedSessionId:sessionId,deletedDescendants:childIds,affectedProblemIds:[...new Set(problemIds)]},
    });

    return NextResponse.json({success:true,scope,targetSessionId:String(target.id),deletedDescendants:childIds.length});
  }catch(error:any){
    console.error("[SOS_ADMIN_RESET]",error);
    return NextResponse.json({message:error?.message||"SOS 리셋에 실패했습니다."},{status:500});
  }
}
