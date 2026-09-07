import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {getSessionUser} from "@/lib/supabase/auth";
async function admin(){const user=await getSessionUser();if(!user||["student","parent"].includes(user.user_metadata?.role))return null;return {supabase:createClient(),user};}
const missing=(m:string)=>m.includes("sos_program_cycle_enrollments")?"먼저 supabase-sos336-student-cycle-enrollments.sql을 Supabase SQL Editor에서 실행해 주세요.":m.includes("learning_cycles")||m.includes("learning_cycle_exams")?"먼저 supabase-v3.6-learning-cycles.sql을 Supabase SQL Editor에서 실행해 주세요.":m;
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

 if(action==="delete"){
  const id=String(b.id??"");if(!id)return NextResponse.json({message:"회차를 선택해 주세요."},{status:400});
  const [examLinks,batchLinks]=await Promise.all([
   ctx.supabase.from("learning_cycle_exams").select("id",{count:"exact",head:true}).eq("cycle_id",id),
   ctx.supabase.from("sos_program_batch_cycles").select("batch_id",{count:"exact",head:true}).eq("cycle_id",id)
  ]);
  if(examLinks.error||batchLinks.error)return NextResponse.json({message:examLinks.error?.message||batchLinks.error?.message||"회차 사용 여부를 확인하지 못했습니다."},{status:400});
  if((examLinks.count??0)>0)return NextResponse.json({message:"이 회차에 배치된 시험이 있습니다. 먼저 시험을 회차에서 빼 주세요."},{status:409});
  if((batchLinks.count??0)>0)return NextResponse.json({message:"이 회차가 SOS 5회 프로그램에 포함되어 있습니다. 먼저 5회 프로그램의 회차 구성을 수정해 주세요."},{status:409});
  const q=await ctx.supabase.from("learning_cycles").delete().eq("id",id);return q.error?NextResponse.json({message:missing(q.error.message)},{status:400}):NextResponse.json({success:true});
 }
 if(action==="assign-exam"){
  const cycleId=String(b.cycleId??""),examId=String(b.examId??"");if(!cycleId||!examId)return NextResponse.json({message:"회차와 시험을 선택해 주세요."},{status:400});
  const assignedAt=new Date().toISOString();const q=await ctx.supabase.from("learning_cycle_exams").upsert({cycle_id:cycleId,exam_id:examId,linked_at:assignedAt},{onConflict:"exam_id"});if(q.error)return NextResponse.json({message:missing(q.error.message)},{status:400});
  // SOS336: 회차에 시험지를 나중에 연결해도, 이 회차에 등록된 학생에게 즉시 배정한다.
  const enrolled=await ctx.supabase.from("sos_program_cycle_enrollments").select("student_id").eq("cycle_id",cycleId).eq("status","ACTIVE");
  if(enrolled.error)return NextResponse.json({message:missing(enrolled.error.message)},{status:400});
  const studentIds=[...new Set((enrolled.data??[]).map((x:any)=>String(x.student_id)).filter(Boolean))];
  if(studentIds.length){const synced=await ctx.supabase.from("exam_registrations").upsert(studentIds.map(studentId=>({exam_id:examId,student_id:studentId,status:"assigned",assigned_at:assignedAt})),{onConflict:"exam_id,student_id"});if(synced.error)return NextResponse.json({message:`회차 학생 시험 배정 실패: ${synced.error.message}`},{status:400});}
  return NextResponse.json({success:true});
 }
 if(action==="unassign-exam"){
  const examId=String(b.examId??"");
  const link=await ctx.supabase.from("learning_cycle_exams").select("cycle_id").eq("exam_id",examId).maybeSingle();
  if(link.error)return NextResponse.json({message:missing(link.error.message)},{status:400});
  if(link.data){const enrolled=await ctx.supabase.from("sos_program_cycle_enrollments").select("student_id").eq("cycle_id",link.data.cycle_id).eq("status","ACTIVE");if(enrolled.error)return NextResponse.json({message:missing(enrolled.error.message)},{status:400});const studentIds=[...new Set((enrolled.data??[]).map((x:any)=>String(x.student_id)))];if(studentIds.length){const attempts=await ctx.supabase.from("exam_attempts").select("student_id").eq("exam_id",examId).in("student_id",studentIds);if(attempts.error)return NextResponse.json({message:attempts.error.message},{status:400});const attempted=new Set((attempts.data??[]).map((x:any)=>String(x.student_id)));const removable=studentIds.filter((id:string)=>!attempted.has(id));if(removable.length){const unregistered=await ctx.supabase.from("exam_registrations").delete().eq("exam_id",examId).in("student_id",removable);if(unregistered.error)return NextResponse.json({message:unregistered.error.message},{status:400});}}}
  const q=await ctx.supabase.from("learning_cycle_exams").delete().eq("exam_id",examId);return q.error?NextResponse.json({message:missing(q.error.message)},{status:400}):NextResponse.json({success:true});
 }
 return NextResponse.json({message:"지원하지 않는 작업입니다."},{status:400});
}
