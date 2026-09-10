import { isArchivedPracticeCycle, isArchivedPracticeExam, isArchivedPracticeSession } from "@/lib/archived-practice-exams";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { SOS_SCOPE_CODES, isSosCyclePassed } from "@/lib/sos-program-flow";

export const dynamic = "force-dynamic";
function fail(error: unknown) {
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
  return NextResponse.json({message:message.includes("sos_exam_catalog") ? "SOS365 시험지 등록 SQL을 먼저 실행해 주세요." : message},{status:400});
}
export async function GET(request: Request) {
  if (!await getAdminUser()) return NextResponse.json({message:"관리자 권한이 필요합니다."},{status:403});
  const s=createClient();
  try {
    const cycleId=new URL(request.url).searchParams.get("cycleId");
    const [catalog,exams,cycles]=await Promise.all([
      s.from("sos_exam_catalog").select("*").order("formal_sequence"),
      s.from("exams").select("id,title,exam_date,question_count,time_limit,test_file_path,solution_file_path").order("exam_date",{ascending:false}),
      s.from("learning_cycles").select("id,name,start_date,end_date,scheduled_at").order("start_date",{ascending:false}),
    ]);
    if(catalog.error||exams.error||cycles.error) throw catalog.error||exams.error||cycles.error;
    let rows: any[]=[];
    if(cycleId && (cycles.data??[]).some(c=>c.id===cycleId&&!isArchivedPracticeCycle(c))){
      const members=await s.from("learning_cycle_students").select("*,students(id,name,school,grade)").eq("cycle_id",cycleId).eq("status","ACTIVE");
      if(members.error)throw members.error;
      const ids=(members.data??[]).map(x=>x.student_id);
      if(ids.length){
        const [attempts,registrations,sessions,history]=await Promise.all([
          s.from("exam_attempts").select("id,student_id,exam_id,status,formal_sequence,is_practice").in("student_id",ids),
          s.from("exam_registrations").select("id,student_id,exam_id,cycle_student_id,status,formal_sequence,scope_code").in("student_id",ids),
          s.from("sos_training_sessions").select("student_id,status,decision,cycle_kind,target_snapshot").in("student_id",ids),
          s.from("learning_cycle_students").select("student_id,cycle_id,formal_sequence,is_practice").in("student_id",ids),
        ]);
        if(attempts.error||registrations.error||sessions.error||history.error)throw attempts.error||registrations.error||sessions.error||history.error;
        rows=(members.data??[]).map(m=>{
          const own=(attempts.data??[]).filter(a=>a.student_id===m.student_id);
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
          const previous=(history.data??[]).filter(h=>h.student_id===m.student_id&&Number(h.formal_sequence)===sequence-1&&!h.is_practice);
          const passed=sequence<=1||previous.some(h=>isSosCyclePassed((sessions.data??[]).filter(t=>t.student_id===m.student_id),h.cycle_id));
          return {...m,completed_sequence:completed,next_sequence:completed+1,sos_passed:passed,registration,exam,attempt_status:attempt?.status??null,past,locked:past||!!attempt};
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
    const sequence=Number(b.formalSequence),scope=String(b.scopeCode);
    if(!Number.isInteger(sequence)||sequence<1||!(SOS_SCOPE_CODES as readonly string[]).includes(scope))throw new Error("시험순번과 A/B/C 범위를 확인해 주세요.");
    if(b.action==="catalog"){
      const exam=await s.from("exams").select("id").eq("id",String(b.examId)).single();
      if(exam.error)throw exam.error;
      const saved=await s.from("sos_exam_catalog").upsert({formal_sequence:sequence,scope_code:scope,exam_id:exam.data.id,updated_at:new Date().toISOString()},{onConflict:"formal_sequence,scope_code"});
      if(saved.error)throw saved.error;
      return NextResponse.json({success:true});
    }
    if(b.action!=="assign")throw new Error("지원하지 않는 작업입니다.");
    const member=await s.from("learning_cycle_students").select("*").eq("id",String(b.membershipId)).eq("status","ACTIVE").single();
    if(member.error)throw member.error;
    const m=member.data;
    const slot=await s.from("learning_cycles").select("start_date").eq("id",m.cycle_id).single();
    if(slot.error)throw slot.error;
    if(String(slot.data.start_date)<new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()))throw new Error("지난 참가 일정에는 새 시험지를 배정할 수 없습니다.");

    if(["COMPLETED","IN_PROGRESS","CANCELLED","NO_SHOW"].includes(m.booking_status))throw new Error("이미 진행되었거나 취소된 참가 일정은 배정을 변경할 수 없습니다.");
    const [catalog,current,attempts]=await Promise.all([
      s.from("sos_exam_catalog").select("exam_id").eq("formal_sequence",sequence).eq("scope_code",scope).single(),
      s.from("exam_registrations").select("exam_id").eq("cycle_student_id",m.id).eq("status","assigned"),
      s.from("exam_attempts").select("exam_id,status,formal_sequence,is_practice").eq("student_id",m.student_id).in("status",["in_progress","submitted"]),
    ]);
    if(catalog.error)throw new Error("해당 A/B/C 시험순번에 시험지를 먼저 등록해 주세요.");
    if(current.error||attempts.error)throw current.error||attempts.error;
    const nextSequence=Math.max(0,...(attempts.data??[]).filter(a=>a.status==="submitted"&&!a.is_practice).map(a=>Number(a.formal_sequence)||0))+1;
    if(sequence!==nextSequence)throw new Error(`현재 실제 응시기록 기준 다음 시험은 ${nextSequence}회입니다. 이전 시험 완료 후 다음 순번을 배정해 주세요.`);
    if((attempts.data??[]).some(a=>a.exam_id===catalog.data.exam_id||(current.data??[]).some(r=>r.exam_id===a.exam_id)))throw new Error("응시기록이 있는 시험지는 재배정할 수 없습니다.");
    const duplicate=await s.from("exam_registrations").select("cycle_student_id").eq("student_id",m.student_id).eq("exam_id",catalog.data.exam_id).eq("status","assigned").maybeSingle();
    if(duplicate.error)throw duplicate.error;
    if(duplicate.data?.cycle_student_id && duplicate.data.cycle_student_id!==m.id)throw new Error("이 시험지는 다른 참가 일정에 이미 배정되어 있습니다. 기존 배정을 먼저 확인해 주세요.");
    const now=new Date().toISOString();
    const link=await s.from("learning_cycle_exams").upsert({cycle_id:m.cycle_id,exam_id:catalog.data.exam_id,formal_sequence:sequence,scope_code:scope,linked_at:now},{onConflict:"cycle_id,exam_id"});
    if(link.error)throw link.error;
    const saved=await s.from("exam_registrations").upsert({exam_id:catalog.data.exam_id,student_id:m.student_id,cycle_student_id:m.id,formal_sequence:sequence,scope_code:scope,scheduled_at:m.scheduled_at,attendance_mode:"ZOOM",booking_status:"SCHEDULED",status:"assigned",assigned_at:now},{onConflict:"exam_id,student_id"});
    if(saved.error)throw saved.error;
    const updated=await s.from("learning_cycle_students").update({formal_sequence:sequence,scope_code:scope,sos_gate_status:sequence===1?"OPEN":"LOCKED",updated_at:now}).eq("id",m.id);
    if(updated.error)throw updated.error;
    const cancelled=await s.from("exam_registrations").update({status:"cancelled",booking_status:"CANCELLED"}).eq("cycle_student_id",m.id).neq("exam_id",catalog.data.exam_id);
    if(cancelled.error)throw cancelled.error;
    const opened=await s.from("exams").update({student_open:true}).eq("id",catalog.data.exam_id);
    if(opened.error)throw opened.error;
    return NextResponse.json({success:true});
  }catch(e){return fail(e);}
}
