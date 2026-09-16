import { isArchivedPracticeCycle, isArchivedPracticeExam, isArchivedPracticeSession } from "@/lib/archived-practice-exams";
import { nextExamSequence, priorLearningPassed } from "@/lib/exam-flow";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { SOS_SCOPE_CODES, isSosCyclePassed } from "@/lib/sos-program-flow";

export const dynamic = "force-dynamic";
function fail(error: unknown) {
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
  return NextResponse.json({message: typeof error === "object" && error && "code" in error && error.code === "23505" ? "이미 연결된 시험지 또는 시험순번입니다. 기존 A/B/C 연결을 확인해 주세요." : message},{status:400});
}
export async function GET(request: Request) {
  if (!await getAdminUser()) return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  const s=createClient();
  try {
    const cycleId=new URL(request.url).searchParams.get("cycleId");
    const [catalog,exams,cycles]=await Promise.all([
      s.from("sos_exam_catalog").select("*").order("formal_sequence"),
      s.from("exams").select("id,title,exam_code,round,status,exam_date,question_count,time_limit,test_file_path,solution_file_path").order("exam_date",{ascending:false}),
      s.from("learning_cycles").select("id,name,start_date,end_date,scheduled_at").order("start_date",{ascending:false}),
    ]);
    if(catalog.error||exams.error||cycles.error) throw catalog.error||exams.error||cycles.error;
    let rows: any[]=[];
    if(cycleId && (cycles.data??[]).some(c=>c.id===cycleId&&!isArchivedPracticeCycle(c))){
      const members=await s.from("learning_cycle_students").select("*,students!inner(id,name,school,grade,active,status)").eq("cycle_id",cycleId).eq("status","ACTIVE").eq("students.active",true).neq("students.status","퇴원").not("booking_status","in","(CANCELLED,NO_SHOW)");
      if(members.error)throw members.error;
      const ids=(members.data??[]).map(x=>x.student_id);
      if(ids.length){
        const [attempts,registrations,sessions,history]=await Promise.all([
          s.from("exam_attempts").select("id,student_id,exam_id,status,formal_sequence,scope_code,is_practice").in("student_id",ids),
          s.from("exam_registrations").select("id,student_id,exam_id,cycle_student_id,status,formal_sequence,scope_code").in("student_id",ids),
          s.from("sos_training_sessions").select("student_id,status,decision,cycle_kind,target_snapshot").in("student_id",ids),
          s.from("learning_cycle_students").select("id,student_id,cycle_id,formal_sequence,scope_code,is_practice,booking_status").in("student_id",ids),
        ]);
        if(attempts.error||registrations.error||sessions.error||history.error)throw attempts.error||registrations.error||sessions.error||history.error;
        rows=(members.data??[]).map(m=>{
          const scope=String(m.scope_code??"FULL");
          const own=(attempts.data??[]).filter(a=>a.student_id===m.student_id&&String(a.scope_code??"FULL")===scope);
          const completed=Math.max(0,...own.filter(a=>a.status==="submitted"&&!a.is_practice).map(a=>Number(a.formal_sequence)||0));
          const cycle=(cycles.data??[]).find(c=>c.id===cycleId)!;
          const past=String(cycle.start_date)<new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
          // Legacy attempts predate cycle_student_id. Only associate them with the
          // selected exam date; never interpret an unrelated completed exam as this slot.
          const exact=(registrations.data??[]).find(r=>r.cycle_student_id===m.id&&r.status!=="cancelled");
          const candidates=own.filter(a=>!a.is_practice&&["submitted","in_progress"].includes(a.status)&&
            (exact ? a.exam_id===exact.exam_id : (exams.data??[]).some(e=>e.id===a.exam_id&&String(e.exam_date).slice(0,10)===String(cycle.start_date).slice(0,10)&&!isArchivedPracticeExam(e))));
          const uniqueExams=new Set(candidates.map(a=>a.exam_id));
          const attempt=uniqueExams.size===1?(candidates.find(a=>a.status==="submitted")??candidates[0]):undefined;
          const exam=(exams.data??[]).find(e=>e.id===(exact?.exam_id??attempt?.exam_id));
          const registration=exact??(attempt?{exam_id:attempt.exam_id,formal_sequence:attempt.formal_sequence,scope_code:m.scope_code,status:"historical"}:null);
          const sequence=Number(registration?.formal_sequence)||completed+1;
          const previous=(history.data??[]).filter(h=>h.student_id===m.student_id&&String(h.scope_code??"FULL")===scope&&Number(h.formal_sequence)===sequence-1&&!h.is_practice);
          const passed=priorLearningPassed((history.data??[]).filter(h=>h.student_id===m.student_id),(sessions.data??[]).filter(t=>t.student_id===m.student_id),m);
          const nextByScope=Object.fromEntries(SOS_SCOPE_CODES.map(code=>[code,nextExamSequence((attempts.data??[]).filter(a=>a.student_id===m.student_id),code)]));
          return {...m,next_by_scope:nextByScope,completed_sequence:completed,next_sequence:completed+1,sos_passed:passed,registration,exam,attempt_status:attempt?.status??null,past,locked:past||!!attempt};
        });
      }
    }
    return NextResponse.json({catalog:catalog.data,exams:(exams.data??[]).filter(e=>!isArchivedPracticeExam(e)),cycles:(cycles.data??[]).filter(c=>!isArchivedPracticeCycle(c)),rows},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return fail(e);}
}
export async function POST(request: Request){
  if(!await getAdminUser())return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  const s=createClient();
  try{
    const b=await request.json();
    if(b.action==="assign"||b.action==="assign-all"){
      const batch=b.action==="assign-all";
      if(batch&&(!b.cycleId||!Array.isArray(b.items)||!b.items.length||b.items.length>100))throw new Error("배정할 일정과 학생을 확인해 주세요. 한 번에 최대 100명까지 가능합니다.");
      const result=await s.rpc("sos_assign_papers",{p_cycle_id:b.cycleId||null,p_items:batch?b.items:[b],p_only_unassigned:batch});
      if(result.error)throw result.error;
      if(!batch&&result.data?.results?.[0]?.status==="failed")throw new Error(result.data.results[0].message);
      return NextResponse.json({success:true,...result.data});
    }
    const sequence=Number(b.formalSequence),scope=String(b.scopeCode);
    if(!Number.isInteger(sequence)||sequence<1||!(SOS_SCOPE_CODES as readonly string[]).includes(scope))throw new Error("시험순번과 A/B/C 범위를 확인해 주세요.");
    if(b.action==="register-paper"||b.action==="catalog"){
      const result=await s.rpc("sos_register_paper",{p_exam_id:String(b.examId),p_sequence:sequence,p_scope:scope});
      if(result.error)throw result.error;
      return NextResponse.json({success:true,...result.data});
    }
    throw new Error("지원하지 않는 작업입니다.");
  }catch(e){return fail(e);}
}
