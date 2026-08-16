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
    const answer=String(body?.answer??"").trim();
    if(!sessionId||!itemId)return NextResponse.json({message:"단계/문항 정보가 없습니다."},{status:400});
    if(!answer)return NextResponse.json({message:"정답을 입력해 주세요."},{status:400});

    const row=await ctx.supabase.from("sos_training_items")
      .select("id,session_id,problem_id,student_answer,is_correct,review_answer,review_is_correct,generated_problem,problem_bank_questions(id,answer)")
      .eq("id",itemId).eq("session_id",sessionId).maybeSingle();
    if(row.error||!row.data)return NextResponse.json({message:row.error?.message||"문항을 찾을 수 없습니다."},{status:404});

    const item:any=row.data;
    const bank:any=Array.isArray(item.problem_bank_questions)?item.problem_bank_questions[0]:item.problem_bank_questions;
    const generated:any=item.generated_problem??null;
    const previousAnswer=String(bank?.answer??generated?.answer??"").trim();
    let source:"BANK"|"GENERATED";

    if(item.problem_id&&bank?.id){
      const update=await ctx.supabase.from("problem_bank_questions").update({answer}).eq("id",String(bank.id));
      if(update.error)throw update.error;
      source="BANK";
    }else if(generated){
      const nextGenerated={...generated,answer,admin_answer_corrected:true,admin_answer_corrected_at:new Date().toISOString()};
      const update=await ctx.supabase.from("sos_training_items").update({generated_problem:nextGenerated}).eq("id",itemId).eq("session_id",sessionId);
      if(update.error)throw update.error;
      source="GENERATED";
    }else{
      return NextResponse.json({message:"정답 원본을 찾을 수 없는 문항입니다."},{status:409});
    }

    const studentAnswer=String(item.student_answer??"").trim();
    const reviewAnswer=String(item.review_answer??"").trim();
    const patch:any={};
    if(studentAnswer)patch.is_correct=answerMatches(studentAnswer,answer);
    if(reviewAnswer)patch.review_is_correct=answerMatches(reviewAnswer,answer);
    if(Object.keys(patch).length){
      const updateItem=await ctx.supabase.from("sos_training_items").update(patch).eq("id",itemId).eq("session_id",sessionId);
      if(updateItem.error)throw updateItem.error;
    }

    const countRows=await ctx.supabase.from("sos_training_items").select("is_correct").eq("session_id",sessionId);
    if(countRows.error)throw countRows.error;
    const correctCount=(countRows.data??[]).filter((x:any)=>x.is_correct===true).length;
    const sessionUpdate=await ctx.supabase.from("sos_training_sessions").update({correct_count:correctCount,updated_at:new Date().toISOString()}).eq("id",sessionId);
    if(sessionUpdate.error)throw sessionUpdate.error;

    await ctx.supabase.from("sos_training_activity_logs").insert({
      session_id:sessionId,item_id:itemId,event_type:"ADMIN_ANSWER_CORRECTED",
      detail:{previousAnswer,newAnswer:answer,source,adminEmail:String(ctx.user.email??""),regradedStudentAnswer:Boolean(studentAnswer),regradedReviewAnswer:Boolean(reviewAnswer)}
    });

    return NextResponse.json({success:true,answer,previousAnswer,source,correctCount,isCorrect:studentAnswer?answerMatches(studentAnswer,answer):null,reviewIsCorrect:reviewAnswer?answerMatches(reviewAnswer,answer):null,meterRecalculated:false});
  }catch(error:any){
    console.error("[SOS_ADMIN_ANSWER_POST]",error);
    return NextResponse.json({message:error?.message||"정답 수정 실패"},{status:500});
  }
}
