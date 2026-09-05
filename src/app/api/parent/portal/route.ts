import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { calculateExamScore } from "@/lib/exam-score";

export const dynamic = "force-dynamic";
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { message: "로그인이 필요합니다." },
      { status: 401 },
    );
  if (String(user.user_metadata?.role) !== "parent")
    return NextResponse.json(
      { message: "학부모 계정으로 로그인해 주세요." },
      { status: 403 },
    );
  const phone = digits(
    user.user_metadata?.parent_phone ?? String(user.email ?? "").split("@")[0],
  );
  if (phone.length < 10)
    return NextResponse.json(
      { message: "학부모 전화번호가 계정에 연결되지 않았습니다." },
      { status: 404 },
    );
  const supabase = createClient();
  const childrenResult = await supabase
    .from("students")
    .select("id,name,school,grade,status,parent_phone,phone")
    .eq("parent_phone", phone)
    .order("name");
  if (childrenResult.error)
    return NextResponse.json(
      { message: childrenResult.error.message },
      { status: 400 },
    );
  const children = childrenResult.data ?? [];
  const ids = children.map((x: any) => x.id);
  // SOS305: 학부모 계정도 학생과 같은 초기 비밀번호(전화번호 뒤 4자리) 규칙을 쓴다.
  // 학부모 전화번호는 학생들끼리도 아는 경우가 많고, 이 계정 하나로 형제자매 전체의
  // 성적·진단·바로미터·교사 코멘트를 볼 수 있다. 첫 로그인 시 변경을 강제한다.
  const passwordChanged = user.user_metadata?.password_changed === true;

  if (!ids.length)
    return NextResponse.json({
      parentPhone: phone,
      passwordChanged,
      children: [],
      reports: [],
      posters: [],
    });

  const [attemptResult, sessionResult, jobResult, posterResult] = await Promise.all([
    supabase
      .from("exam_attempts")
      .select(
        "id,exam_id,student_id,status,score,correct_count,answers,wrong_numbers,unanswered_numbers,submitted_at,created_at,mathpooh_comment",
      )
      .in("student_id", ids)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(Math.max(36, ids.length * 18)),
    supabase
      .from("sos_training_sessions")
      .select(
        "id,student_id,parent_session_id,phase,status,target_snapshot,weakness_snapshot,cycle_kind,round_no,correct_count,total_count,baseline_meter,goal_meter,training_meter,review_meter,decision,created_at,updated_at,sos_training_items(id,student_answer,answered_at,review_answered_at,is_correct)",
      )
      .in("student_id", ids)
      .order("created_at", { ascending: false })
      .limit(Math.max(120, ids.length * 60)),
    supabase
      .from("sos_ai_generation_jobs")
      .select(
        "student_id,source_training_session_id,status,generation_kind,requested_count,stage_message,requested_at,updated_at",
      )
      .in("student_id", ids)
      .order("requested_at", { ascending: false })
      .limit(Math.max(20, ids.length * 10)),
    supabase
      .from("site_posters")
      .select("id,title,image_path,link_url,sort_order")
      .eq("is_published", true)
      .order("sort_order")
      .order("created_at", { ascending: false }),
  ]);
  if (attemptResult.error || sessionResult.error || posterResult.error)
    return NextResponse.json(
      { message: attemptResult.error?.message || sessionResult.error?.message || posterResult.error?.message },
      { status: 400 },
    );
  const attempts = attemptResult.data ?? [];
  const examIds = [...new Set(attempts.map((x: any) => x.exam_id))];
  const examsResult = examIds.length
    ? await supabase
        .from("exams")
        .select(
          "id,title,exam_code,exam_date,subject,total_score,question_count,question_points,answer_keys",
        )
        .in("id", examIds)
    : { data: [], error: null };
  const analysisResult = examIds.length
    ? await supabase
        .from("exam_question_analysis")
        .select(
          "exam_id,question_no,major_unit,middle_unit,minor_unit,detailed_topic,difficulty",
        )
        .in("exam_id", examIds)
    : { data: [], error: null };
  const examMap = new Map(
    (examsResult.data ?? []).map((x: any) => [String(x.id), x]),
  );
  const analysisMap = new Map<string, any[]>();
  for (const row of analysisResult.data ?? []) {
    const key = String(row.exam_id);
    analysisMap.set(key, [...(analysisMap.get(key) ?? []), row]);
  }
  const label = (row: any) =>
    String(
      row.minor_unit ||
        row.middle_unit ||
        row.major_unit ||
        row.detailed_topic ||
        "미분류",
    );
  const examRows = attempts.map((attempt: any) => {
    const exam: any = examMap.get(String(attempt.exam_id)) ?? {};
    const graded = calculateExamScore(
      attempt.answers ?? {},
      exam.answer_keys,
      Number(exam.question_count ?? 0),
      Number(exam.total_score ?? 100),
      exam.question_points,
    );
    const units = new Map<string, { total: number; correct: number }>();
    const difficulties = new Map<string, { total: number; correct: number }>();
    for (const meta of analysisMap.get(String(attempt.exam_id)) ?? []) {
      const no = Number(meta.question_no);
      const answer = String(
        (attempt.answers ?? {})[no] ??
          (attempt.answers ?? {})[String(no)] ??
          "",
      ).trim();
      const key = String((exam.answer_keys ?? [])[no - 1] ?? "").trim();
      const correct = Boolean(key) && answer === key;
      const u = label(meta);
      const uv = units.get(u) ?? { total: 0, correct: 0 };
      uv.total++;
      if (correct) uv.correct++;
      units.set(u, uv);
      const d = String(meta.difficulty || "미분류");
      const dv = difficulties.get(d) ?? { total: 0, correct: 0 };
      dv.total++;
      if (correct) dv.correct++;
      difficulties.set(d, dv);
    }
    const bars = (m: Map<string, { total: number; correct: number }>) =>
      [...m]
        .map(([name, v]) => ({
          name,
          total: v.total,
          correct: v.correct,
          rate: Math.round((v.correct / Math.max(1, v.total)) * 100),
        }))
        .sort((a, b) => b.total - a.total);
    return {
      id: attempt.id,
      studentId: attempt.student_id,
      title: exam.title ?? "시험",
      examCode: exam.exam_code ?? "",
      examDate: exam.exam_date ?? attempt.submitted_at,
      subject: exam.subject ?? "",
      score: graded.score,
      totalScore: Number(exam.total_score ?? 100),
      correct: graded.correct,
      total: Number(exam.question_count ?? 0),
      wrong: graded.wrong,
      unanswered: graded.unanswered,
      submittedAt: attempt.submitted_at,
      comment: String(attempt.mathpooh_comment ?? ""),
      units: bars(units),
      difficulties: bars(difficulties),
    };
  });
  const reports = children.map((child: any) => ({
    student: {
      id: child.id,
      name: child.name,
      school: child.school,
      grade: child.grade,
      status: child.status,
      phone: child.phone ?? "",
    },
    exams: examRows
      .filter((x: any) => String(x.studentId) === String(child.id))
      .slice(0, 12),
    sos: (sessionResult.data ?? [])
      .filter((x: any) => String(x.student_id) === String(child.id))
      .slice(0, 40),
    generationJobs: (jobResult.data ?? [])
      .filter((x: any) => String(x.student_id) === String(child.id))
      .slice(0, 5),
  }));
  const posters = await Promise.all(
    (posterResult.data ?? []).map(async (poster: any) => ({
      id: poster.id,
      title: poster.title,
      link_url: poster.link_url,
      sort_order: poster.sort_order,
      image_url:
        (
          await supabase.storage
            .from("site-posters")
            .createSignedUrl(poster.image_path, 60 * 60 * 3)
        ).data?.signedUrl ?? "",
    })),
  );
  const [programBatchResult, programLinkResult, parentApplicationResult] = await Promise.all([
    supabase.from("sos_program_batches").select("id,title,price,application_start,application_end,capacity,memo,is_published,created_at").eq("is_published", true).order("created_at", { ascending: false }),
    supabase.from("sos_program_batch_cycles").select("batch_id,slot_no,learning_cycles(id,name,start_date,end_date,status)").order("slot_no"),
    supabase.from("sos_program_applications").select("id,batch_id,student_id,student_name,status,payment_method,requested_at,paid_at,enrolled_at").eq("parent_phone", phone).order("requested_at", { ascending: false }),
  ]);
  const programMissing = programBatchResult.error?.message?.includes("sos_program_");
  const nowIso = new Date().toISOString();
  const todayKorea = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const programBatches = programMissing ? [] : (programBatchResult.data ?? []).map((batch: any) => ({
    ...batch,
    cycles: (programLinkResult.data ?? []).filter((x: any) => String(x.batch_id) === String(batch.id)).map((x: any) => ({ slot_no: x.slot_no, ...(x.learning_cycles ?? {}) })),
  })).filter((batch: any) => {
    if (batch.application_start && batch.application_start > nowIso) return false;
    if (batch.application_end && batch.application_end < nowIso) return false;
    const starts = (batch.cycles ?? []).map((cycle: any) => String(cycle.start_date ?? "").slice(0, 10)).filter(Boolean).sort();
    // 학부모 화면에서도 1회차가 지난 묶음은 '신청 가능' 목록에서 제거한다.
    return !starts[0] || starts[0] >= todayKorea;
  });
  return NextResponse.json(
    { parentPhone: phone, passwordChanged, children, reports, posters, programBatches, programApplications: programMissing ? [] : (parentApplicationResult.data ?? []) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || String(user.user_metadata?.role) !== "parent")
    return NextResponse.json(
      { message: "학부모 로그인이 필요합니다." },
      { status: 403 },
    );
  const body = await request.json();
  const action = String(body.action ?? "");
  if (action === "request" || action === "cancel-request") {
    const phone = digits(
      user.user_metadata?.parent_phone ?? String(user.email ?? "").split("@")[0],
    );
    const studentId = String(body.studentId ?? "");
    const examId = String(body.examId ?? "");
    const supabase = createClient();
    const child = await supabase
      .from("students")
      .select("id")
      .eq("id", studentId)
      .eq("parent_phone", phone)
      .maybeSingle();
    if (child.error || !child.data)
      return NextResponse.json(
        { message: "연결된 자녀 정보를 확인할 수 없습니다." },
        { status: 403 },
      );
    if (action === "request") {
      const exam = await supabase
        .from("exams")
        .select("id")
        .eq("id", examId)
        .eq("student_open", true)
        .maybeSingle();
      if (exam.error || !exam.data)
        return NextResponse.json(
          { message: "현재 신청 가능한 시험이 아닙니다." },
          { status: 404 },
        );
      const saved = await supabase.from("exam_registrations").upsert(
        {
          exam_id: examId,
          student_id: studentId,
          status: "requested",
          requested_at: new Date().toISOString(),
          assigned_at: null,
        },
        { onConflict: "exam_id,student_id" },
      );
      return saved.error
        ? NextResponse.json({ message: saved.error.message }, { status: 400 })
        : NextResponse.json({ success: true, status: "requested" });
    }
    const cancelled = await supabase
      .from("exam_registrations")
      .delete()
      .eq("exam_id", examId)
      .eq("student_id", studentId)
      .eq("status", "requested");
    return cancelled.error
      ? NextResponse.json({ message: cancelled.error.message }, { status: 400 })
      : NextResponse.json({ success: true, status: "none" });
  }
  const password = String(body.password ?? "");
  if (password.length < 6)
    return NextResponse.json(
      { message: "새 비밀번호는 6자리 이상이어야 합니다." },
      { status: 400 },
    );
  // SOS305: 초기 비밀번호를 그대로 쓰지 못하게 막는다.
  const phone = digits(
    user.user_metadata?.parent_phone ?? String(user.email ?? "").split("@")[0],
  );
  if (phone.length >= 4 && password === `Mp!${phone.slice(-4)}`)
    return NextResponse.json(
      { message: "처음 받은 비밀번호와 다른 값으로 정해 주세요." },
      { status: 400 },
    );

  const updated = await createClient().auth.admin.updateUserById(user.id, {
    password,
    user_metadata: { ...user.user_metadata, password_changed: true },
  });
  return updated.error
    ? NextResponse.json({ message: updated.error.message }, { status: 400 })
    : NextResponse.json({ success: true });
}
