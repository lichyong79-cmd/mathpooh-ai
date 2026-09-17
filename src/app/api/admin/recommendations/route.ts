import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { buildStudentPerformance } from "@/lib/exam-performance";

async function adminContext() {
  const user = await getSessionUser();
  if (!user || user.user_metadata?.role === "student" || user.user_metadata?.role === "parent") return null;
  return { user, supabase: createClient() };
}

export async function GET() {
  const ctx = await adminContext();
  if (!ctx) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const [{ data: students, error: studentError }, { data: attempts, error: attemptError }, activeCountResult, {data:sosSessions,error:sosError}, cyclesResult, membersResult] = await Promise.all([
    ctx.supabase.from("students").select("id,name,school,grade,status").neq("status", "퇴원").order("name"),
    ctx.supabase.from("exam_attempts").select("id,student_id,exam_id,status,answers,submitted_at,score,correct_count,started_at,formal_sequence,scope_code").eq("status", "submitted"),
    ctx.supabase.from("problem_bank_questions").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
    ctx.supabase.from("sos_training_sessions").select("id,student_id,parent_session_id,phase,status,round_no,cycle_kind,target_snapshot,correct_count,total_count,created_at").order("created_at",{ascending:false}),
    ctx.supabase.from("learning_cycles").select("id,start_date,end_date"),
    ctx.supabase.from("learning_cycle_students").select("cycle_id,student_id,formal_sequence,scope_code"),
  ]);
  if (studentError || attemptError || activeCountResult.error || sosError) return NextResponse.json({ message: studentError?.message || attemptError?.message || activeCountResult.error?.message || sosError?.message }, { status: 400 });

  if (cyclesResult.error || membersResult.error) return NextResponse.json({message: cyclesResult.error?.message || membersResult.error?.message}, {status:400});
  const attemptCycles: Record<string,string[]> = {};
  for (const attempt of attempts ?? []) {
    const day = new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Seoul"}).format(new Date(attempt.started_at || attempt.submitted_at));
    attemptCycles[attempt.id] = (cyclesResult.data ?? []).filter(c =>
      day >= c.start_date && day <= c.end_date && (membersResult.data ?? []).some(m =>
        m.cycle_id === c.id && m.student_id === attempt.student_id &&
        (attempt.formal_sequence == null || m.formal_sequence === attempt.formal_sequence) &&
        (attempt.scope_code == null || m.scope_code === attempt.scope_code)
      )
    ).map(c => c.id);
  }

  // The assignment screen ranks actual exam mistakes. Bank candidates are
  // fetched by training-engine only after the admin confirms SOS_NO1.
  const examIds = [...new Set((attempts ?? []).map((item) => item.exam_id))];
  const [{ data: exams, error: examError }, { data: metadata, error: metadataError }] = await Promise.all([
    examIds.length ? ctx.supabase.from("exams").select("id,title,exam_date,question_count,total_score,answer_keys").in("id", examIds) : Promise.resolve({ data: [], error: null }),
    examIds.length ? ctx.supabase.from("exam_question_analysis").select("exam_id,question_no,major_unit,middle_unit,minor_unit,detailed_topic,question_type,problem_types,difficulty").in("exam_id", examIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (examError || metadataError) return NextResponse.json({ message: examError?.message || metadataError?.message }, { status: 400 });

  const rows = (students ?? []).map((student) => {
    const performance = buildStudentPerformance((attempts ?? []).filter((item) => String(item.student_id) === String(student.id)), exams ?? [], metadata ?? []);
    const weakUnits = performance.units.filter((item) => item.total > 0 && item.rate < 70).sort((a, b) => a.rate - b.rate || b.total - a.total).slice(0, 3);
    const weakTypes = performance.types.filter((item) => item.total > 0 && item.rate < 70).sort((a, b) => a.rate - b.rate || b.total - a.total).slice(0, 3);
    const latestExam = performance.history[0] ?? null;
    const missedCount = latestExam ? latestExam.wrongNumbers.length + latestExam.unansweredNumbers.length : 0;
    const studentSos=(sosSessions??[]).filter((x:any)=>String(x.student_id)===String(student.id)).map((x:any)=>({id:x.id,parentSessionId:x.parent_session_id,phase:x.phase,status:x.status,roundNo:Number(x.round_no??1),cycleKind:x.cycle_kind??"STANDARD",correct:Number(x.correct_count??0),total:Number(x.total_count??0),createdAt:x.created_at,learningCycleId:String(x.target_snapshot?.learningCycleId??""),learningCycleName:String(x.target_snapshot?.learningCycleName??""),sourceExamTitle:String(x.target_snapshot?.sourceExamTitle??"")}));
    return { ...student, attemptCycles: Object.fromEntries(performance.history.map(exam => [exam.attemptId, attemptCycles[exam.attemptId] ?? []])), performance, weakUnits, weakTypes, latestExam, missedCount, sosSessions:studentSos };
  }).filter((student) => student.performance.summary.examCount > 0);
  return NextResponse.json({ students: rows, problemCount: activeCountResult.count ?? 0 });
}

export async function POST(request: Request) {
  const ctx = await adminContext();
  if (!ctx) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json();
  const studentId = String(body.studentId ?? "");
  const problemIds = Array.isArray(body.problemIds) ? body.problemIds.map(String) : [];
  if (!studentId || !problemIds.length) return NextResponse.json({ message: "학생과 훈련 문항을 선택해 주세요." }, { status: 400 });
  const { data, error } = await ctx.supabase.from("sos_recommendations").insert({
    student_id: studentId,
    status: body.assign ? "assigned" : "draft",
    weakness_snapshot: body.weakness ?? {},
    problem_ids: problemIds,
    note: String(body.note ?? ""),
    created_by: ctx.user.id,
    assigned_at: body.assign ? new Date().toISOString() : null,
  }).select().single();
  if (error) return NextResponse.json({ message: error.message.includes("does not exist") ? "먼저 supabase-v2.7-sos-recommendations.sql을 실행해 주세요." : error.message }, { status: 400 });
  return NextResponse.json({ recommendation: data });
}
