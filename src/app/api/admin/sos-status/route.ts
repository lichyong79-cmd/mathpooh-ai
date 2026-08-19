import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {getSessionUser} from "@/lib/supabase/auth";
import {cycleFromSnapshot,snapshotWithCycle} from "@/lib/sos-cycle";
import {sosStageLabel} from "@/lib/sos-week";
import {analyzeDiagnosisAndCreateFirstTraining,createAutomaticSecondDiagnosis} from "@/lib/sos-ai-training";
import {enqueueAiGeneration} from "@/lib/sos-ai-generation-queue";
async function admin(){const user=await getSessionUser();if(!user||["student","parent"].includes(user.user_metadata?.role))return null;return {supabase:createClient(),user};}

function isDone(s:any){return ["COMPLETED","PASSED"].includes(String(s?.status));}
function isOpen(s:any){return ["ASSIGNED","IN_PROGRESS","RETRAIN"].includes(String(s?.status));}
function expectedNextKind(s:any){
 if(!s||!isDone(s))return "";
 const phase=String(s.phase??"");const round=Number(s.round_no??1);const kind=String(s.cycle_kind??"STANDARD");
 if(phase==="DIAGNOSIS"){
  if(round===1&&String(s.decision)==="PERFECT_DIAGNOSIS_AUTO_NEXT")return "SECOND_DIAGNOSIS";
  if(round===2&&String(s.decision)==="NO_WEAKNESS_AFTER_SECOND_DIAGNOSIS")return "";
  return "FIRST_TRAINING";
 }
 if(phase==="TRAINING"&&kind!=="HOMEWORK"&&round===1){
  const rate=Number(s.total_count)>0?Number(s.correct_count??0)/Number(s.total_count):0;
  return String(s.decision)==="FIRST_TRAINING_PASSED"||rate>=0.9?"HOMEWORK":"SECOND_TRAINING";
 }
 return "";
}
function stageKind(s:any){
 if(String(s?.phase)==="DIAGNOSIS"&&Number(s?.round_no??1)===2)return "SECOND_DIAGNOSIS";
 if(String(s?.phase)==="TRAINING"&&String(s?.cycle_kind)==="HOMEWORK")return "HOMEWORK";
 if(String(s?.phase)==="TRAINING"&&Number(s?.round_no??1)===2)return "SECOND_TRAINING";
 if(String(s?.phase)==="TRAINING"&&Number(s?.round_no??1)===1)return "FIRST_TRAINING";
 return "FIRST_DIAGNOSIS";
}
function expectedNextLabel(kind:string){
 return kind==="SECOND_DIAGNOSIS"?"2차 진단":kind==="FIRST_TRAINING"?"1차 맞춤훈련":kind==="SECOND_TRAINING"?"2차 AI 유사훈련":kind==="HOMEWORK"?"3제 굳히기":"다음 학습";
}
async function fetchAllPages(build:(from:number,to:number)=>any){const rows:any[]=[];for(let from=0;;from+=1000){const result=await build(from,from+999);if(result.error)throw result.error;const page=Array.isArray(result.data)?result.data:[];rows.push(...page);if(page.length<1000)break;}return rows;}
export async function GET(){
 const ctx=await admin();if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
 const [students,sessions,cycles]=await Promise.all([
  fetchAllPages((f,t)=>ctx.supabase.from("students").select("id,name,school,grade,status").order("name").range(f,t)),
  fetchAllPages((f,t)=>ctx.supabase.from("sos_training_sessions").select("id,student_id,parent_session_id,phase,status,target_snapshot,weakness_snapshot,cycle_kind,round_no,correct_count,total_count,baseline_meter,goal_meter,training_meter,review_meter,created_at,updated_at,sos_training_items(id,student_answer,is_correct,answered_at,revealed_at,review_answered_at)").order("created_at",{ascending:false}).range(f,t)),
  fetchAllPages((f,t)=>ctx.supabase.from("learning_cycles").select("id,name,start_date,end_date,status").order("start_date",{ascending:false}).range(f,t))
 ]);
 const cycleRows:any[]=cycles??[];const raw:any[]=sessions??[];const studentMap=new Map((students??[]).map((x:any)=>[String(x.id),x]));
 // SOS265: 진행 화면과 동일한 규칙으로, 실제 진행 흔적이 없는 중복 미응시 세션만 조회에서 제외한다.
 const duplicateIds=new Set<string>();const duplicateGroups=new Map<string,any[]>();
 for(const session of raw){if(!session.parent_session_id)continue;const key=[session.student_id,session.parent_session_id,session.phase,session.round_no,session.cycle_kind??"STANDARD"].map(String).join("|");const group=duplicateGroups.get(key)??[];group.push(session);duplicateGroups.set(key,group);}
 for(const group of duplicateGroups.values()){if(group.length<2)continue;group.sort((a:any,b:any)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());const hasProgress=(x:any)=>String(x.status)!=="ASSIGNED"||(x.sos_training_items??[]).some((i:any)=>String(i.student_answer??"").trim()||i.answered_at||i.revealed_at||i.review_answered_at);const progressed=group.filter(hasProgress);const keep=progressed.length?progressed[0]:group[0];for(const x of group){if(String(x.id)!==String(keep.id)&&!hasProgress(x))duplicateIds.add(String(x.id));}}
 const filteredSessions:any[]=raw.filter((x:any)=>!duplicateIds.has(String(x.id)));const map=new Map(filteredSessions.map(x=>[String(x.id),x]));
 const rootOf=(s:any)=>{let cur=s;const seen=new Set<string>();while(cur?.parent_session_id&&!seen.has(String(cur.id))){seen.add(String(cur.id));const p=map.get(String(cur.parent_session_id));if(!p)break;cur=p;}return cur??s;};
 const groups=new Map<string,any>();for(const s of filteredSessions){const root:any=rootOf(s);const key=String(root.id);let g=groups.get(key);if(!g){const cycle=cycleFromSnapshot(root.target_snapshot);g={rootId:key,student:studentMap.get(String(root.student_id))??null,cycle,sourceExamTitle:String(root.target_snapshot?.sourceExamTitle??""),sourceExamId:root.target_snapshot?.sourceExamId??null,subject:String(root.target_snapshot?.subject??root.target_snapshot?.sourceSubject??""),subunit:String(root.target_snapshot?.subunit??root.target_snapshot?.sourceUnit??""),createdAt:root.created_at,sessions:[]};groups.set(key,g);}g.sessions.push(s);}
 const today=new Date().toISOString().slice(0,10);
 const result=[...groups.values()].map((g:any)=>{
  const ordered=g.sessions.slice().sort((a:any,b:any)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
  const stages=ordered.map((s:any)=>({id:s.id,label:sosStageLabel(s),phase:s.phase,roundNo:Number(s.round_no??1),cycleKind:s.cycle_kind??"STANDARD",status:s.status,correct:Number(s.correct_count??0),total:Number(s.total_count??0),answered:(s.sos_training_items??[]).filter((i:any)=>String(i.student_answer??"").trim()||i.answered_at).length}));
  const openSession=ordered.find((x:any)=>isOpen(x));
  const lastDone=[...ordered].reverse().find((x:any)=>isDone(x))??null;
  const expected=lastDone?expectedNextKind(lastDone):"";
  const expectedExists=expected?ordered.some((x:any)=>stageKind(x)===expected):false;
  const needsRecovery=Boolean(!openSession&&expected&&!expectedExists);
  const past=Boolean(g.cycle?.endDate&&g.cycle.endDate<today);
  const status=openSession||needsRecovery?(past?"BACKLOG":"IN_PROGRESS"):(stages.length>0?"COMPLETED":"WAITING");
  const currentStage=openSession?stages.find((x:any)=>String(x.id)===String(openSession.id)):(needsRecovery?{id:String(lastDone?.id??""),label:`${expectedNextLabel(expected)} 준비 필요`,status:"MISSING_NEXT",correct:Number(lastDone?.correct_count??0),total:Number(lastDone?.total_count??0)}:stages[stages.length-1]??null);
  return {...g,stages,status,currentStage,needsRecovery,expectedNextKind:expected,expectedNextLabel:needsRecovery?expectedNextLabel(expected):"",recoverySourceId:needsRecovery?String(lastDone?.id??""):""};
 }).sort((a:any,b:any)=>String(b.cycle?.startDate??b.createdAt).localeCompare(String(a.cycle?.startDate??a.createdAt))||String(a.student?.name??"").localeCompare(String(b.student?.name??""),"ko"));
 return NextResponse.json({success:true,cycles:result,learningCycles:cycleRows,summary:{students:new Set(result.map((x:any)=>String(x.student?.id??""))).size,cycles:result.length,active:result.filter((x:any)=>x.status==="IN_PROGRESS").length,backlog:result.filter((x:any)=>x.status==="BACKLOG").length,completed:result.filter((x:any)=>x.status==="COMPLETED").length,unassigned:result.filter((x:any)=>!x.cycle).length}},{headers:{"Cache-Control":"no-store,max-age=0"}});
}
export async function POST(request:Request){
 const ctx=await admin();if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});const body=await request.json();const action=String(body.action??"");
 if(action==="repair-next"){
  const sessionId=String(body.sessionId??"");if(!sessionId)return NextResponse.json({message:"복구할 학습 단계가 없습니다."},{status:400});
  const sr=await ctx.supabase.from("sos_training_sessions").select("id,student_id,phase,status,total_count,correct_count,decision,round_no,target_snapshot,weakness_snapshot,baseline_meter,goal_meter,cycle_kind,parent_session_id").eq("id",sessionId).maybeSingle();
  if(sr.error||!sr.data)return NextResponse.json({message:sr.error?.message||"학습 단계를 찾지 못했습니다."},{status:404});
  const session:any=sr.data;if(!isDone(session))return NextResponse.json({message:"완료된 단계만 다음 학습을 복구할 수 있습니다."},{status:409});
  try{
   const kind=expectedNextKind(session);
   if(!kind)return NextResponse.json({success:true,message:"이미 최종 완료 상태입니다."});
   if(kind==="SECOND_DIAGNOSIS"){const next=await createAutomaticSecondDiagnosis({supabase:ctx.supabase,studentId:String(session.student_id),parentDiagnosis:session});return NextResponse.json({success:true,next,kind});}
   if(kind==="FIRST_TRAINING"){const next=await analyzeDiagnosisAndCreateFirstTraining({supabase:ctx.supabase,studentId:String(session.student_id),diagnosisSessionId:String(session.id)});return NextResponse.json({success:true,next,kind});}
   if(kind==="HOMEWORK"||kind==="SECOND_TRAINING"){const queued=await enqueueAiGeneration({supabase:ctx.supabase,studentId:String(session.student_id),sourceTrainingSessionId:String(session.id),count:kind==="HOMEWORK"?3:10,kind});return NextResponse.json({success:true,queued:true,job:queued.job,kind});}
   return NextResponse.json({message:"복구할 다음 단계를 판단하지 못했습니다."},{status:409});
  }catch(error){return NextResponse.json({message:error instanceof Error?error.message:"다음 단계 복구 실패"},{status:500});}
 }
 if(action!=="reassign-cycle")return NextResponse.json({message:"지원하지 않는 작업입니다."},{status:400});
 const rootId=String(body.rootId??""),cycleId=String(body.cycleId??"");if(!rootId||!cycleId)return NextResponse.json({message:"SOS와 회차를 선택해 주세요."},{status:400});
 const [sessionRows,cycle]=await Promise.all([fetchAllPages((f,t)=>ctx.supabase.from("sos_training_sessions").select("id,parent_session_id,target_snapshot").range(f,t)),ctx.supabase.from("learning_cycles").select("id,name,start_date,end_date").eq("id",cycleId).maybeSingle()]);if(cycle.error||!cycle.data)return NextResponse.json({message:cycle.error?.message||"회차를 찾지 못했습니다."},{status:400});
 const rows:any[]=sessionRows??[];const descendants=new Set<string>([rootId]);let changed=true;while(changed){changed=false;for(const s of rows){if(s.parent_session_id&&descendants.has(String(s.parent_session_id))&&!descendants.has(String(s.id))){descendants.add(String(s.id));changed=true;}}}
 for(const id of descendants){const row=rows.find(x=>String(x.id)===id);if(!row)continue;const q=await ctx.supabase.from("sos_training_sessions").update({target_snapshot:snapshotWithCycle(row.target_snapshot??{},cycle.data),updated_at:new Date().toISOString()}).eq("id",id);if(q.error)return NextResponse.json({message:q.error.message},{status:400});}
 return NextResponse.json({success:true,updated:descendants.size,cycle:cycle.data});
}
