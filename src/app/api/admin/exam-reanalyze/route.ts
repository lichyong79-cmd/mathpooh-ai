import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

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
    .select("id,answer_keys,question_count,total_score")
    .eq("id", String(examId))
    .maybeSingle();
  if (examError || !exam) return NextResponse.json({ message: examError?.message || "시험을 찾지 못했습니다." }, { status: 404 });

  const { data: attempts, error: attemptError } = await supabase
    .from("exam_attempts")
    .select("id,answers,score_source")
    .eq("exam_id", String(examId))
    .eq("status", "submitted");
  if (attemptError) return NextResponse.json({ message: attemptError.message }, { status: 400 });

  const keys = Array.isArray(exam.answer_keys) ? exam.answer_keys.map(normalized) : [];
  const questionCount = Number(exam.question_count ?? keys.length ?? 0);
  const totalScore = Number(exam.total_score ?? 100);
  const gradedAt = new Date().toISOString();
  let updated = 0;
  let manualPreserved = 0;
  for (const attempt of attempts ?? []) {
    const answers = (attempt.answers ?? {}) as Record<string, unknown>;
    const wrong: number[] = [];
    const unanswered: number[] = [];
    let correct = 0;
    for (let no = 1; no <= questionCount; no += 1) {
      const answer = normalized(answers[no] ?? answers[String(no)]);
      const key = normalized(keys[no - 1]);
      if (!answer) unanswered.push(no);
      else if (key && answer === key) correct += 1;
      else wrong.push(no);
    }
    const autoScore = Math.round((correct / Math.max(1, questionCount)) * totalScore);
    const preserveManual = attempt.score_source === "manual";
    const payload: Record<string, unknown> = {
      correct_count: correct,
      wrong_numbers: wrong,
      unanswered_numbers: unanswered,
      graded_at: gradedAt,
    };
    if (!preserveManual) {
      payload.score = autoScore;
      payload.score_source = "auto";
    } else manualPreserved += 1;
    const { error } = await supabase.from("exam_attempts").update(payload).eq("id", attempt.id);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    updated += 1;
  }
  return NextResponse.json({ updated, manualPreserved });
}
