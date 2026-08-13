import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

async function admin(){
  const user=await getSessionUser();
  if(!user||["student","parent"].includes(user.user_metadata?.role))return null;
  return {supabase:createClient()};
}

async function all(build:(from:number,to:number)=>any){
  const rows:any[]=[];
  for(let from=0;;from+=1000){
    const result=await build(from,from+999);
    if(result.error)throw result.error;
    const page=Array.isArray(result.data)?result.data:[];
    rows.push(...page);
    if(page.length<1000)break;
  }
  return rows;
}

async function signedUrl(supabase:any,bucket:string,path:any){
  if(!path)return "";
  const result=await supabase.storage.from(bucket).createSignedUrl(String(path),60*60);
  return result.data?.signedUrl??"";
}

export async function GET(){
  const ctx=await admin();
  if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  try{
    const [students,sessions,meters,activityLogs]=await Promise.all([
      all((f,t)=>ctx.supabase.from("students").select("id,name,school,grade,status").range(f,t)),
      all((f,t)=>ctx.supabase
        .from("sos_training_sessions")
        .select("id,student_id,phase,status,target_snapshot,weakness_snapshot,baseline_meter,goal_meter,training_meter,review_meter,cycle_kind,round_no,correct_count,total_count,decision,created_at,updated_at,sos_training_items(id,problem_id,item_order,student_answer,is_correct,response_seconds,answered_at,revealed_at,answer_locked_at,solution_photo_path,photo_submitted_at,photo_submit_seconds,screen_exit_count,generated_problem,review_answer,review_is_correct,review_response_seconds,review_answered_at,problem_bank_questions(id,problem_code,title,subject,unit,topic,difficulty,difficulty_meter,question_image_path,answer))")
        .order("created_at",{ascending:false}).range(f,t)),
      all((f,t)=>ctx.supabase
        .from("sos_student_subunit_meters")
        .select("student_id,subject,major_unit,subunit,subunit_key,difficulty_meter,sample_count,updated_at")
        .range(f,t)),
      all((f,t)=>ctx.supabase
        .from("sos_training_activity_logs")
        .select("id,session_id,item_id,event_type,detail,occurred_at")
        .order("occurred_at",{ascending:true}).range(f,t)),
    ]);

    const studentMap=new Map(students.map((s:any)=>[String(s.id),s]));
    const meterMap=new Map<string,any>();
    for(const m of meters)meterMap.set(`${m.student_id}:${m.subunit_key}`,m);
    const logMap=new Map<string,any[]>();
    for(const log of activityLogs){
      const key=String(log.session_id);
      const list=logMap.get(key)??[];
      list.push(log);logMap.set(key,list);
    }

    const rows=await Promise.all(sessions.map(async(session:any)=>{
      const rawItems=(session.sos_training_items??[]).sort((a:any,b:any)=>Number(a.item_order)-Number(b.item_order));
      const items=await Promise.all(rawItems.map(async(item:any)=>{
        const problem=Array.isArray(item.problem_bank_questions)?item.problem_bank_questions[0]:item.problem_bank_questions??null;
        const generated=item.generated_problem??null;
        return {
          id:item.id,
          order:Number(item.item_order??0),
          studentAnswer:String(item.student_answer??""),
          isCorrect:item.is_correct,
          responseSeconds:item.response_seconds===null||item.response_seconds===undefined?null:Number(item.response_seconds),
          answeredAt:item.answered_at,
          revealedAt:item.revealed_at,
          answerLockedAt:item.answer_locked_at,
          photoSubmittedAt:item.photo_submitted_at,
          photoSubmitSeconds:item.photo_submit_seconds===null||item.photo_submit_seconds===undefined?null:Number(item.photo_submit_seconds),
          screenExitCount:Number(item.screen_exit_count??0),
          reviewAnswer:String(item.review_answer??""),
          reviewIsCorrect:item.review_is_correct,
          reviewResponseSeconds:item.review_response_seconds===null||item.review_response_seconds===undefined?null:Number(item.review_response_seconds),
          reviewAnsweredAt:item.review_answered_at??null,
          solutionPhotoUrl:await signedUrl(ctx.supabase,"sos-solution-photos",item.solution_photo_path),
          generated:Boolean(generated),
          problem:{
            id:problem?.id??item.problem_id,
            code:String(problem?.problem_code??(generated?"AI-GENERATED":"")),
            title:String(problem?.title??generated?.topic??"AI 유사문항"),
            subject:String(problem?.subject??generated?.subject??""),
            unit:String(problem?.unit??generated?.subunit??""),
            topic:String(problem?.topic??generated?.topic??""),
            difficulty:String(problem?.difficulty??generated?.difficulty??""),
            difficultyMeter:problem?.difficulty_meter===null||problem?.difficulty_meter===undefined?(generated?.meter??null):Number(problem.difficulty_meter),
            correctAnswer:String(problem?.answer??generated?.answer??""),
            generatedText:String(generated?.question??""),
            generatedSolution:String(generated?.solution??""),
            imageUrl:problem?await signedUrl(ctx.supabase,"question-images",problem?.question_image_path):"",
          },
        };
      }));
      const answered=items.filter((i:any)=>String(i.studentAnswer??"").trim()||i.answeredAt).length;
      const correct=items.filter((i:any)=>i.isCorrect===true).length;
      const snapshot=session.target_snapshot??{};
      const key=String(snapshot.subunitKey??"");
      const currentMeter=meterMap.get(`${session.student_id}:${key}`)??null;
      const initialMeter=Number(snapshot.studentDifficultyMeter??0)||null;
      const currentValue=currentMeter?Number(currentMeter.difficulty_meter):null;
      const startedCandidates=items.map((i:any)=>i.revealedAt).filter(Boolean).map((v:any)=>new Date(v).getTime()).filter(Number.isFinite);
      const submittedCandidates=items.map((i:any)=>i.reviewAnsweredAt||i.photoSubmittedAt||i.answeredAt).filter(Boolean).map((v:any)=>new Date(v).getTime()).filter(Number.isFinite);
      return {
        id:session.id,
        student:studentMap.get(String(session.student_id))??null,
        phase:session.phase,
        status:session.status,
        roundNo:Number(session.round_no??1),
        subject:String(snapshot.subject??snapshot.sourceSubject??""),
        majorUnit:String(snapshot.majorUnit??""),
        subunit:String(snapshot.subunit??snapshot.sourceUnit??""),
        subunitKey:key,
        initialMeter,
        currentMeter:currentValue,
        meterDelta:initialMeter!==null&&currentValue!==null?Math.round((currentValue-initialMeter)*100)/100:null,
        total:Number(session.total_count??items.length),
        answered,
        correct:session.correct_count===null||session.correct_count===undefined?correct:Number(session.correct_count),
        decision:session.decision,
        weakness:session.weakness_snapshot??{},
        cycleKind:session.cycle_kind??"STANDARD",
        baselineMeter:session.baseline_meter===null||session.baseline_meter===undefined?null:Number(session.baseline_meter),
        goalMeter:session.goal_meter===null||session.goal_meter===undefined?null:Number(session.goal_meter),
        trainingMeter:session.training_meter===null||session.training_meter===undefined?null:Number(session.training_meter),
        reviewMeter:session.review_meter===null||session.review_meter===undefined?null:Number(session.review_meter),
        createdAt:session.created_at,
        startedAt:startedCandidates.length?new Date(Math.min(...startedCandidates)).toISOString():null,
        submittedAt:["COMPLETED","PASSED","RETRAIN"].includes(String(session.status))&&submittedCandidates.length?new Date(Math.max(...submittedCandidates)).toISOString():null,
        updatedAt:session.updated_at,
        logs:(logMap.get(String(session.id))??[]).map((log:any)=>({id:log.id,eventType:log.event_type,detail:log.detail??{},occurredAt:log.occurred_at,itemId:log.item_id??null})),
        items,
      };
    }));

    const active=rows.filter((r:any)=>["ASSIGNED","IN_PROGRESS","RETRAIN"].includes(String(r.status))).length;
    const inProgress=rows.filter((r:any)=>r.status==="IN_PROGRESS").length;
    const completed=rows.filter((r:any)=>["COMPLETED","PASSED","RETRAIN"].includes(String(r.status))).length;

    return NextResponse.json({
      success:true,
      rows,
      summary:{total:rows.length,active,inProgress,completed},
      serverTime:new Date().toISOString(),
    },{headers:{"Cache-Control":"no-store,max-age=0"}});
  }catch(error:any){
    const message = error?.message || error?.details || error?.hint || (typeof error === "string" ? error : "진행현황 조회 실패");
    console.error("[SOS_PROGRESS_GET]", error);
    return NextResponse.json({message},{status:500});
  }
}
