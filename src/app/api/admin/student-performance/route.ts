import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { buildStudentPerformance } from "@/lib/exam-performance";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.user_metadata?.role === "student" || user.user_metadata?.role === "parent")
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });

  const selectedId = new URL(request.url).searchParams.get("studentId");
  const supabase = createClient();
  let studentQuery = supabase.from("students").select("id,name,school,grade,phone,status").order("name");
  if (selectedId) studentQuery = studentQuery.eq("id", selectedId);
  const { data: students, error: studentError } = await studentQuery;
  if (studentError) return NextResponse.json({ message: studentError.message }, { status: 400 });
  const studentIds = (students ?? []).map((student) => student.id);
  if (!studentIds.length) return NextResponse.json({ students: [] });

  const { data: attempts, error: attemptError } = await supabase
    .from("exam_attempts")
    .select("id,student_id,exam_id,status,answers,submitted_at,score,correct_count")
    .in("student_id", studentIds)
    .eq("status", "submitted");
  if (attemptError) return NextResponse.json({ message: attemptError.message }, { status: 400 });
  const examIds = [...new Set((attempts ?? []).map((attempt) => attempt.exam_id))];
  const examsResult = examIds.length
    ? await supabase.from("exams").select("id,title,exam_date,question_count,total_score,answer_keys").in("id", examIds)
    : { data: [], error: null };
  const metadataResult = examIds.length
    ? await supabase.from("exam_question_analysis").select("exam_id,question_no,major_unit,middle_unit,minor_unit,detailed_topic,question_type,problem_types,difficulty").in("exam_id", examIds)
    : { data: [], error: null };
  if (examsResult.error || metadataResult.error)
    return NextResponse.json({ message: examsResult.error?.message || metadataResult.error?.message }, { status: 400 });

  return NextResponse.json({
    students: (students ?? []).map((student) => ({
      ...student,
      performance: buildStudentPerformance(
        (attempts ?? []).filter((attempt) => String(attempt.student_id) === String(student.id)),
        examsResult.data ?? [],
        metadataResult.data ?? [],
      ),
    })),
  });
}
