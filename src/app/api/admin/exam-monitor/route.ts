import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

async function adminContext() {
  const user = await getSessionUser();
  if (!user)
    return {
      error: NextResponse.json(
        { message: "로그인이 필요합니다." },
        { status: 401 },
      ),
    };
  if (
    user.user_metadata?.role === "student" ||
    user.user_metadata?.role === "parent"
  )
    return {
      error: NextResponse.json(
        { message: "관리자 권한이 필요합니다." },
        { status: 403 },
      ),
    };
  return { supabase: createServerSupabase() };
}

async function loadQuestionMetadata(
  supabase: ReturnType<typeof createServerSupabase>,
  examId: string,
) {
  const { data } = await supabase
    .from("exam_question_analysis")
    .select(
      "question_no,major_unit,middle_unit,minor_unit,detailed_topic,question_type,problem_types,difficulty",
    )
    .eq("exam_id", examId)
    .order("question_no");
  return data ?? [];
}

export async function GET(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const examId = new URL(request.url).searchParams.get("examId");
  if (!examId)
    return NextResponse.json(
      { message: "시험을 선택해 주세요." },
      { status: 400 },
    );
  const { data: exam, error: examError } = await ctx.supabase
    .from("exams")
    .select(
      "id,title,exam_date,time_limit,student_open,open_at,close_at,answer_keys,question_count,total_score",
    )
    .eq("id", examId)
    .maybeSingle();
  if (examError || !exam)
    return NextResponse.json(
      { message: examError?.message || "시험을 찾지 못했습니다." },
      { status: 404 },
    );
  const { data: registrations, error: registrationError } = await ctx.supabase
    .from("exam_registrations")
    .select("student_id,status,requested_at,assigned_at")
    .eq("exam_id", examId)
    .eq("status", "assigned");
  if (registrationError)
    return NextResponse.json(
      { message: registrationError.message },
      { status: 400 },
    );
  const studentIds = (registrations ?? []).map((item) => item.student_id);
  const questionMetadata = await loadQuestionMetadata(ctx.supabase, exam.id);
  if (!studentIds.length)
    return NextResponse.json({
      exam: { ...exam, question_metadata: questionMetadata },
      rows: [],
    });
  const [
    { data: students, error: studentError },
    { data: attempts, error: attemptError },
  ] = await Promise.all([
    ctx.supabase
      .from("students")
      .select("id,name,school,grade,phone")
      .in("id", studentIds),
    ctx.supabase
      .from("exam_attempts")
      .select(
        "id,student_id,status,answers,started_at,last_saved_at,submitted_at,score,correct_count",
      )
      .eq("exam_id", examId)
      .in("student_id", studentIds),
  ]);
  if (studentError || attemptError)
    return NextResponse.json(
      { message: studentError?.message || attemptError?.message },
      { status: 400 },
    );
  if (exam.close_at && new Date(exam.close_at).getTime() <= Date.now()) {
    const keys = Array.isArray(exam.answer_keys)
      ? exam.answer_keys.map(String)
      : [];
    await Promise.all(
      (attempts ?? [])
        .filter((attempt) => attempt.status === "in_progress")
        .map(async (attempt) => {
          const answers = attempt.answers ?? {};
          const wrong: number[] = [],
            unanswered: number[] = [];
          let correct = 0;
          for (let no = 1; no <= Number(exam.question_count); no++) {
            const answer = String(
              answers[no] ?? answers[String(no)] ?? "",
            ).trim();
            if (!answer) unanswered.push(no);
            else if (keys[no - 1] && answer === String(keys[no - 1]).trim())
              correct++;
            else wrong.push(no);
          }
          const score = Math.round(
            (correct / Math.max(1, Number(exam.question_count))) *
              Number(exam.total_score),
          );
          await ctx.supabase
            .from("exam_attempts")
            .update({
              status: "submitted",
              submitted_at: exam.close_at,
              last_saved_at: exam.close_at,
              score,
              correct_count: correct,
              wrong_numbers: wrong,
              unanswered_numbers: unanswered,
              graded_at: exam.close_at,
            })
            .eq("id", attempt.id)
            .eq("status", "in_progress");
          attempt.status = "submitted";
          attempt.submitted_at = exam.close_at;
          attempt.score = score;
          attempt.correct_count = correct;
        }),
    );
  }
  const studentMap = new Map(
    (students ?? []).map((student) => [student.id, student]),
  );
  const attemptMap = new Map(
    (attempts ?? []).map((attempt) => [attempt.student_id, attempt]),
  );
  const rows = (registrations ?? [])
    .map((registration) => ({
      registration,
      student: studentMap.get(registration.student_id),
      attempt: attemptMap.get(registration.student_id) ?? null,
    }))
    .filter((row) => row.student);
  return NextResponse.json({
    exam: { ...exam, question_metadata: questionMetadata },
    rows,
  });
}

export async function PATCH(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const body = await request.json();
  const examId = String(body.examId ?? "");
  if (!examId)
    return NextResponse.json(
      { message: "시험을 선택해 주세요." },
      { status: 400 },
    );
  const { data: currentExam, error: currentError } = await ctx.supabase
    .from("exams")
    .select("time_limit,answer_keys,question_count,total_score")
    .eq("id", examId)
    .maybeSingle();
  if (currentError || !currentExam)
    return NextResponse.json(
      { message: currentError?.message || "시험을 찾지 못했습니다." },
      { status: 404 },
    );
  const action = String(body.action ?? "schedule");
  if (action === "update-result") {
    const attemptId = String(body.attemptId ?? "");
    const answers =
      typeof body.answers === "object" && body.answers ? body.answers : {};
    if (!attemptId)
      return NextResponse.json(
        { message: "수정할 제출 결과가 없습니다." },
        { status: 400 },
      );
    const keys = Array.isArray(currentExam.answer_keys)
      ? currentExam.answer_keys.map(String)
      : [];
    const wrong: number[] = [],
      unanswered: number[] = [];
    let correct = 0;
    for (let no = 1; no <= Number(currentExam.question_count); no++) {
      const answer = String(answers[no] ?? answers[String(no)] ?? "").trim();
      if (!answer) unanswered.push(no);
      else if (keys[no - 1] && answer === String(keys[no - 1]).trim())
        correct++;
      else wrong.push(no);
    }
    const requestedScore = Number(body.manualScore);
    const totalScore = Number(currentExam.total_score ?? 100);
    if (
      !Number.isFinite(requestedScore) ||
      requestedScore < 0 ||
      requestedScore > totalScore
    ) {
      return NextResponse.json(
        { message: `점수는 0점부터 ${totalScore}점 사이로 입력해 주세요.` },
        { status: 400 },
      );
    }
    const score = requestedScore;
    const gradedAt = new Date().toISOString();
    const { data, error } = await ctx.supabase
      .from("exam_attempts")
      .update({
        answers,
        score,
        correct_count: correct,
        wrong_numbers: wrong,
        unanswered_numbers: unanswered,
        graded_at: gradedAt,
      })
      .eq("id", attemptId)
      .eq("exam_id", examId)
      .select(
        "id,student_id,status,answers,started_at,last_saved_at,submitted_at,score,correct_count,wrong_numbers,unanswered_numbers,graded_at",
      )
      .single();
    return error
      ? NextResponse.json({ message: error.message }, { status: 400 })
      : NextResponse.json({ attempt: data });
  }
  const minutes = Math.max(1, Number(currentExam.time_limit ?? 100));
  const startedAt =
    action === "start"
      ? new Date()
      : body.openAt
        ? new Date(body.openAt)
        : null;
  if (!startedAt || Number.isNaN(startedAt.getTime()))
    return NextResponse.json(
      { message: "시험 시작 시각을 입력해 주세요." },
      { status: 400 },
    );
  const payload =
    action === "start"
      ? {
          student_open: true,
          open_at: startedAt.toISOString(),
          close_at: new Date(
            startedAt.getTime() + minutes * 60_000,
          ).toISOString(),
        }
      : {
          student_open: Boolean(body.studentOpen),
          open_at: startedAt.toISOString(),
          close_at: null,
        };
  const { data, error } = await ctx.supabase
    .from("exams")
    .update(payload)
    .eq("id", examId)
    .select("id,title,exam_date,time_limit,student_open,open_at,close_at")
    .single();
  return error
    ? NextResponse.json({ message: error.message }, { status: 400 })
    : NextResponse.json({ exam: data });
}
