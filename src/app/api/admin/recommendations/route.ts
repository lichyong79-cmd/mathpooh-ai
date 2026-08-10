import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { buildStudentPerformance } from "@/lib/exam-performance";

async function adminContext() {
  const user = await getSessionUser();
  if (!user || user.user_metadata?.role === "student" || user.user_metadata?.role === "parent") return null;
  return { user, supabase: createClient() };
}

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, "").toLowerCase();
const related = (left: unknown, right: unknown) => {
  const a = clean(left), b = clean(right);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
};

export async function GET() {
  const ctx = await adminContext();
  if (!ctx) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const [{ data: students, error: studentError }, { data: attempts, error: attemptError }, { data: problems, error: problemError }] = await Promise.all([
    ctx.supabase.from("students").select("id,name,school,grade,status").neq("status", "퇴원").order("name"),
    ctx.supabase.from("exam_attempts").select("id,student_id,exam_id,status,answers,submitted_at,score,correct_count").eq("status", "submitted"),
    ctx.supabase.from("problem_bank_questions").select("id,problem_code,title,unit,topic,difficulty,question_type,summary,problem_dna,status,content_role,training_course").eq("status", "ACTIVE").eq("content_role", "TRAINING"),
  ]);
  if (studentError || attemptError || problemError) return NextResponse.json({ message: studentError?.message || attemptError?.message || problemError?.message }, { status: 400 });
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
    const candidates = (problems ?? []).map((problem) => {
      let score = 0;
      const reasons: string[] = [];
      const unit = weakUnits.find((weak) => related(weak.label, problem.unit) || related(weak.label, problem.topic));
      const type = weakTypes.find((weak) => related(weak.label, problem.topic) || related(weak.label, problem.question_type) || related(weak.label, JSON.stringify(problem.problem_dna ?? {})));
      if (unit) { score += 60; reasons.push(`취약 단원: ${unit.label}`); }
      if (type) { score += 30; reasons.push(`취약 유형: ${type.label}`); }
      const difficulty = Number(problem.difficulty);
      if (difficulty >= 1 && difficulty <= 4) score += 10;
      return { ...problem, matchScore: score, reasons };
    }).filter((item) => item.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore).slice(0, 12);
    const latestExam = performance.history[0] ?? null;
    const missedCount = latestExam ? latestExam.wrongNumbers.length + latestExam.unansweredNumbers.length : 0;
    return { ...student, performance, weakUnits, weakTypes, candidates, latestExam, missedCount };
  }).filter((student) => student.performance.summary.examCount > 0);
  return NextResponse.json({ students: rows, problemCount: problems?.length ?? 0 });
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
