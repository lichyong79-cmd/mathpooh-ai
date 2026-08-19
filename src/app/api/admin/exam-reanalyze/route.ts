import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { calculateExamScore } from "@/lib/exam-score";

function normalized(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^-?\d+$/.test(text)) return String(Number(text));
  return text;
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (user.user_metadata?.role === "student" || user.user_metadata?.role === "parent")
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });

  const { examId } = await request.json();
  if (!examId) return NextResponse.json({ message: "시험을 선택해 주세요." }, { status: 400 });
  const supabase = createServerSupabase();
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id,answer_keys,question_count,total_score,question_points")
    .eq("id", String(examId))
    .maybeSingle();
  if (examError || !exam) return NextResponse.json({ message: examError?.message || "시험을 찾지 못했습니다." }, { status: 404 });

  const { data: attempts, error: attemptError } = await supabase
    .from("exam_attempts")
    .select("id,answers,score_source")
    .eq("exam_id", String(examId))
    .eq("status", "submitted");
  if (attemptError) return NextResponse.json({ message: attemptError.message }, { status: 400 });

  const questionCount = Number(exam.question_count ?? 0);
  const totalScore = Number(exam.total_score ?? 100);
  const gradedAt = new Date().toISOString();
  let updated = 0;
  for (const attempt of attempts ?? []) {
    const graded = calculateExamScore((attempt.answers ?? {}) as Record<string, unknown>, exam.answer_keys, questionCount, totalScore, exam.question_points);
    const payload: Record<string, unknown> = {
      correct_count: graded.correct, wrong_numbers: graded.wrong, unanswered_numbers: graded.unanswered,
      graded_at: gradedAt, score: graded.score, score_source: "auto",
    };
    const { error } = await supabase.from("exam_attempts").update(payload).eq("id", attempt.id);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    updated += 1;
  }
  return NextResponse.json({ updated });
}
