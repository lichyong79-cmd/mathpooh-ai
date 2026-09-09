import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { calculateExamScore } from "@/lib/exam-score";
import {
  buildLandmarkSummary,
  clampPercentile,
  classifyLandmarkSubject,
  classifyLandmarkQuestionSubject,
  cohortPercentile,
  estimatePercentile,
  type LandmarkBasis,
  type LandmarkRecord,
} from "@/lib/landmark";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function context() {
  const user = await getSessionUser();
  if (!user)
    return {
      error: NextResponse.json(
        { message: "로그인이 필요합니다." },
        { status: 401 },
      ),
    };
  if (user.user_metadata?.role !== "student")
    return {
      error: NextResponse.json(
        { message: "학생 계정으로 로그인해 주세요." },
        { status: 403 },
      ),
    };
  const supabase = createServerSupabase();
  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!student)
    return {
      error: NextResponse.json(
        { message: "연결된 학생 정보가 없습니다." },
        { status: 404 },
      ),
    };

  // SOS325: 휴원·퇴원 상태는 저장만 되고 아무 효과가 없었다.
  // 휴원 학생도 그대로 로그인해 학습을 진행할 수 있었다.
  // 학습기록은 그대로 두고 접근만 막는다. 복귀 시 상태만 되돌리면 이어서 쓸 수 있다.
  const membershipStatus = String(student.status ?? "");
  if (membershipStatus === "휴원" || membershipStatus === "퇴원")
    return {
      error: NextResponse.json(
        {
          message:
            membershipStatus === "휴원"
              ? "현재 휴원 중입니다. 학습을 다시 시작하려면 학원으로 문의해 주세요."
              : "퇴원 처리된 계정입니다. 학원으로 문의해 주세요.",
          suspended: membershipStatus,
        },
        { status: 403 },
      ),
    };

  return { user, student, supabase };
}

async function writeActivityLog(
  supabase: ReturnType<typeof createServerSupabase>,
  examId: string,
  studentId: string,
  attemptId: string | null,
  eventType: string,
  detail: string,
) {
  await supabase.from("exam_activity_logs").insert({
    exam_id: examId,
    student_id: studentId,
    attempt_id: attemptId,
    event_type: eventType,
    detail,
    occurred_at: new Date().toISOString(),
  });
}

async function hasCycleAccess(supabase: any, studentId: string, examId: string) {
  const links = await supabase.from("learning_cycle_exams").select("cycle_id").eq("exam_id", examId);
  if (links.error || !(links.data ?? []).length) return false;
  const cycleIds: string[] = (links.data ?? []).map((x: any) => String(x.cycle_id));
  const membership = await supabase.from("learning_cycle_students").select("id").eq("student_id", studentId).eq("status", "ACTIVE").in("cycle_id", cycleIds).limit(1);
  return !membership.error && Boolean(membership.data?.length);
}

export async function GET(request: Request) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const { student, supabase } = ctx;
  const now = new Date().toISOString();
  // SOS309: 시험 시작 대기 화면은 종전까지 2초마다 학생 포털 전체를 다시 읽었다.
  // 이 경량 분기는 해당 시험의 시작/중지 상태만 반환한다.
  const statusExamId = new URL(request.url).searchParams.get("examStatus");
  if (statusExamId) {
    const [examResult, registrationResult] = await Promise.all([
      supabase
        .from("exams")
        .select(
          "id,open_at,close_at,paused_at,paused_remaining_seconds,status,student_open",
        )
        .eq("id", statusExamId)
        .maybeSingle(),
      supabase
        .from("exam_registrations")
        .select("status")
        .eq("student_id", student.id)
        .eq("exam_id", statusExamId)
        .maybeSingle(),
    ]);
    if (examResult.error || !examResult.data)
      return NextResponse.json(
        { message: examResult.error?.message || "시험을 찾지 못했습니다." },
        { status: 404 },
      );
    const cycleAssigned = registrationResult.data?.status === "assigned" ? false : await hasCycleAccess(supabase, String(student.id), statusExamId);
    return NextResponse.json(
      {
        success: true,
        exam: examResult.data,
        assigned: registrationResult.data?.status === "assigned" || cycleAssigned,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const { data: registrations, error: registrationError } = await supabase
    .from("exam_registrations")
    .select("exam_id,status")
    .eq("student_id", student.id);
  if (registrationError)
    return NextResponse.json(
      { message: registrationError.message },
      { status: 400 },
    );
  const accessibleExamIds = new Set<string>(
    (registrations ?? [])
      .filter((item) => item.status === "assigned")
      .map((item) => String(item.exam_id)),
  );
  const memberships = await supabase.from("learning_cycle_students").select("cycle_id").eq("student_id", student.id).eq("status", "ACTIVE");
  // 배포 직후 마이그레이션 전에도 학생 로그인 자체는 막지 않는다.
  const memberCycleIds: string[] = (memberships.data ?? []).map((x: any) => String(x.cycle_id));
  let memberExamLinks: any[] = [];
  let memberCycles: any[] = [];
  if (memberCycleIds.length) {
    const [cycleExams, cycles] = await Promise.all([
      supabase.from("learning_cycle_exams").select("cycle_id,exam_id").in("cycle_id", memberCycleIds),
      supabase.from("learning_cycles").select("id,name,start_date,end_date,status").in("id", memberCycleIds).order("start_date", { ascending: false }),
    ]);
    memberExamLinks = cycleExams.data ?? [];
    memberCycles = cycles.data ?? [];
    for (const row of memberExamLinks) accessibleExamIds.add(String(row.exam_id));
  }
  const { data: exams, error } = await supabase
    .from("exams")
    .select(
      "id,title,exam_code,exam_date,grade,subject,exam_range,question_count,time_limit,total_score,question_points,objective_count,short_answer_count,test_file_path,solution_file_path,status,student_open,open_at,close_at,paused_at,paused_remaining_seconds,answer_keys,solution_open",
    )
    .order("exam_date", { ascending: false })
    // 최근 시험과 현재 배정 화면에 충분한 범위만 내려 장기 누적 시 초기 로딩을 보호한다.
    .limit(60);
  if (error)
    return NextResponse.json({ message: error.message }, { status: 400 });
  const ids = (exams ?? []).map((exam) => exam.id);
  const { data: attempts } = ids.length
    ? await supabase
        .from("exam_attempts")
        .select("*")
        .eq("student_id", student.id)
        .in("exam_id", ids)
    : { data: [] };
  const attemptMap = new Map(
    (attempts ?? []).map((attempt) => [attempt.exam_id, attempt]),
  );
  // SOS309: 제출 시험마다 문항 분석을 따로 읽던 N+1 쿼리를 한 번으로 합친다.
  const submittedExamIds = (attempts ?? [])
    .filter((attempt) => attempt.status === "submitted")
    .map((attempt) => String(attempt.exam_id));
  const metadataResult = submittedExamIds.length
    ? await supabase
        .from("exam_question_analysis")
        .select(
          "exam_id,question_no,major_unit,middle_unit,minor_unit,detailed_topic,question_type,problem_types,difficulty",
        )
        .in("exam_id", submittedExamIds)
        .order("question_no")
    : { data: [], error: null };
  const metadataByExam = new Map<string, any[]>();
  for (const row of metadataResult.data ?? []) {
    const key = String(row.exam_id);
    metadataByExam.set(key, [...(metadataByExam.get(key) ?? []), row]);
  }
  const items = await Promise.all(
    (exams ?? [])
      .filter(
        (exam) =>
          accessibleExamIds.has(String(exam.id)) || attemptMap.has(exam.id),
      )
      .map(async (exam) => {
      const downloadAvailableAt = exam.open_at
        ? new Date(
            new Date(exam.open_at).getTime() - 60 * 60 * 1000,
          ).toISOString()
        : null;
      // 회차에 시험을 연결하면 학생에게 일정 카드는 바로 보이되,
      // 시험지 파일은 시작 시각이 정해진 뒤 1시간 전부터만 내려준다.
      const downloadAvailable = Boolean(
        downloadAvailableAt && downloadAvailableAt <= now,
      );
      let testUrl = "";
      if (downloadAvailable && exam.test_file_path)
        testUrl =
          (
            await supabase.storage
              .from("exam-files")
              .createSignedUrl(exam.test_file_path, 60 * 60 * 3)
          ).data?.signedUrl ?? "";
      let attempt = attemptMap.get(exam.id) ?? null;
      const submitted = attempt?.status === "submitted";
      if (submitted && attempt) {
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
          JSON.stringify(attempt.wrong_numbers ?? []) !==
            JSON.stringify(graded.wrong) ||
          JSON.stringify(attempt.unanswered_numbers ?? []) !==
            JSON.stringify(graded.unanswered);
        attempt = {
          ...attempt,
          score: graded.score,
          correct_count: graded.correct,
          wrong_numbers: graded.wrong,
          unanswered_numbers: graded.unanswered,
          score_source: "auto",
        };
        if (changed) {
          await supabase
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
      }
      let solutionUrl = "";
      const solutionAllowed =
        submitted &&
        (attempt?.solution_override ?? exam.solution_open) === true;
      if (solutionAllowed && exam.solution_file_path)
        solutionUrl =
          (
            await supabase.storage
              .from("exam-files")
              .createSignedUrl(exam.solution_file_path, 60 * 60 * 3)
          ).data?.signedUrl ?? "";
      const { answer_keys, solution_file_path, ...safeExam } = exam;
      const questionMetadata = submitted
        ? (metadataByExam.get(String(exam.id)) ?? [])
        : [];
      return {
        ...safeExam,
        test_url: testUrl,
        solution_url: solutionUrl,
        solution_registered: Boolean(exam.solution_file_path),
        download_available: downloadAvailable,
        download_available_at: downloadAvailableAt,
        official_answers:
          submitted && Array.isArray(answer_keys)
            ? answer_keys.map(String)
            : [],
        question_metadata: questionMetadata,
        attempt,
        mathpooh_comment: submitted
          ? String(attempt?.mathpooh_comment ?? "")
          : "",
        solution_open: solutionAllowed,
        available:
          Boolean(exam.student_open) &&
          !exam.paused_at &&
          Boolean(exam.close_at) &&
          (!exam.open_at || exam.open_at <= now) &&
          exam.close_at >= now,
      };
    }),
  );
  /* ── SOS LANDMARK ────────────────────────────────────────────────────────
     제출한 시험마다 같은 시험 응시자 전체 점수를 모아 실제 백분위를 계산합니다.
     응시 인원이 적으면(기본 8명 미만) 원점수 환산 추정 백분위로 대체합니다.
     응시자 점수는 집계에만 쓰고, 다른 학생 정보는 응답에 담지 않습니다. */
  const landmarkExamIds = items
    .filter((item) => item.attempt?.status === "submitted")
    .map((item) => item.id);
  const peerRows: { exam_id: string; score: number | null }[] =
    landmarkExamIds.length
      ? ((
          await supabase
            .from("exam_attempts")
            .select("exam_id,score")
            .eq("status", "submitted")
            .in("exam_id", landmarkExamIds)
        ).data ?? [])
      : [];
  const peerScores = new Map<string, number[]>();
  for (const row of peerRows) {
    const score = Number(row.score ?? 0);
    if (!Number.isFinite(score)) continue;
    const list = peerScores.get(row.exam_id) ?? [];
    list.push(score);
    peerScores.set(row.exam_id, list);
  }

  const landmarkRecords: LandmarkRecord[] = [];
  const examItems = items.map((item) => {
    if (item.attempt?.status !== "submitted")
      return {
        ...item,
        percentile: null,
        percentile_basis: null,
        participants: 0,
      };
    const score = Number(item.attempt.score ?? 0);
    const peers = peerScores.get(item.id) ?? [];
    const cohort = cohortPercentile(score, peers);
    const percentile = clampPercentile(
      cohort ?? estimatePercentile(score, Number(item.total_score ?? 100)),
    );
    const basis: LandmarkBasis = cohort === null ? "estimated" : "cohort";
    const answers = (item.attempt?.answers ?? {}) as Record<string, unknown>;
    const keys = Array.isArray(item.official_answers)
      ? item.official_answers.map(String)
      : [];
    const buckets = new Map<string, { total: number; correct: number }>();
    for (const meta of item.question_metadata ?? []) {
      const no = Number(meta.question_no);
      const subject = classifyLandmarkQuestionSubject(
        meta.major_unit,
        meta.middle_unit,
        meta.minor_unit,
        meta.detailed_topic,
      );
      if (!subject) continue;
      const row = buckets.get(subject) ?? { total: 0, correct: 0 };
      row.total += 1;
      const answer = String(answers[no] ?? answers[String(no)] ?? "").trim();
      const key = String(keys[no - 1] ?? "").trim();
      if (key && answer === key) row.correct += 1;
      buckets.set(subject, row);
    }
    if (!buckets.size) {
      const subject = classifyLandmarkSubject(item.subject, item.title);
      if (subject)
        buckets.set(subject, {
          total: Number(item.question_count ?? 1),
          correct: Number(item.attempt.correct_count ?? 0),
        });
    }
    for (const [subject, bucket] of buckets) {
      const subjectScore = Math.round(
        (bucket.correct / Math.max(1, bucket.total)) * 100,
      );
      landmarkRecords.push({
        subject: subject as any,
        percentile: estimatePercentile(subjectScore, 100),
        basis: "estimated",
        score: subjectScore,
        title: item.title ?? "",
        date: item.attempt.submitted_at ?? item.exam_date ?? "",
      });
    }
    return {
      ...item,
      percentile,
      percentile_basis: basis,
      participants: peers.length,
    };
  });
  const landmark = buildLandmarkSummary(landmarkRecords);
  const examLinkByCycle = new Map(
    memberExamLinks.map((row: any) => [String(row.cycle_id), String(row.exam_id)]),
  );
  const examById = new Map(examItems.map((exam: any) => [String(exam.id), exam]));
  const examSchedules = memberCycles.map((cycle: any) => {
    const examId = examLinkByCycle.get(String(cycle.id)) ?? null;
    return {
      cycle_id: String(cycle.id),
      cycle_name: String(cycle.name ?? "SOS 회차"),
      start_date: cycle.start_date,
      end_date: cycle.end_date,
      exam_id: examId,
      exam_linked: Boolean(examId && examById.has(examId)),
    };
  });

  const { data: sosSessions } = await supabase
    .from("sos_training_sessions")
    .select(
      "id,phase,status,target_snapshot,round_no,correct_count,total_count,decision,created_at",
    )
    .eq("student_id", student.id)
    .in("status", ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "PASSED", "RETRAIN"])
    .order("created_at", { ascending: false })
    .limit(20);
  return NextResponse.json(
    {
      student: {
        id: student.id,
        name: student.name,
        school: student.school,
        grade: student.grade,
        passwordChanged: student.password_changed,
      },
      exams: examItems,
      examSchedules,
      sosSessions: sosSessions ?? [],
      landmark,
    },
    {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}

export async function POST(request: Request) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const { student, supabase } = ctx;
  const body = await request.json();
  const action = String(body.action ?? "");
  if (action === "change-password") {
    const password = String(body.password ?? "");
    if (password.length < 6)
      return NextResponse.json(
        { message: "새 비밀번호는 6자리 이상이어야 합니다." },
        { status: 400 },
      );
    // SOS305: 처음 받은 비밀번호를 그대로 다시 넣으면 변경한 의미가 없다.
    const initialPhone = String(student.phone ?? "").replace(/\D/g, "");
    if (initialPhone.length >= 4 && password === `Mp!${initialPhone.slice(-4)}`)
      return NextResponse.json(
        { message: "처음 받은 비밀번호와 다른 값으로 정해 주세요." },
        { status: 400 },
      );
    const updated = await supabase.auth.admin.updateUserById(
      student.auth_user_id,
      { password },
    );
    if (updated.error)
      return NextResponse.json(
        { message: updated.error.message },
        { status: 400 },
      );
    await supabase
      .from("students")
      .update({ password_changed: true })
      .eq("id", student.id);
    return NextResponse.json({ success: true });
  }
  const examId = String(body.examId ?? "");
  if (action === "activity-log") {
    const eventType = String(body.eventType ?? "activity").slice(0, 60);
    const detail = String(body.detail ?? "").slice(0, 300);
    const { data: attemptRow } = await supabase
      .from("exam_attempts")
      .select("id")
      .eq("exam_id", examId)
      .eq("student_id", student.id)
      .maybeSingle();
    const { error } = await supabase.from("exam_activity_logs").insert({
      exam_id: examId,
      student_id: student.id,
      attempt_id: attemptRow?.id ?? null,
      event_type: eventType,
      detail,
      occurred_at: new Date().toISOString(),
    });
    return error
      ? NextResponse.json({ message: error.message }, { status: 400 })
      : NextResponse.json({ success: true });
  }
  if (action === "request" || action === "cancel-request")
    return NextResponse.json(
      { message: "학생 페이지에서는 처리할 수 없는 요청입니다." },
      { status: 403 },
    );
  const { data: registration } = await supabase
    .from("exam_registrations")
    .select("id,status")
    .eq("exam_id", examId)
    .eq("student_id", student.id)
    .maybeSingle();
  const cycleAssigned = registration?.status === "assigned" ? false : await hasCycleAccess(supabase, String(student.id), examId);
  if ((!registration || registration.status !== "assigned") && !cycleAssigned)
    return NextResponse.json(
      { message: "이 회차에 등록된 학생만 응시할 수 있습니다." },
      { status: 403 },
    );
  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .eq("student_open", true)
    .maybeSingle();
  if (!exam)
    return NextResponse.json(
      { message: "응시 가능한 시험이 아닙니다." },
      { status: 404 },
    );
  const now = new Date().toISOString();
  if (
    action === "start" &&
    ((exam.open_at && exam.open_at > now) ||
      exam.paused_at ||
      !exam.close_at ||
      exam.close_at <= now)
  ) {
    return NextResponse.json(
      { message: "현재는 이 시험의 응시 시간이 아닙니다." },
      { status: 403 },
    );
  }
  const { data: existing } = await supabase
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", examId)
    .eq("student_id", student.id)
    .maybeSingle();
  if (action === "start") {
    if (existing?.status === "submitted")
      return NextResponse.json(
        { message: "이미 제출한 시험입니다." },
        { status: 409 },
      );
    if (existing) {
      await writeActivityLog(
        supabase,
        examId,
        student.id,
        existing.id,
        "exam_started",
        "시험 응시 시작",
      );
      return NextResponse.json({ attempt: existing });
    }
    const { data, error } = await supabase
      .from("exam_attempts")
      .insert({
        exam_id: examId,
        student_id: student.id,
        started_at: new Date().toISOString(),
        last_saved_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (!error && data)
      await writeActivityLog(
        supabase,
        examId,
        student.id,
        data.id,
        "exam_started",
        "시험 응시 시작",
      );
    return error
      ? NextResponse.json({ message: error.message }, { status: 400 })
      : NextResponse.json({ attempt: data });
  }
  if (!existing || existing.status !== "in_progress")
    return NextResponse.json(
      { message: "진행 중인 시험이 없습니다." },
      { status: 409 },
    );
  if (exam.paused_at)
    return NextResponse.json(
      { message: "시험이 일시정지되었습니다. 재개될 때까지 기다려 주세요." },
      { status: 423 },
    );
  const answers =
    typeof body.answers === "object" && body.answers ? body.answers : {};
  const previous = existing.answers ?? {};
  const changes = { ...(existing.answer_changes ?? {}) } as Record<
    string,
    number
  >;
  for (const key of Object.keys(answers))
    if (String(previous[key] ?? "") !== String(answers[key] ?? ""))
      changes[key] = Number(changes[key] ?? 0) + 1;
  if (action === "save") {
    if (exam.close_at && exam.close_at <= now)
      return NextResponse.json(
        { message: "시험 시간이 종료되어 답안이 마감되었습니다." },
        { status: 409 },
      );
    const savedAt = new Date().toISOString();
    const { error } = await supabase
      .from("exam_attempts")
      .update({
        answers,
        answer_changes: changes,
        last_saved_at: savedAt,
      })
      .eq("id", existing.id);
    const answerChanged = Object.keys(answers).some(
      (key) => String(previous[key] ?? "") !== String(answers[key] ?? ""),
    );
    if (!error && answerChanged) {
      const answeredCount = Object.values(answers).filter((value) =>
        String(value ?? "").trim(),
      ).length;
      await writeActivityLog(
        supabase,
        examId,
        student.id,
        existing.id,
        "answer_saved",
        `답안 ${answeredCount}개 저장`,
      );
    }
    return error
      ? NextResponse.json({ message: error.message }, { status: 400 })
      : NextResponse.json({ success: true, savedAt });
  }
  if (action === "submit") {
    const graded = calculateExamScore(
      answers as Record<string, unknown>,
      exam.answer_keys,
      Number(exam.question_count),
      Number(exam.total_score ?? 100),
      exam.question_points,
    );
    const { score, correct, wrong, unanswered } = graded;
    const submittedAt = new Date().toISOString();
    const { error } = await supabase
      .from("exam_attempts")
      .update({
        status: "submitted",
        answers,
        answer_changes: changes,
        submitted_at: submittedAt,
        last_saved_at: submittedAt,
        score,
        correct_count: correct,
        wrong_numbers: wrong,
        unanswered_numbers: unanswered,
        graded_at: submittedAt,
        score_source: "auto",
      })
      .eq("id", existing.id);
    if (!error)
      await writeActivityLog(
        supabase,
        examId,
        student.id,
        existing.id,
        "exam_submitted",
        `제출 완료 · ${score}점`,
      );
    return error
      ? NextResponse.json({ message: error.message }, { status: 400 })
      : NextResponse.json({ success: true, score, correct, wrong, unanswered });
  }
  return NextResponse.json(
    { message: "지원하지 않는 요청입니다." },
    { status: 400 },
  );
}
