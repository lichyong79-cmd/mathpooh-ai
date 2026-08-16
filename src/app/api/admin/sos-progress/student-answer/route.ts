import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {getSessionUser} from "@/lib/supabase/auth";
import {answerMatches} from "@/lib/sos-training-result";

async function admin(){
  const user=await getSessionUser();
  if(!user||["student","parent"].includes(user.user_metadata?.role))return null;
  return {supabase:createClient(),user};
}

export async function POST(request:Request){
  const ctx=await admin();
  if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  try{
    const body=await request.json();
    const sessionId=String(body?.sessionId??"").trim();
    const itemId=String(body?.itemId??"").trim();
    const field=String(body?.field??"initial")==="review"?"review":"initial";
    const answer=String(body?.answer??"").trim();
    if(!sessionId||!itemId)return NextResponse.json({message:"단계/문항 정보가 없습니다."},{status:400});
    if(!answer)return NextResponse.json({message:"학생 답을 입력해 주세요."},{status:400});

    const row=await ctx.supabase.from("sos_training_items")
      .select("id,session_id,item_order,student_answer,is_correct,answered_at,review_answer,review_is_correct,generated_problem,problem_bank_questions(answer),sos_training_sessions(status,decision,phase,round_no,cycle_kind)")
      .eq("id",itemId).eq("session_id",sessionId).maybeSingle();
    if(row.error||!row.data)return NextResponse.json({message:row.error?.message||"문항을 찾을 수 없습니다."},{status:404});

    const item:any=row.data;
    const bank:any=Array.isArray(item.problem_bank_questions)?item.problem_bank_questions[0]:item.problem_bank_questions;
    const generated:any=item.generated_problem??null;
    const correctAnswer=String(bank?.answer??generated?.answer??"").trim();
    if(!correctAnswer)return NextResponse.json({message:"현재 정답이 없어 학생 답을 재채점할 수 없습니다."},{status:409});

    const previousAnswer=field==="review"?String(item.review_answer??""):String(item.student_answer??"");
    const previousCorrect=field==="review"?item.review_is_correct:item.is_correct;
    const nextCorrect=answerMatches(answer,correctAnswer);
    const patch=field==="review"
      ? {review_answer:answer,review_is_correct:nextCorrect,review_answered_at:new Date().toISOString()}
      : {student_answer:answer,is_correct:nextCorrect,answered_at:item.answered_at??new Date().toISOString()};

    const update=await ctx.supabase.from("sos_training_items").update(patch).eq("id",itemId).eq("session_id",sessionId);
    if(update.error)throw update.error;

    const countRows=await ctx.supabase.from("sos_training_items").select("is_correct").eq("session_id",sessionId);
    if(countRows.error)throw countRows.error;
    const correctCount=(countRows.data??[]).filter((x:any)=>x.is_correct===true).length;
    const sessionUpdate=await ctx.supabase.from("sos_training_sessions").update({correct_count:correctCount,updated_at:new Date().toISOString()}).eq("id",sessionId);
    if(sessionUpdate.error)throw sessionUpdate.error;

    const session:any=Array.isArray(item.sos_training_sessions)?item.sos_training_sessions[0]:item.sos_training_sessions;
    await ctx.supabase.from("sos_training_activity_logs").insert({
      session_id:sessionId,item_id:itemId,event_type:"ADMIN_STUDENT_ANSWER_CORRECTED",
      detail:{question:Number(item.item_order??0),field,previousAnswer,newAnswer:answer,previousCorrect,newCorrect:nextCorrect,correctAnswer,adminEmail:String(ctx.user.email??""),meterRecalculated:false,branchRecalculated:false}
    });

    const completed=["COMPLETED","PASSED"].includes(String(session?.status??""));
    return NextResponse.json({success:true,field,answer,previousAnswer,isCorrect:nextCorrect,correctCount,completed,meterRecalculated:false,branchRecalculated:false});
  }catch(error:any){
    console.error("[SOS_ADMIN_STUDENT_ANSWER_POST]",error);
    return NextResponse.json({message:error?.message||"학생 답 수정 실패"},{status:500});
  }
}
