import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {getSessionUser} from "@/lib/supabase/auth";
import {getSosCalendarWeek,snapshotWithWeek,sosStageLabel,weekFromSnapshot} from "@/lib/sos-week";

async function admin(){const user=await getSessionUser();if(!user||["student","parent"].includes(user.user_metadata?.role))return null;return {supabase:createClient(),user};}
const active=(s:any)=>["ASSIGNED","IN_PROGRESS","RETRAIN"].includes(String(s?.status));
export async function GET(){
 const ctx=await admin();if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
 const [students,sessions]=await Promise.all([
  ctx.supabase.from("students").select("id,name,school,grade,status").order("name"),
  ctx.supabase.from("sos_training_sessions").select("id,student_id,parent_session_id,phase,status,target_snapshot,weakness_snapshot,cycle_kind,round_no,correct_count,total_count,baseline_meter,goal_meter,training_meter,review_meter,created_at,updated_at,sos_training_items(id,student_answer,is_correct,answered_at,review_answered_at)").order("created_at",{ascending:false})
 ]);
 if(students.error||sessions.error)return NextResponse.json({message:students.error?.message||sessions.error?.message},{status:400});
 const all:any[]=sessions.data??[];const map=new Map(all.map(x=>[String(x.id),x]));const studentMap=new Map((students.data??[]).map((x:any)=>[String(x.id),x]));
 const rootOf=(s:any)=>{let cur=s;const seen=new Set<string>();while(cur?.parent_session_id&&!seen.has(String(cur.id))){seen.add(String(cur.id));const p=map.get(String(cur.parent_session_id));if(!p)break;cur=p;}return cur??s;};
 const groups=new Map<string,any>();
 for(const s of all){const root:any=rootOf(s);const key=String(root.id);let g=groups.get(key);if(!g){const week=weekFromSnapshot(root.target_snapshot,root.created_at);g={rootId:key,student:studentMap.get(String(root.student_id))??null,week,sourceExamTitle:String(root.target_snapshot?.sourceExamTitle??""),sourceExamId:root.target_snapshot?.sourceExamId??null,subject:String(root.target_snapshot?.subject??root.target_snapshot?.sourceSubject??""),subunit:String(root.target_snapshot?.subunit??root.target_snapshot?.sourceUnit??""),createdAt:root.created_at,sessions:[]};groups.set(key,g);}g.sessions.push(s);}
 const current=getSosCalendarWeek(new Date());
 const cycles=[...groups.values()].map((g:any)=>{const stages=g.sessions.slice().sort((a:any,b:any)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()).map((s:any)=>({id:s.id,label:sosStageLabel(s),phase:s.phase,roundNo:Number(s.round_no??1),cycleKind:s.cycle_kind??"STANDARD",status:s.status,correct:Number(s.correct_count??0),total:Number(s.total_count??0),answered:(s.sos_training_items??[]).filter((i:any)=>String(i.student_answer??"").trim()||i.answered_at).length}));const open=stages.find((x:any)=>["ASSIGNED","IN_PROGRESS","RETRAIN"].includes(String(x.status)));const done=!open&&stages.length>0;const past=String(g.week.end)<current.start;return {...g,stages,status:open?(past?"BACKLOG":"IN_PROGRESS"):done?"COMPLETED":"WAITING",currentStage:open??stages[stages.length-1]??null};}).sort((a:any,b:any)=>String(b.week.start).localeCompare(String(a.week.start))||String(a.student?.name??"").localeCompare(String(b.student?.name??""),"ko"));
 return NextResponse.json({success:true,currentWeek:current,cycles,summary:{students:new Set(cycles.map((x:any)=>String(x.student?.id??""))).size,cycles:cycles.length,active:cycles.filter((x:any)=>x.status==="IN_PROGRESS").length,backlog:cycles.filter((x:any)=>x.status==="BACKLOG").length,completed:cycles.filter((x:any)=>x.status==="COMPLETED").length}},{headers:{"Cache-Control":"no-store,max-age=0"}});
}

export async function POST(request:Request){
 const ctx=await admin();if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
 const body=await request.json();if(String(body.action)!=="reassign-week")return NextResponse.json({message:"지원하지 않는 작업입니다."},{status:400});
 const rootId=String(body.rootId??"");const week=getSosCalendarWeek(String(body.weekStart??""));if(!rootId)return NextResponse.json({message:"SOS 사이클을 선택해 주세요."},{status:400});
 const all=await ctx.supabase.from("sos_training_sessions").select("id,parent_session_id,target_snapshot");if(all.error)return NextResponse.json({message:all.error.message},{status:400});
 const rows:any[]=all.data??[];const descendants=new Set<string>([rootId]);let changed=true;while(changed){changed=false;for(const s of rows){if(s.parent_session_id&&descendants.has(String(s.parent_session_id))&&!descendants.has(String(s.id))){descendants.add(String(s.id));changed=true;}}}
 for(const id of descendants){const row=rows.find(x=>String(x.id)===id);if(!row)continue;const update=await ctx.supabase.from("sos_training_sessions").update({target_snapshot:snapshotWithWeek(row.target_snapshot??{},week),updated_at:new Date().toISOString()}).eq("id",id);if(update.error)return NextResponse.json({message:update.error.message},{status:400});}
 return NextResponse.json({success:true,updated:descendants.size,week});
}
