import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { recordTrainingResult } from "@/lib/sos-training-result";
import { autoCreateTrainingFromDiagnosis } from "@/lib/sos-auto-training";

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

export async function GET(){
  const ctx=await context();
  if("error" in ctx)return ctx.error;
  const {supabase,student}=ctx;

  const result=await supabase
    .from("sos_training_sessions")
    .select("id,phase,status,target_snapshot,parent_session_id,round_no,correct_count,total_count,decision,created_at,updated_at,sos_training_items(id,problem_id,item_order,item_role,student_answer,is_correct,response_seconds,subunit_key,student_meter_before,student_meter_after,problem_meter_before,problem_meter_after,problem_bank_questions(id,problem_code,title,subject,unit,topic,difficulty,difficulty_meter,question_image_path))")
    .eq("student_id",student.id)
    .in("status",["ASSIGNED","IN_PROGRESS","COMPLETED","PASSED","RETRAIN"])
    .order("created_at",{ascending:false});

  if(result.error)return NextResponse.json({message:result.error.message},{status:400});

  const sessions=await Promise.all((result.data??[]).map(async(session:any)=>{
    const items=await Promise.all((session.sos_training_items??[])
      .sort((a:any,b:any)=>Number(a.item_order)-Number(b.item_order))
      .map(async(item:any)=>{
        const problem=item.problem_bank_questions??{};
        return {
          id:item.id,
          problemId:item.problem_id,
          order:item.item_order,
          role:item.item_role,
          studentAnswer:item.student_answer??"",
          isCorrect:item.is_correct,
          responseSeconds:item.response_seconds,
          studentMeterBefore:item.student_meter_before,
          studentMeterAfter:item.student_meter_after,
          problemMeterBefore:item.problem_meter_before,
          problemMeterAfter:item.problem_meter_after,
          problem:{
            id:problem.id,
            code:problem.problem_code,
            title:problem.title,
            subject:problem.subject,
            unit:problem.unit,
            topic:problem.topic,
            difficulty:problem.difficulty,
            difficultyMeter:problem.difficulty_meter,
            imageUrl:await signedQuestionImage(supabase,problem.question_image_path),
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
    .select("id,student_id,phase,status,total_count")
    .eq("id",sessionId)
    .eq("student_id",student.id)
    .single();

  if(sessionResult.error||!sessionResult.data)
    return NextResponse.json({message:sessionResult.error?.message||"진단·훈련을 찾을 수 없습니다."},{status:404});

  const session:any=sessionResult.data;

  if(action==="start"){
    if(["COMPLETED","PASSED"].includes(String(session.status)))
      return NextResponse.json({message:"이미 완료한 학습입니다."},{status:409});

    const update=await supabase
      .from("sos_training_sessions")
      .update({status:"IN_PROGRESS",started_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      .eq("id",sessionId);

    return update.error
      ? NextResponse.json({message:update.error.message},{status:400})
      : NextResponse.json({success:true,status:"IN_PROGRESS"});
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

    const missing=items.filter((item:any)=>!String(answers[String(item.id)]??"").trim());
    if(missing.length)
      return NextResponse.json({message:`미응답 ${missing.length}문항이 있습니다. 모두 답한 뒤 제출해 주세요.`},{status:400});

    let correct=0;
    const results:any[]=[];

    // 문항 순서대로 반영해야 학생 미터가 다음 문항에 순차적으로 이어진다.
    for(const item of items as any[]){
      try{
        const result=await recordTrainingResult({
          supabase,
          studentId:String(student.id),
          itemId:String(item.id),
          studentAnswer:String(answers[String(item.id)]??""),
          responseSeconds:Number(seconds[String(item.id)]??0)||null,
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
    const decision=phase==="DIAGNOSIS"
      ? (correct===3?"TRAINING_UP":correct===2?"TRAINING_CURRENT":correct===1?"RECHECK":"TRAINING_DOWN")
      : (rate>=80?"PASSED":"RETRAIN");
    const status=phase==="TRAINING"&&rate>=80?"PASSED":"COMPLETED";

    const update=await supabase
      .from("sos_training_sessions")
      .update({
        status,
        correct_count:correct,
        decision,
        submitted_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      })
      .eq("id",sessionId);

    if(update.error)return NextResponse.json({message:update.error.message},{status:400});

    let autoTraining:any=null;
    let autoTrainingError="";
    if(phase==="DIAGNOSIS"){
      try{
        autoTraining=await autoCreateTrainingFromDiagnosis({
          supabase,
          studentId:String(student.id),
          diagnosisSessionId:sessionId,
        });
      }catch(error){
        autoTrainingError=error instanceof Error?error.message:"훈련 자동 생성 실패";
      }
    }

    return NextResponse.json({
      success:true,
      phase,
      status,
      correct,
      total,
      rate,
      decision,
      results,
      autoTraining,
      autoTrainingError,
    });
  }

  return NextResponse.json({message:"지원하지 않는 작업입니다."},{status:400});
}
