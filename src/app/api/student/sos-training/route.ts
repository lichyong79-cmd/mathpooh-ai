import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { answerMatches, recordTrainingResult } from "@/lib/sos-training-result";
import { analyzeDiagnosisAndCreateFirstTraining, generateSimilarTraining, generateReviewHint } from "@/lib/sos-ai-training";
import { clampMeter } from "@/lib/difficulty-meter";
import { reviewBonus } from "@/lib/sos-training-policy";

async function context(){
  const user=await getSessionUser();
  if(!user)return {error:NextResponse.json({message:"로그인이 필요합니다."},{status:401})};
  if(user.user_metadata?.role!=="student")
    return {error:NextResponse.json({message:"학생 계정으로 로그인해 주세요."},{status:403})};

  const supabase=createClient();
  const studentResult=await supabase
    .from("students")
    .select("id,name,school,grade")
    .eq("auth_user_id",user.id)
    .maybeSingle();

  if(studentResult.error||!studentResult.data)
    return {error:NextResponse.json({message:studentResult.error?.message||"학생 정보를 찾을 수 없습니다."},{status:404})};

  return {supabase,student:studentResult.data};
}

async function signedQuestionImage(supabase:any,path:string|null|undefined){
  if(!path)return "";
  const result=await supabase.storage.from("question-images").createSignedUrl(path,60*60);
  return result.data?.signedUrl??"";
}

async function currentTargetMeter(supabase:any,studentId:string,session:any){
  const key=String(session?.target_snapshot?.subunitKey??"");
  if(!key)return clampMeter(session?.baseline_meter??session?.target_snapshot?.studentDifficultyMeter??3);
  const result=await supabase.from("sos_student_subunit_meters").select("difficulty_meter").eq("student_id",studentId).eq("subunit_key",key).maybeSingle();
  if(result.error)throw result.error;
  return clampMeter(result.data?.difficulty_meter,session?.baseline_meter??3);
}

async function setTargetMeter(supabase:any,studentId:string,session:any,meter:number){
  const key=String(session?.target_snapshot?.subunitKey??"");
  if(!key)return;
  const update=await supabase.from("sos_student_subunit_meters").update({difficulty_meter:clampMeter(meter),updated_at:new Date().toISOString()}).eq("student_id",studentId).eq("subunit_key",key);
  if(update.error)throw update.error;
}

export async function GET(){
  const ctx=await context();
  if("error" in ctx)return ctx.error;
  const {supabase,student}=ctx;

  const result=await supabase
    .from("sos_training_sessions")
    .select("id,phase,status,target_snapshot,weakness_snapshot,baseline_meter,goal_meter,training_meter,review_meter,cycle_kind,parent_session_id,round_no,correct_count,total_count,decision,created_at,updated_at,sos_training_items(id,problem_id,item_order,item_role,student_answer,is_correct,response_seconds,answered_at,revealed_at,answer_locked_at,solution_photo_path,photo_submitted_at,photo_submit_seconds,screen_exit_count,subunit_key,student_meter_before,student_meter_after,problem_meter_before,problem_meter_after,generated_problem,review_answer,review_is_correct,review_response_seconds,review_answered_at,problem_bank_questions(id,problem_code,title,subject,unit,topic,difficulty,difficulty_meter,question_image_path,answer))")
    .eq("student_id",student.id)
    .in("status",["ASSIGNED","IN_PROGRESS","COMPLETED","PASSED","RETRAIN"])
    .order("created_at",{ascending:false});

  if(result.error)return NextResponse.json({message:result.error.message},{status:400});

  const rawSessions=result.data??[];
  const sessionIds=rawSessions.map((s:any)=>String(s.id)).filter(Boolean);
  const reviewLogMap=new Map<string,any[]>();
  if(sessionIds.length){
    const reviewLogs=await supabase.from("sos_training_activity_logs")
      .select("session_id,item_id,event_type,detail,occurred_at")
      .in("session_id",sessionIds)
      .in("event_type",["REVIEW_ITEM_RETRY_WRONG","REVIEW_ITEM_CORRECTED","REVIEW_HINT_USED","REVIEW_ITEM_EXPLAINED"]);
    for(const log of reviewLogs.data??[]){
      if(!log.item_id)continue;
      const key=String(log.item_id);const list=reviewLogMap.get(key)??[];list.push(log);reviewLogMap.set(key,list);
    }
  }

  const sessions=await Promise.all(rawSessions.map(async(session:any)=>{
    const items=await Promise.all((session.sos_training_items??[])
      .sort((a:any,b:any)=>Number(a.item_order)-Number(b.item_order))
      .map(async(item:any)=>{
        const bank=item.problem_bank_questions??null;
        const generated=item.generated_problem??null;
        const answer=bank?.answer??generated?.answer??"";
        return {
          id:item.id,
          problemId:item.problem_id,
          order:item.item_order,
          role:item.item_role,
          studentAnswer:item.student_answer??"",
          isCorrect:item.is_correct,
          responseSeconds:item.response_seconds,
          answeredAt:item.answered_at,
          revealedAt:item.revealed_at,
          answerLockedAt:item.answer_locked_at,
          photoSubmittedAt:item.photo_submitted_at,
          photoSubmitSeconds:item.photo_submit_seconds,
          hasSolutionPhoto:Boolean(item.solution_photo_path),
          screenExitCount:Number(item.screen_exit_count??0),
          studentMeterBefore:item.student_meter_before,
          studentMeterAfter:item.student_meter_after,
          problemMeterBefore:item.problem_meter_before,
          problemMeterAfter:item.problem_meter_after,
          reviewAnswer:item.review_answer??"",
          reviewIsCorrect:item.review_is_correct,
          reviewResponseSeconds:item.review_response_seconds,
          reviewAttemptCount:(reviewLogMap.get(String(item.id))??[]).filter((l:any)=>["REVIEW_ITEM_RETRY_WRONG","REVIEW_ITEM_CORRECTED"].includes(String(l.event_type))).length,
          reviewHintLevel:Math.max(0,...(reviewLogMap.get(String(item.id))??[]).filter((l:any)=>String(l.event_type)==="REVIEW_HINT_USED").map((l:any)=>Number(l.detail?.level??0))),
          reviewLastHint:[...(reviewLogMap.get(String(item.id))??[])].reverse().find((l:any)=>String(l.event_type)==="REVIEW_HINT_USED")?.detail?.hint??"",
          reviewExplained:(reviewLogMap.get(String(item.id))??[]).some((l:any)=>String(l.event_type)==="REVIEW_ITEM_EXPLAINED"),
          reviewCompleted:item.review_is_correct===true||(reviewLogMap.get(String(item.id))??[]).some((l:any)=>String(l.event_type)==="REVIEW_ITEM_EXPLAINED"),
          generated:Boolean(generated),
          problem:{
            id:bank?.id??null,
            code:bank?.problem_code??"AI-GENERATED",
            title:bank?.title??generated?.topic??"AI 유사문항",
            subject:bank?.subject??generated?.subject??session.target_snapshot?.subject??"",
            unit:bank?.unit??generated?.subunit??session.target_snapshot?.subunit??"",
            topic:bank?.topic??generated?.topic??"",
            difficulty:bank?.difficulty??generated?.difficulty??null,
            difficultyMeter:bank?.difficulty_meter??generated?.meter??null,
            imageUrl:bank?await signedQuestionImage(supabase,bank.question_image_path):"",
            generatedText:generated?.question??"",
            generatedSolution:(["PASSED","COMPLETED"].includes(String(session.status))||String(session.cycle_kind)==="HOMEWORK")?generated?.solution??"":undefined,
            correctAnswer:["COMPLETED","PASSED","RETRAIN"].includes(String(session.status))?String(answer):undefined,
          },
        };
      }));
    return {...session,items};
  }));

  const meters=await supabase
    .from("sos_student_subunit_meters")
    .select("subject,major_unit,subunit,subunit_key,difficulty_meter,sample_count,updated_at")
    .eq("student_id",student.id)
    .order("updated_at",{ascending:false});

  return NextResponse.json({
    success:true,
    student,
    sessions,
    subunitMeters:meters.data??[],
  },{headers:{"Cache-Control":"no-store,max-age=0"}});
}

export async function POST(request:Request){
  const ctx=await context();
  if("error" in ctx)return ctx.error;
  const {supabase,student}=ctx;
  const body=await request.json();
  const action=String(body.action??"");
  const sessionId=String(body.sessionId??"");

  if(!sessionId)return NextResponse.json({message:"진단·훈련 세션 ID가 없습니다."},{status:400});

  const sessionResult=await supabase
    .from("sos_training_sessions")
    .select("id,student_id,phase,status,total_count,round_no,target_snapshot,weakness_snapshot,baseline_meter,goal_meter,cycle_kind,parent_session_id")
    .eq("id",sessionId)
    .eq("student_id",student.id)
    .single();

  if(sessionResult.error||!sessionResult.data)
    return NextResponse.json({message:sessionResult.error?.message||"진단·훈련을 찾을 수 없습니다."},{status:404});

  const session:any=sessionResult.data;

  if(action==="recover_diagnosis"){
    if(String(session.phase)!=="DIAGNOSIS"||!["COMPLETED","PASSED"].includes(String(session.status)))
      return NextResponse.json({message:"완료된 진단만 이어서 준비할 수 있습니다."},{status:409});
    try{
      const ai=await analyzeDiagnosisAndCreateFirstTraining({supabase,studentId:String(student.id),diagnosisSessionId:sessionId});
      return NextResponse.json({success:true,ai});
    }catch(error){return NextResponse.json({message:error instanceof Error?error.message:"기존 진단 이어가기 실패"},{status:500});}
  }

  if(action==="start"){
    if(["COMPLETED","PASSED"].includes(String(session.status)))
      return NextResponse.json({message:"이미 완료한 학습입니다."},{status:409});

    const update=await supabase
      .from("sos_training_sessions")
      .update({status:"IN_PROGRESS",updated_at:new Date().toISOString()})
      .eq("id",sessionId);
    if(update.error)return NextResponse.json({message:update.error.message},{status:400});
    await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:null,student_id:student.id,event_type:"SESSION_STARTED",detail:{phase:session.phase,roundNo:session.round_no,cycleKind:session.cycle_kind}});
    return NextResponse.json({success:true,status:"IN_PROGRESS"});
  }

  if(action==="reveal"){
    if(String(session.phase)!=="DIAGNOSIS"||String(session.status)!=="IN_PROGRESS")
      return NextResponse.json({message:"진행 중인 진단에서만 문항을 공개할 수 있습니다."},{status:409});
    const itemId=String(body.itemId??"");
    const item=await supabase.from("sos_training_items").select("id,revealed_at,answer_locked_at").eq("id",itemId).eq("session_id",sessionId).single();
    if(item.error||!item.data)return NextResponse.json({message:item.error?.message||"문항을 찾을 수 없습니다."},{status:404});
    if(item.data.answer_locked_at)return NextResponse.json({message:"이미 답안을 확정한 문항입니다."},{status:409});
    const revealedAt=item.data.revealed_at??new Date().toISOString();
    if(!item.data.revealed_at){
      const update=await supabase.from("sos_training_items").update({revealed_at:revealedAt}).eq("id",itemId);
      if(update.error)return NextResponse.json({message:update.error.message},{status:400});
      await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:itemId,student_id:student.id,event_type:"QUESTION_REVEALED",detail:{}});
    }
    return NextResponse.json({success:true,revealedAt});
  }

  if(action==="lock_answer"){
    if(String(session.phase)!=="DIAGNOSIS"||String(session.status)!=="IN_PROGRESS")
      return NextResponse.json({message:"진행 중인 진단에서만 답안을 확정할 수 있습니다."},{status:409});
    const itemId=String(body.itemId??"");
    const answer=String(body.answer??"").trim();
    if(!answer)return NextResponse.json({message:"답을 입력해 주세요."},{status:400});
    const item=await supabase.from("sos_training_items").select("id,revealed_at,answer_locked_at,student_answer").eq("id",itemId).eq("session_id",sessionId).single();
    if(item.error||!item.data)return NextResponse.json({message:item.error?.message||"문항을 찾을 수 없습니다."},{status:404});
    if(item.data.answer_locked_at)return NextResponse.json({message:"이미 확정한 답안입니다."},{status:409});
    if(!item.data.revealed_at)return NextResponse.json({message:"아직 공개되지 않은 문항입니다."},{status:409});
    const lockedAt=new Date();
    const seconds=Math.max(1,Math.round((lockedAt.getTime()-new Date(item.data.revealed_at).getTime())/1000));
    const update=await supabase.from("sos_training_items").update({student_answer:answer,response_seconds:seconds,answer_locked_at:lockedAt.toISOString(),answered_at:lockedAt.toISOString()}).eq("id",itemId);
    if(update.error)return NextResponse.json({message:update.error.message},{status:400});
    await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:itemId,student_id:student.id,event_type:"ANSWER_LOCKED",detail:{responseSeconds:seconds}});
    return NextResponse.json({success:true,responseSeconds:seconds,answerLockedAt:lockedAt.toISOString()});
  }

  if(action==="activity"){
    if(String(session.status)!=="IN_PROGRESS")return NextResponse.json({success:true,ignored:true});
    const itemId=String(body.itemId??"")||null;
    const eventType=String(body.eventType??"").slice(0,50);
    if(!["SCREEN_EXIT","SCREEN_RETURN"].includes(eventType))return NextResponse.json({message:"지원하지 않는 로그입니다."},{status:400});
    const detail=(body.detail&&typeof body.detail==="object")?body.detail:{};
    const log=await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:itemId,student_id:student.id,event_type:eventType,detail});
    if(log.error)return NextResponse.json({message:log.error.message},{status:400});
    if(eventType==="SCREEN_EXIT"&&itemId){
      const row=await supabase.from("sos_training_items").select("screen_exit_count").eq("id",itemId).eq("session_id",sessionId).single();
      if(!row.error&&row.data)await supabase.from("sos_training_items").update({screen_exit_count:Number(row.data.screen_exit_count??0)+1}).eq("id",itemId);
    }
    return NextResponse.json({success:true});
  }

  if(action==="save_training_item"){
    if(String(session.phase)!=="TRAINING"||String(session.status)!=="IN_PROGRESS")
      return NextResponse.json({message:"진행 중인 훈련에서만 저장할 수 있습니다."},{status:409});
    const itemId=String(body.itemId??"");
    const answer=String(body.answer??"").trim();
    const responseSeconds=Math.max(1,Math.round(Number(body.responseSeconds??0)||1));
    if(!itemId||!answer)return NextResponse.json({message:"문항과 답을 확인해 주세요."},{status:400});
    const update=await supabase.from("sos_training_items").update({student_answer:answer,response_seconds:responseSeconds,answered_at:new Date().toISOString()}).eq("id",itemId).eq("session_id",sessionId);
    if(update.error)return NextResponse.json({message:update.error.message},{status:400});
    await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:itemId,student_id:student.id,event_type:"TRAINING_ITEM_DONE",detail:{question:Number(body.question??0),responseSeconds}});
    return NextResponse.json({success:true});
  }

  if(action==="save_review_item"){
    if(!["DIAGNOSIS","TRAINING"].includes(String(session.phase))||String(session.status)!=="RETRAIN")
      return NextResponse.json({message:"오답 교정 진행 상태가 아닙니다."},{status:409});
    const itemId=String(body.itemId??"");
    const answer=String(body.answer??"").trim();
    const responseSeconds=Math.max(1,Math.round(Number(body.responseSeconds??0)||1));
    if(!itemId||!answer)return NextResponse.json({message:"오답 문항과 답을 확인해 주세요."},{status:400});
    const itemResult=await supabase.from("sos_training_items")
      .select("id,generated_problem,problem_bank_questions(id,title,subject,unit,topic,difficulty,answer)")
      .eq("id",itemId).eq("session_id",sessionId).single();
    if(itemResult.error||!itemResult.data)return NextResponse.json({message:itemResult.error?.message||"오답 문항을 찾을 수 없습니다."},{status:404});
    const row:any=itemResult.data;
    const bank:any=Array.isArray(row.problem_bank_questions)?row.problem_bank_questions[0]:row.problem_bank_questions;
    const generated:any=row.generated_problem??null;
    const correctAnswer=String(bank?.answer??generated?.answer??"").trim();
    const isCorrect=answerMatches(answer,correctAnswer);
    const priorLogs=await supabase.from("sos_training_activity_logs")
      .select("event_type")
      .eq("session_id",sessionId).eq("item_id",itemId)
      .in("event_type",["REVIEW_ITEM_RETRY_WRONG","REVIEW_ITEM_CORRECTED"]);
    const attemptNo=(priorLogs.data??[]).length+1;
    const update=await supabase.from("sos_training_items").update({review_answer:answer,review_is_correct:isCorrect,review_response_seconds:responseSeconds,review_answered_at:new Date().toISOString()}).eq("id",itemId).eq("session_id",sessionId);
    if(update.error)return NextResponse.json({message:update.error.message},{status:400});
    await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:itemId,student_id:student.id,event_type:isCorrect?"REVIEW_ITEM_CORRECTED":"REVIEW_ITEM_RETRY_WRONG",detail:{question:Number(body.question??0),responseSeconds,isCorrect,attemptNo}});
    if(isCorrect)return NextResponse.json({success:true,isCorrect:true,attemptNo,completed:true});

    if(attemptNo<=2){
      const hint=await generateReviewHint({
        problem:{title:bank?.title??generated?.topic,subject:bank?.subject??generated?.subject,unit:bank?.unit??generated?.subunit,topic:bank?.topic??generated?.topic,difficulty:bank?.difficulty??generated?.difficulty,generatedText:generated?.question},
        studentAnswer:answer,attempt:attemptNo,weakness:session.weakness_snapshot??session.target_snapshot
      });
      await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:itemId,student_id:student.id,event_type:"REVIEW_HINT_USED",detail:{question:Number(body.question??0),level:attemptNo,hint}});
      return NextResponse.json({success:true,isCorrect:false,attemptNo,hintLevel:attemptNo,hint,completed:false});
    }
    return NextResponse.json({success:true,isCorrect:false,attemptNo,revealAnswer:true,correctAnswer,solution:String(generated?.solution??""),completed:false});
  }

  if(action==="complete_review_explanation"){
    if(!["DIAGNOSIS","TRAINING"].includes(String(session.phase))||String(session.status)!=="RETRAIN")
      return NextResponse.json({message:"오답 교정 진행 상태가 아닙니다."},{status:409});
    const itemId=String(body.itemId??"");
    if(!itemId)return NextResponse.json({message:"오답 문항이 없습니다."},{status:400});
    await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:itemId,student_id:student.id,event_type:"REVIEW_ITEM_EXPLAINED",detail:{question:Number(body.question??0)}});
    return NextResponse.json({success:true,completed:true});
  }

  if(action==="submit_review"){
    if(!["DIAGNOSIS","TRAINING"].includes(String(session.phase))||String(session.status)!=="RETRAIN")
      return NextResponse.json({message:"오답 교정 진행 상태가 아닙니다."},{status:409});

    const reviewAnswers=(body.answers??{}) as Record<string,unknown>;
    const reviewSeconds=(body.responseSeconds??{}) as Record<string,unknown>;
    const itemsResult=await supabase.from("sos_training_items")
      .select("id,problem_id,is_correct,problem_meter_before,generated_problem,problem_bank_questions(answer)")
      .eq("session_id",sessionId).eq("is_correct",false).order("item_order");
    if(itemsResult.error)return NextResponse.json({message:itemsResult.error.message},{status:400});
    const wrongItems=itemsResult.data??[];

    if(String(session.cycle_kind)==="HOMEWORK"){
      const explanationLogs=await supabase.from("sos_training_activity_logs").select("item_id,event_type").eq("session_id",sessionId).eq("event_type","REVIEW_ITEM_EXPLAINED");
      const explained=new Set((explanationLogs.data??[]).map((l:any)=>String(l.item_id)));
      const reviewRows=await supabase.from("sos_training_items").select("id,review_is_correct").eq("session_id",sessionId).eq("is_correct",false);
      if(reviewRows.error)return NextResponse.json({message:reviewRows.error.message},{status:400});
      const unfinished=(reviewRows.data??[]).filter((r:any)=>r.review_is_correct!==true&&!explained.has(String(r.id)));
      if(unfinished.length)return NextResponse.json({message:`아직 교정하지 않은 숙제 오답이 ${unfinished.length}문항 있습니다.`},{status:400});
      const current=await currentTargetMeter(supabase,String(student.id),session);
      const update=await supabase.from("sos_training_sessions").update({status:"PASSED",decision:"HOMEWORK_DONE",review_meter:current,updated_at:new Date().toISOString()}).eq("id",sessionId);
      if(update.error)return NextResponse.json({message:update.error.message},{status:400});
      await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:null,student_id:student.id,event_type:"REVIEW_COMPLETED",detail:{phase:"HOMEWORK",corrected:(reviewRows.data??[]).filter((r:any)=>r.review_is_correct===true).length,total:(reviewRows.data??[]).length}});
      return NextResponse.json({success:true,phase:"TRAINING",status:"PASSED",decision:"HOMEWORK_DONE",homework:true,meter:current,goal:current,passed:true});
    }

    if(String(session.phase)==="DIAGNOSIS"){
      const explanationLogs=await supabase.from("sos_training_activity_logs").select("item_id,event_type").eq("session_id",sessionId).eq("event_type","REVIEW_ITEM_EXPLAINED");
      const explained=new Set((explanationLogs.data??[]).map((l:any)=>String(l.item_id)));
      const reviewRows=await supabase.from("sos_training_items").select("id,review_answer,review_is_correct").eq("session_id",sessionId).eq("is_correct",false);
      if(reviewRows.error)return NextResponse.json({message:reviewRows.error.message},{status:400});
      const unfinished=(reviewRows.data??[]).filter((r:any)=>r.review_is_correct!==true&&!explained.has(String(r.id)));
      if(unfinished.length)return NextResponse.json({message:`아직 교정하지 않은 진단 오답이 ${unfinished.length}문항 있습니다.`},{status:400});
      const update=await supabase.from("sos_training_sessions").update({status:"COMPLETED",decision:"AI_WEAKNESS_ANALYSIS",updated_at:new Date().toISOString()}).eq("id",sessionId);
      if(update.error)return NextResponse.json({message:update.error.message},{status:400});
      await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:null,student_id:student.id,event_type:"REVIEW_COMPLETED",detail:{phase:"DIAGNOSIS",corrected:(reviewRows.data??[]).filter((r:any)=>r.review_is_correct===true).length,total:(reviewRows.data??[]).length}});
      let ai:any=null;
      try{ai=await analyzeDiagnosisAndCreateFirstTraining({supabase,studentId:String(student.id),diagnosisSessionId:sessionId});}
      catch(error){ai={error:error instanceof Error?error.message:"AI 취약점 분석 실패"};}
      return NextResponse.json({success:true,phase:"DIAGNOSIS",status:"COMPLETED",ai,nextStep:ai?.created?"FIRST_TRAINING_ASSIGNED":ai?.nextStep??"AI_REVIEW_REQUIRED"});
    }

    if(!wrongItems.length){
      const meter=await currentTargetMeter(supabase,String(student.id),session);
      const goal=clampMeter(session.goal_meter,Number(session.baseline_meter)||meter);
      const passed=meter>=goal;
      let next:any=null;
      let finalStatus="COMPLETED";
      let decision="SECOND_TRAINING_DONE";
      if(Number(session.round_no)===1){
        if(passed){finalStatus="PASSED";decision="FIRST_TRAINING_PASSED";try{next=await generateSimilarTraining({supabase,studentId:String(student.id),firstTrainingSessionId:sessionId,count:3,kind:"HOMEWORK"});}catch(error){next={error:error instanceof Error?error.message:"유사문항 숙제 생성 실패"};}}
        else{decision="SECOND_TRAINING_REQUIRED";try{next=await generateSimilarTraining({supabase,studentId:String(student.id),firstTrainingSessionId:sessionId,count:10,kind:"SECOND_TRAINING"});}catch(error){next={error:error instanceof Error?error.message:"2차 유사훈련 생성 실패"};}}
      }else if(Number(session.round_no)===2){finalStatus=passed?"PASSED":"COMPLETED";decision=passed?"SECOND_TRAINING_PASSED":"SECOND_TRAINING_FINISHED_TARGET_MISSED";}
      await supabase.from("sos_training_sessions").update({status:finalStatus,decision,review_meter:meter,updated_at:new Date().toISOString()}).eq("id",sessionId);
      return NextResponse.json({success:true,recovered:0,total:0,reviewBonus:0,meter,goal,passed,status:finalStatus,decision,next});
    }

    let recovered=0;
    let bonusTotal=0;
    for(const item of wrongItems as any[]){
      const id=String(item.id);
      const answer=String(reviewAnswers[id]??"").trim();
      if(!answer)return NextResponse.json({message:"오답 문항을 모두 다시 풀어 주세요."},{status:400});
      const seconds=Math.max(1,Math.round(Number(reviewSeconds[id]??0)||1));
      const reviewBank:any=Array.isArray(item.problem_bank_questions)?item.problem_bank_questions[0]:item.problem_bank_questions;
      const correctAnswer=String(reviewBank?.answer??item.generated_problem?.answer??"");
      const ok=answerMatches(answer,correctAnswer);
      if(ok)recovered++;
      const b=reviewBonus({correct:ok,responseSeconds:seconds,problemMeter:Number(item.problem_meter_before??item.generated_problem?.meter??3)});
      bonusTotal+=b;
      const update=await supabase.from("sos_training_items").update({review_answer:answer,review_is_correct:ok,review_response_seconds:seconds,review_answered_at:new Date().toISOString()}).eq("id",id);
      if(update.error)return NextResponse.json({message:update.error.message},{status:400});
    }

    let meter=await currentTargetMeter(supabase,String(student.id),session);
    const cappedBonus=Math.min(0.05,Math.round(bonusTotal*1000)/1000);
    meter=clampMeter(meter+cappedBonus,meter);
    await setTargetMeter(supabase,String(student.id),session,meter);
    const goal=clampMeter(session.goal_meter,Number(session.baseline_meter)||meter);
    const passed=meter>=goal;

    let next:any=null;
    let finalStatus="COMPLETED";
    let decision="SECOND_TRAINING_DONE";
    if(Number(session.round_no)===1){
      if(passed){
        finalStatus="PASSED";decision="FIRST_TRAINING_PASSED";
        try{next=await generateSimilarTraining({supabase,studentId:String(student.id),firstTrainingSessionId:sessionId,count:3,kind:"HOMEWORK"});}
        catch(error){next={error:error instanceof Error?error.message:"유사문항 숙제 생성 실패"};}
      }else{
        finalStatus="COMPLETED";decision="SECOND_TRAINING_REQUIRED";
        try{next=await generateSimilarTraining({supabase,studentId:String(student.id),firstTrainingSessionId:sessionId,count:10,kind:"SECOND_TRAINING"});}
        catch(error){next={error:error instanceof Error?error.message:"2차 유사훈련 생성 실패"};}
      }
    }else if(Number(session.round_no)===2){
      finalStatus=passed?"PASSED":"COMPLETED";
      decision=passed?"SECOND_TRAINING_PASSED":"SECOND_TRAINING_FINISHED_TARGET_MISSED";
    }

    const sessionUpdate=await supabase.from("sos_training_sessions").update({status:finalStatus,decision,review_meter:meter,updated_at:new Date().toISOString()}).eq("id",sessionId);
    if(sessionUpdate.error)return NextResponse.json({message:sessionUpdate.error.message},{status:400});
    await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:null,student_id:student.id,event_type:"REVIEW_COMPLETED",detail:{recovered,total:wrongItems.length,meter,goal,passed,decision}});
    return NextResponse.json({success:true,recovered,total:wrongItems.length,reviewBonus:cappedBonus,meter,goal,passed,status:finalStatus,decision,next});
  }

  if(action==="submit"){
    if(["COMPLETED","PASSED"].includes(String(session.status)))
      return NextResponse.json({message:"이미 제출한 학습입니다."},{status:409});

    const answers=(body.answers??{}) as Record<string,unknown>;
    const seconds=(body.responseSeconds??{}) as Record<string,unknown>;

    const itemsResult=await supabase
      .from("sos_training_items")
      .select("id,item_order")
      .eq("session_id",sessionId)
      .order("item_order");

    if(itemsResult.error)return NextResponse.json({message:itemsResult.error.message},{status:400});
    const items=itemsResult.data??[];

    if(items.length!==Number(session.total_count))
      return NextResponse.json({message:`문항 구성이 올바르지 않습니다. ${items.length}/${session.total_count}`},{status:409});

    const fullItems=await supabase.from("sos_training_items").select("id,student_answer,response_seconds,solution_photo_path,answer_locked_at").eq("session_id",sessionId).order("item_order");
    if(fullItems.error)return NextResponse.json({message:fullItems.error.message},{status:400});
    const fullById=new Map<string,any>((fullItems.data??[]).map((x:any)=>[String(x.id),x] as [string,any]));
    const missing=items.filter((item:any)=>!String(answers[String(item.id)]??fullById.get(String(item.id))?.student_answer??"").trim());
    if(missing.length)return NextResponse.json({message:`미응답 ${missing.length}문항이 있습니다. 모두 답한 뒤 제출해 주세요.`},{status:400});
    if(String(session.phase)==="DIAGNOSIS"){
      const unlocked=items.filter((item:any)=>!fullById.get(String(item.id))?.answer_locked_at);
      if(unlocked.length)return NextResponse.json({message:"모든 진단 문항의 답안을 먼저 확정해 주세요."},{status:400});
      const noPhoto=items.filter((item:any)=>!fullById.get(String(item.id))?.solution_photo_path);
      if(noPhoto.length)return NextResponse.json({message:`풀이사진 미제출 ${noPhoto.length}문항이 있습니다.`},{status:400});
    }

    let correct=0;
    const results:any[]=[];

    // 문항 순서대로 반영해야 학생 미터가 다음 문항에 순차적으로 이어진다.
    for(const item of items as any[]){
      try{
        const result=await recordTrainingResult({
          supabase,
          studentId:String(student.id),
          itemId:String(item.id),
          studentAnswer:String(answers[String(item.id)]??fullById.get(String(item.id))?.student_answer??""),
          responseSeconds:Number(seconds[String(item.id)]??fullById.get(String(item.id))?.response_seconds??0)||null,
        });
        if(result.isCorrect)correct++;
        results.push({itemId:item.id,ok:true,...result});
      }catch(error){
        return NextResponse.json({
          message:error instanceof Error?error.message:"채점 중 오류가 발생했습니다.",
          processed:results.length,
        },{status:500});
      }
    }

    const total=items.length;
    const rate=total?Math.round(correct/total*100):0;
    const phase=String(session.phase);

    if(phase==="DIAGNOSIS"){
      const wrong=total-correct;
      const update=await supabase.from("sos_training_sessions").update({status:"RETRAIN",correct_count:correct,decision:wrong>0?"DIAGNOSIS_REVIEW_REQUIRED":"DIAGNOSIS_RESULT_REVIEW_READY",updated_at:new Date().toISOString()}).eq("id",sessionId);
      if(update.error)return NextResponse.json({message:update.error.message},{status:400});
      await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:null,student_id:student.id,event_type:"SESSION_SUBMITTED",detail:{phase,total,correct,rate,reviewRequired:wrong>0,reportReady:true}});
      return NextResponse.json({success:true,phase,status:"RETRAIN",correct,total,rate,decision:wrong>0?"DIAGNOSIS_REVIEW_REQUIRED":"DIAGNOSIS_RESULT_REVIEW_READY",results,wrongCount:wrong,nextStep:"REPORT"});
    }

    const meter=await currentTargetMeter(supabase,String(student.id),session);
    const goal=clampMeter(session.goal_meter,Number(session.baseline_meter)||meter);
    const wrong=total-correct;

    if(String(session.cycle_kind)==="HOMEWORK"){
      const update=await supabase.from("sos_training_sessions").update({status:"RETRAIN",correct_count:correct,decision:wrong>0?"HOMEWORK_REVIEW_REQUIRED":"HOMEWORK_RESULT_REVIEW_READY",training_meter:meter,updated_at:new Date().toISOString()}).eq("id",sessionId);
      if(update.error)return NextResponse.json({message:update.error.message},{status:400});
      await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:null,student_id:student.id,event_type:"SESSION_SUBMITTED",detail:{phase,total,correct,rate,homework:true,reviewRequired:wrong>0,reportReady:true}});
      return NextResponse.json({success:true,phase,status:"RETRAIN",correct,total,rate,decision:wrong>0?"HOMEWORK_REVIEW_REQUIRED":"HOMEWORK_RESULT_REVIEW_READY",results,meter,goal,homework:true,wrongCount:wrong,nextStep:"REPORT"});
    }

    // SOS225: 훈련 제출 뒤에는 정오답 수와 관계없이 성적표를 먼저 보여준다.
    // 오답이 있으면 X 문항을 교정하고, 전 문항 정답이면 성적표에서 바로 결과 확인으로 간다.
    {
      const update=await supabase.from("sos_training_sessions").update({
        status:"RETRAIN",
        correct_count:correct,
        decision:wrong>0?"REVIEW_REQUIRED":"RESULT_REVIEW_READY",
        training_meter:meter,
        updated_at:new Date().toISOString(),
      }).eq("id",sessionId);
      if(update.error)return NextResponse.json({message:update.error.message},{status:400});
      await supabase.from("sos_training_activity_logs").insert({session_id:sessionId,item_id:null,student_id:student.id,event_type:"SESSION_SUBMITTED",detail:{phase,total,correct,rate,meter,goal,reviewRequired:wrong>0,reportReady:true}});
      return NextResponse.json({success:true,phase,status:"RETRAIN",correct,total,rate,decision:wrong>0?"REVIEW_REQUIRED":"RESULT_REVIEW_READY",results,meter,goal,wrongCount:wrong,nextStep:"REPORT"});
    }

  }

  return NextResponse.json({message:"지원하지 않는 작업입니다."},{status:400});
}
