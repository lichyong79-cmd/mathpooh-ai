import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {getSessionUser} from "@/lib/supabase/auth";
async function admin(){const user=await getSessionUser();if(!user||["student","parent"].includes(user.user_metadata?.role))return null;return {supabase:createClient(),user};}
const missing=(m:string)=>m.includes("learning_cycles")||m.includes("learning_cycle_exams")?"먼저 supabase-v3.6-learning-cycles.sql을 Supabase SQL Editor에서 실행해 주세요.":m;
export async function GET(){
 const ctx=await admin();if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
 const [cycles,links,exams,attempts]=await Promise.all([
  ctx.supabase.from("learning_cycles").select("*").order("start_date",{ascending:false}),
  ctx.supabase.from("learning_cycle_exams").select("id,cycle_id,exam_id,linked_at"),
  ctx.supabase.from("exams").select("id,round,title,exam_date,grade,subject,status,question_count").order("exam_date",{ascending:false}),
  ctx.supabase.from("exam_attempts").select("exam_id,status")
 ]);
 const error=cycles.error||links.error||exams.error||attempts.error;if(error)return NextResponse.json({message:missing(error.message)},{status:400});
 const linkByExam=new Map<string,any>((links.data??[]).map((x:any)=>[String(x.exam_id),x]));const cycleById=new Map<string,any>((cycles.data??[]).map((x:any)=>[String(x.id),x]));
 const counts=new Map<string,{submitted:number,total:number}>();for(const a of attempts.data??[]){const k=String((a as any).exam_id);const c=counts.get(k)??{submitted:0,total:0};c.total++;if((a as any).status==="submitted")c.submitted++;counts.set(k,c);}
 const examRows=(exams.data??[]).map((e:any)=>{const l=linkByExam.get(String(e.id));return {...e,submittedCount:counts.get(String(e.id))?.submitted??0,attemptCount:counts.get(String(e.id))?.total??0,cycleId:l?.cycle_id??null,cycleName:l?cycleById.get(String(l.cycle_id))?.name??null:null};});
 const cycleRows=(cycles.data??[]).map((c:any)=>({...c,exams:examRows.filter((e:any)=>String(e.cycleId)===String(c.id))}));
 return NextResponse.json({cycles:cycleRows,exams:examRows},{headers:{"Cache-Control":"no-store,max-age=0"}});
}
export async function POST(request:Request){
 const ctx=await admin();if(!ctx)return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});const b=await request.json();const action=String(b.action??"");
 if(action==="create"){
  const name=String(b.name??"").trim(),start=String(b.startDate??""),end=String(b.endDate??"");if(!name||!start||!end)return NextResponse.json({message:"회차명과 시작일·종료일을 입력해 주세요."},{status:400});
  const q=await ctx.supabase.from("learning_cycles").insert({name,start_date:start,end_date:end,status:"ACTIVE",memo:String(b.memo??""),created_by:ctx.user.id}).select().single();return q.error?NextResponse.json({message:missing(q.error.message)},{status:400}):NextResponse.json({cycle:q.data});
 }
 if(action==="update"){
  const id=String(b.id??"");if(!id)return NextResponse.json({message:"회차를 선택해 주세요."},{status:400});const payload:any={updated_at:new Date().toISOString()};for(const [a,c] of [["name","name"],["startDate","start_date"],["endDate","end_date"],["status","status"],["memo","memo"]] as any[])if(b[a]!=null)payload[c]=b[a];const q=await ctx.supabase.from("learning_cycles").update(payload).eq("id",id).select().single();return q.error?NextResponse.json({message:missing(q.error.message)},{status:400}):NextResponse.json({cycle:q.data});
 }
 if(action==="assign-exam"){
  const cycleId=String(b.cycleId??""),examId=String(b.examId??"");if(!cycleId||!examId)return NextResponse.json({message:"회차와 시험을 선택해 주세요."},{status:400});
  const assignedAt=new Date().toISOString();const q=await ctx.supabase.from("learning_cycle_exams").upsert({cycle_id:cycleId,exam_id:examId,linked_at:assignedAt},{onConflict:"exam_id"});if(q.error)return NextResponse.json({message:missing(q.error.message)},{status:400});
  // SOS310: 시험지를 회차에 나중에 연결해도, 이 회차가 포함된 5회 묶음 등록 학생에게 즉시 배정한다.
  const batchLinks=await ctx.supabase.from("sos_program_batch_cycles").select("batch_id").eq("cycle_id",cycleId);if(!batchLinks.error){const batchIds=(batchLinks.data??[]).map((x:any)=>x.batch_id);if(batchIds.length){const enrolled=await ctx.supabase.from("sos_program_enrollments").select("student_id").in("batch_id",batchIds).eq("status","ACTIVE");const studentIds=[...new Set((enrolled.data??[]).map((x:any)=>String(x.student_id)))];if(studentIds.length)await ctx.supabase.from("exam_registrations").upsert(studentIds.map(studentId=>({exam_id:examId,student_id:studentId,status:"assigned",assigned_at:assignedAt})),{onConflict:"exam_id,student_id"});}}
  return NextResponse.json({success:true});
 }
 if(action==="unassign-exam"){
  const q=await ctx.supabase.from("learning_cycle_exams").delete().eq("exam_id",String(b.examId??""));return q.error?NextResponse.json({message:missing(q.error.message)},{status:400}):NextResponse.json({success:true});
 }
 return NextResponse.json({message:"지원하지 않는 작업입니다."},{status:400});
}
