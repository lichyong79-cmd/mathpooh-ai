import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {getSessionUser} from "@/lib/supabase/auth";

async function admin(){const user=await getSessionUser();if(!user||["student","parent"].includes(user.user_metadata?.role))return null;return {supabase:createClient()};}
async function all(build:(from:number,to:number)=>any){const rows:any[]=[];for(let from=0;;from+=1000){const result=await build(from,from+999);if(result.error)throw result.error;const page=Array.isArray(result.data)?result.data:[];rows.push(...page);if(page.length<1000)break;}return rows;}
async function signedUrl(supabase:any,bucket:string,path:any){if(!path)return "";const result=await supabase.storage.from(bucket).createSignedUrl(String(path),60*60);return result.data?.signedUrl??"";}

export async function GET(request:Request){
 const ctx=await admin();if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
 try{
  const detailId=new URL(request.url).searchParams.get("sessionId");
  if(detailId){
   const s=await ctx.supabase.from("sos_training_sessions").select("id,student_id,parent_session_id,phase,status,target_snapshot,weakness_snapshot,baseline_meter,goal_meter,training_meter,review_meter,cycle_kind,round_no,correct_count,total_count,decision,created_at,updated_at,sos_training_items(id,problem_id,item_order,student_answer,is_correct,response_seconds,answered_at,revealed_at,answer_locked_at,solution_photo_path,photo_submitted_at,photo_submit_seconds,screen_exit_count,generated_problem,review_answer,review_is_correct,review_response_seconds,review_answered_at,problem_bank_questions(id,problem_code,title,subject,unit,topic,difficulty,difficulty_meter,question_image_path,answer))").eq("id",detailId).maybeSingle();
   if(s.error||!s.data)return NextResponse.json({message:s.error?.message||"단계 상세를 찾을 수 없습니다."},{status:404});
   const [student,logs,resets]=await Promise.all([
    ctx.supabase.from("students").select("id,name,school,grade,status").eq("id",s.data.student_id).maybeSingle(),
    ctx.supabase.from("sos_training_activity_logs").select("id,session_id,item_id,event_type,detail,occurred_at").eq("session_id",detailId).order("occurred_at",{ascending:true}),
    ctx.supabase.from("sos_admin_reset_logs").select("id,target_session_id,reset_scope,admin_email,detail,created_at").eq("target_session_id",detailId).order("created_at",{ascending:true}),
   ]);
   if(student.error)throw student.error;if(logs.error)throw logs.error;if(resets.error)throw resets.error;
   const logRows=logs.data??[];const rawItems=(s.data.sos_training_items??[]).sort((a:any,b:any)=>Number(a.item_order)-Number(b.item_order));
   const items=await Promise.all(rawItems.map(async(item:any)=>{const problem=Array.isArray(item.problem_bank_questions)?item.problem_bank_questions[0]:item.problem_bank_questions??null;const generated=item.generated_problem??null;const itemLogs=logRows.filter((l:any)=>String(l.item_id)===String(item.id));return {id:item.id,order:Number(item.item_order??0),studentAnswer:String(item.student_answer??""),isCorrect:item.is_correct,responseSeconds:item.response_seconds==null?null:Number(item.response_seconds),answeredAt:item.answered_at,revealedAt:item.revealed_at,answerLockedAt:item.answer_locked_at,photoSubmittedAt:item.photo_submitted_at,photoSubmitSeconds:item.photo_submit_seconds==null?null:Number(item.photo_submit_seconds),screenExitCount:Number(item.screen_exit_count??0),reviewAnswer:String(item.review_answer??""),reviewIsCorrect:item.review_is_correct,reviewResponseSeconds:item.review_response_seconds==null?null:Number(item.review_response_seconds),reviewAnsweredAt:item.review_answered_at??null,reviewAttemptCount:itemLogs.filter((l:any)=>["REVIEW_ITEM_RETRY_WRONG","REVIEW_ITEM_CORRECTED"].includes(String(l.event_type))).length,reviewHints:itemLogs.filter((l:any)=>String(l.event_type)==="REVIEW_HINT_USED").map((l:any)=>({level:Number(l.detail?.level??0),hint:String(l.detail?.hint??""),occurredAt:l.occurred_at})),reviewExplained:itemLogs.some((l:any)=>String(l.event_type)==="REVIEW_ITEM_EXPLAINED"),solutionPhotoUrl:await signedUrl(ctx.supabase,"sos-solution-photos",item.solution_photo_path),generated:Boolean(generated),problem:{id:problem?.id??item.problem_id,code:String(problem?.problem_code??(generated?"AI-GENERATED":"")),title:String(problem?.title??generated?.topic??"AI 유사문항"),subject:String(problem?.subject??generated?.subject??""),unit:String(problem?.unit??generated?.subunit??""),topic:String(problem?.topic??generated?.topic??""),difficulty:String(problem?.difficulty??generated?.difficulty??""),difficultyMeter:problem?.difficulty_meter==null?(generated?.meter??null):Number(problem.difficulty_meter),correctAnswer:String(problem?.answer??generated?.answer??""),generatedText:String(generated?.question??""),generatedSolution:String(generated?.solution??""),imageUrl:problem?await signedUrl(ctx.supabase,"question-images",problem?.question_image_path):""}};}));
   const resetLogs=(resets.data??[]).map((log:any)=>({id:`admin-reset-${log.id}`,eventType:"ADMIN_RESET",detail:{scope:log.reset_scope,adminEmail:log.admin_email,...(log.detail??{})},occurredAt:log.created_at,itemId:null}));
   const activity=logRows.map((log:any)=>({id:log.id,eventType:log.event_type,detail:log.detail??{},occurredAt:log.occurred_at,itemId:log.item_id??null}));
   return NextResponse.json({success:true,detail:{items,logs:[...activity,...resetLogs].sort((a:any,b:any)=>new Date(a.occurredAt).getTime()-new Date(b.occurredAt).getTime())}});
  }

  const [students,sessions]=await Promise.all([
   all((f,t)=>ctx.supabase.from("students").select("id,name,school,grade,status").range(f,t)),
   all((f,t)=>ctx.supabase.from("sos_training_sessions").select("id,student_id,parent_session_id,phase,status,target_snapshot,weakness_snapshot,baseline_meter,goal_meter,training_meter,review_meter,cycle_kind,round_no,correct_count,total_count,decision,created_at,updated_at,sos_training_items(id,student_answer,is_correct,answered_at,revealed_at,review_answered_at)").order("created_at",{ascending:false}).range(f,t)),
  ]);
  const studentMap=new Map(students.map((s:any)=>[String(s.id),s]));

  // SOS237: 같은 부모/단계에서 레이스로 생긴 미응시 복제 세션을 관리자 조회 시 안전하게 정리한다.
  // 실제 답안/공개/진행 흔적이 있는 세션은 절대 자동 삭제하지 않는다.
  const duplicateDeleteIds:string[]=[];
  const duplicateGroups=new Map<string,any[]>();
  for(const session of sessions as any[]){
    if(!session.parent_session_id)continue;
    const key=[session.student_id,session.parent_session_id,session.phase,session.round_no,session.cycle_kind??"STANDARD"].map(String).join("|");
    const group=duplicateGroups.get(key)??[];group.push(session);duplicateGroups.set(key,group);
  }
  for(const group of duplicateGroups.values()){
    if(group.length<2)continue;
    group.sort((a:any,b:any)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
    const hasProgress=(x:any)=>String(x.status)!=="ASSIGNED"||(x.sos_training_items??[]).some((i:any)=>String(i.student_answer??"").trim()||i.answered_at||i.revealed_at||i.review_answered_at);
    const progressed=group.filter(hasProgress);
    const keep=progressed.length?progressed[0]:group[0];
    for(const x of group){if(String(x.id)!==String(keep.id)&&!hasProgress(x))duplicateDeleteIds.push(String(x.id));}
  }
  if(duplicateDeleteIds.length){
    const logDelete=await ctx.supabase.from("sos_training_activity_logs").delete().in("session_id",duplicateDeleteIds);if(logDelete.error)throw logDelete.error;
    const itemDelete=await ctx.supabase.from("sos_training_items").delete().in("session_id",duplicateDeleteIds);if(itemDelete.error)throw itemDelete.error;
    const sessionDelete=await ctx.supabase.from("sos_training_sessions").delete().in("id",duplicateDeleteIds);if(sessionDelete.error)throw sessionDelete.error;
    console.info("[SOS237_DUPLICATE_SESSION_CLEANUP]",duplicateDeleteIds);
  }
  const visibleSessions=(sessions as any[]).filter((x:any)=>!duplicateDeleteIds.includes(String(x.id)));
  const rows=visibleSessions.map((session:any)=>{const items=(session.sos_training_items??[]).sort((a:any,b:any)=>Number(a.item_order)-Number(b.item_order));const answered=items.filter((i:any)=>String(i.student_answer??"").trim()||i.answered_at).length;const correct=items.filter((i:any)=>i.is_correct===true).length;const wrong=items.filter((i:any)=>i.is_correct===false).length;const snapshot=session.target_snapshot??{};const started=items.map((i:any)=>i.revealed_at).filter(Boolean).map((v:any)=>new Date(v).getTime()).filter(Number.isFinite);const ended=items.map((i:any)=>i.review_answered_at||i.answered_at).filter(Boolean).map((v:any)=>new Date(v).getTime()).filter(Number.isFinite);return {id:session.id,student:studentMap.get(String(session.student_id))??null,phase:session.phase,status:session.status,parentSessionId:session.parent_session_id??null,roundNo:Number(session.round_no??1),subject:String(snapshot.subject??snapshot.sourceSubject??""),majorUnit:String(snapshot.majorUnit??""),subunit:String(snapshot.subunit??snapshot.sourceUnit??""),subunitKey:String(snapshot.subunitKey??""),total:Number(session.total_count??items.length),answered,correct:session.correct_count==null?correct:Number(session.correct_count),wrongCount:wrong,decision:session.decision,weakness:session.weakness_snapshot??{},cycleKind:session.cycle_kind??"STANDARD",baselineMeter:session.baseline_meter==null?null:Number(session.baseline_meter),goalMeter:session.goal_meter==null?null:Number(session.goal_meter),trainingMeter:session.training_meter==null?null:Number(session.training_meter),reviewMeter:session.review_meter==null?null:Number(session.review_meter),createdAt:session.created_at,startedAt:started.length?new Date(Math.min(...started)).toISOString():null,submittedAt:["COMPLETED","PASSED","RETRAIN"].includes(String(session.status))&&ended.length?new Date(Math.max(...ended)).toISOString():null,updatedAt:session.updated_at,items:[],logs:[]};});
  const active=rows.filter((r:any)=>["ASSIGNED","IN_PROGRESS","RETRAIN"].includes(String(r.status))).length;const inProgress=rows.filter((r:any)=>r.status==="IN_PROGRESS").length;const completed=rows.filter((r:any)=>["COMPLETED","PASSED"].includes(String(r.status))).length;
  return NextResponse.json({success:true,rows,summary:{total:rows.length,active,inProgress,completed},serverTime:new Date().toISOString()},{headers:{"Cache-Control":"no-store,max-age=0"}});
 }catch(error:any){console.error("[SOS_PROGRESS_GET]",error);return NextResponse.json({message:error?.message||"진행현황 조회 실패"},{status:500});}
}
