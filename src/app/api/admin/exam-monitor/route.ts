import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { calculateExamScore } from "@/lib/exam-score";

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
      "id,title,exam_date,time_limit,student_open,open_at,close_at,paused_at,paused_remaining_seconds,answer_keys,question_count,total_score,question_points,solution_open",
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
      activity_logs: [],
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
        "id,student_id,status,answers,started_at,last_saved_at,submitted_at,score,correct_count,wrong_numbers,unanswered_numbers,score_source,solution_override,mathpooh_comment",
      )
      .eq("exam_id", examId)
      .in("student_id", studentIds),
  ]);
  const { data: activityLogs } = await ctx.supabase
    .from("exam_activity_logs")
    .select("id,student_id,event_type,detail,occurred_at")
    .eq("exam_id", examId)
    .order("occurred_at", { ascending: false })
    .limit(300);
  if (studentError || attemptError)
    return NextResponse.json(
      { message: studentError?.message || attemptError?.message },
      { status: 400 },
    );
  if (exam.close_at && new Date(exam.close_at).getTime() <= Date.now()) {
    await Promise.all(
      (attempts ?? [])
        .filter((attempt) => attempt.status === "in_progress")
        .map(async (attempt) => {
          const answers = attempt.answers ?? {};
          const graded = calculateExamScore(
            answers,
            exam.answer_keys,
            Number(exam.question_count),
            Number(exam.total_score ?? 100),
            exam.question_points,
          );
          const { score, correct, wrong, unanswered } = graded;
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
  // 제출 결과의 유일한 기준은 문항별 답안/정오답이다.
  // 관리자 결과 화면을 열 때 현재 답안으로 점수를 다시 계산하고, DB의 최종점수도 같은 값으로 맞춘다.
  await Promise.all(
    (attempts ?? [])
      .filter((attempt) => attempt.status === "submitted")
      .map(async (attempt) => {
        const graded = calculateExamScore(
          (attempt.answers ?? {}) as Record<string, unknown>,
          exam.answer_keys,
          Number(exam.question_count),
          Number(exam.total_score ?? 100),
          exam.question_points,
        );
        const changed =
          Number(attempt.score ?? -1) !== graded.score ||
          Number(attempt.correct_count ?? -1) !== graded.correct ||
          JSON.stringify(attempt.wrong_numbers ?? []) !== JSON.stringify(graded.wrong) ||
          JSON.stringify(attempt.unanswered_numbers ?? []) !== JSON.stringify(graded.unanswered);
        attempt.score = graded.score;
        attempt.correct_count = graded.correct;
        attempt.wrong_numbers = graded.wrong;
        attempt.unanswered_numbers = graded.unanswered;
        attempt.score_source = "auto";
        if (changed) {
          await ctx.supabase
            .from("exam_attempts")
            .update({
              score: graded.score,
              correct_count: graded.correct,
              wrong_numbers: graded.wrong,
              unanswered_numbers: graded.unanswered,
              graded_at: new Date().toISOString(),
              score_source: "auto",
            })
            .eq("id", attempt.id);
        }
      }),
  );

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
    activity_logs: activityLogs ?? [],
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
    .select("time_limit,answer_keys,question_count,total_score,question_points,open_at,close_at,paused_at,paused_remaining_seconds,solution_open")
    .eq("id", examId)
    .maybeSingle();
  if (currentError || !currentExam)
    return NextResponse.json(
      { message: currentError?.message || "시험을 찾지 못했습니다." },
      { status: 404 },
    );
  const action = String(body.action ?? "schedule");

  const gradeAnswers = (answers: Record<string, unknown>) =>
    calculateExamScore(
      answers,
      currentExam.answer_keys,
      Number(currentExam.question_count),
      Number(currentExam.total_score ?? 100),
      currentExam.question_points,
    );

  if (action === "pause") {
    if (!currentExam.close_at || new Date(currentExam.close_at).getTime() <= Date.now())
      return NextResponse.json({ message: "진행 중인 시험이 아닙니다." }, { status: 409 });
    const remaining = Math.max(1, Math.ceil((new Date(currentExam.close_at).getTime() - Date.now()) / 1000));
    const pausedAt = new Date().toISOString();
    const { data, error } = await ctx.supabase
      .from("exams")
      .update({ paused_at: pausedAt, paused_remaining_seconds: remaining, close_at: null })
      .eq("id", examId)
      .select("id,title,exam_date,time_limit,student_open,open_at,close_at,paused_at,paused_remaining_seconds")
      .single();
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ exam: data });
  }

  if (action === "resume") {
    const remaining = Number(currentExam.paused_remaining_seconds ?? 0);
    if (!currentExam.paused_at || remaining <= 0)
      return NextResponse.json({ message: "일시정지된 시험이 아닙니다." }, { status: 409 });
    const closeAt = new Date(Date.now() + remaining * 1000).toISOString();
    const { data, error } = await ctx.supabase
      .from("exams")
      .update({ paused_at: null, paused_remaining_seconds: null, close_at: closeAt })
      .eq("id", examId)
      .select("id,title,exam_date,time_limit,student_open,open_at,close_at,paused_at,paused_remaining_seconds")
      .single();
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ exam: data });
  }

  if (action === "force-end") {
    const endedAt = new Date().toISOString();
    const { data: runningAttempts, error: attemptsError } = await ctx.supabase
      .from("exam_attempts")
      .select("id,answers")
      .eq("exam_id", examId)
      .eq("status", "in_progress");
    if (attemptsError) return NextResponse.json({ message: attemptsError.message }, { status: 400 });
    await Promise.all((runningAttempts ?? []).map(async (attempt) => {
      const graded = gradeAnswers(attempt.answers ?? {});
      await ctx.supabase.from("exam_attempts").update({
        status: "submitted", submitted_at: endedAt, last_saved_at: endedAt,
        score: graded.score, correct_count: graded.correct, wrong_numbers: graded.wrong,
        unanswered_numbers: graded.unanswered, graded_at: endedAt,
      }).eq("id", attempt.id).eq("status", "in_progress");
    }));
    const { data, error } = await ctx.supabase
      .from("exams")
      .update({ close_at: endedAt, paused_at: null, paused_remaining_seconds: null })
      .eq("id", examId)
      .select("id,title,exam_date,time_limit,student_open,open_at,close_at,paused_at,paused_remaining_seconds")
      .single();
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ exam: data, submittedCount: (runningAttempts ?? []).length });
  }


  if (action === "solution-global") {
    const { data, error } = await ctx.supabase
      .from("exams")
      .update({ solution_open: Boolean(body.open) })
      .eq("id", examId)
      .select("id,solution_open")
      .single();
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ exam: data });
  }

  if (action === "solution-student") {
    const attemptId = String(body.attemptId ?? "");
    const override = body.override === null ? null : Boolean(body.override);
    const { data, error } = await ctx.supabase
      .from("exam_attempts")
      .update({ solution_override: override })
      .eq("id", attemptId)
      .eq("exam_id", examId)
      .select("id,solution_override")
      .single();
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ attempt: data });
  }

  if (action === "update-comment") {
    const attemptId = String(body.attemptId ?? "");
    const { data, error } = await ctx.supabase
      .from("exam_attempts")
      .update({ mathpooh_comment: String(body.mathpoohComment ?? "") })
      .eq("id", attemptId)
      .eq("exam_id", examId)
      .select("id,mathpooh_comment")
      .single();
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ attempt: data });
  }

  if (action === "update-result") {
    const attemptId = String(body.attemptId ?? "");
    const answers =
      typeof body.answers === "object" && body.answers ? body.answers : {};
    if (!attemptId)
      return NextResponse.json(
        { message: "수정할 제출 결과가 없습니다." },
        { status: 400 },
      );

    // 관리자가 수정하는 것은 학생 답안/정오답뿐이다.
    // 최종 점수는 현재 답안과 정답표로 항상 다시 계산한다.
    const graded = gradeAnswers(answers as Record<string, unknown>);
    const gradedAt = new Date().toISOString();
    const { data, error } = await ctx.supabase
      .from("exam_attempts")
      .update({
        answers,
        score: graded.score,
        correct_count: graded.correct,
        wrong_numbers: graded.wrong,
        unanswered_numbers: graded.unanswered,
        graded_at: gradedAt,
        score_source: "auto",
        mathpooh_comment: String(body.mathpoohComment ?? ""),
      })
      .eq("id", attemptId)
      .eq("exam_id", examId)
      .select(
        "id,student_id,status,answers,started_at,last_saved_at,submitted_at,score,correct_count,wrong_numbers,unanswered_numbers,graded_at,score_source,solution_override,mathpooh_comment",
      )
      .single();
    if (error)
      return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ attempt: data });
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
          paused_at: null,
          paused_remaining_seconds: null,
        }
      : {
          student_open: Boolean(body.studentOpen),
          open_at: startedAt.toISOString(),
          close_at: null,
          paused_at: null,
          paused_remaining_seconds: null,
        };
  const { data, error } = await ctx.supabase
    .from("exams")
    .update(payload)
    .eq("id", examId)
    .select("id,title,exam_date,time_limit,student_open,open_at,close_at,paused_at,paused_remaining_seconds")
    .single();
  return error
    ? NextResponse.json({ message: error.message }, { status: 400 })
    : NextResponse.json({ exam: data });
}
