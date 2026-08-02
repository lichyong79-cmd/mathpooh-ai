import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

async function context() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (user.user_metadata?.role !== "student") return { error: NextResponse.json({ message: "학생 계정으로 로그인해 주세요." }, { status: 403 }) };
  const supabase = createServerSupabase();
  const { data: student } = await supabase.from("students").select("*").eq("auth_user_id", user.id).maybeSingle();
  if (!student) return { error: NextResponse.json({ message: "연결된 학생 정보가 없습니다." }, { status: 404 }) };
  return { user, student, supabase };
}

export async function GET() {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const { student, supabase } = ctx;
  const now = new Date().toISOString();
  const { data: registrations, error: registrationError } = await supabase.from("exam_registrations").select("exam_id,status").eq("student_id", student.id);
  if (registrationError) return NextResponse.json({ message: registrationError.message }, { status: 400 });
  const registrationMap = new Map((registrations ?? []).map((item) => [item.exam_id, item.status]));
  const { data: exams, error } = await supabase.from("exams").select("id,title,exam_code,exam_date,grade,subject,exam_range,question_count,time_limit,total_score,objective_count,short_answer_count,test_file_path,status,student_open,open_at,close_at").eq("student_open", true).order("exam_date", { ascending: false });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  const ids = (exams ?? []).map((exam) => exam.id);
  const { data: attempts } = ids.length ? await supabase.from("exam_attempts").select("*").eq("student_id", student.id).in("exam_id", ids) : { data: [] };
  const attemptMap = new Map((attempts ?? []).map((attempt) => [attempt.exam_id, attempt]));
  const items = await Promise.all((exams ?? []).map(async (exam) => {
    const savedStatus = registrationMap.get(exam.id);
    const applicationStatus = savedStatus === "assigned" || savedStatus === "requested" ? savedStatus : "none";
    let testUrl = "";
    if (applicationStatus === "assigned" && exam.test_file_path) testUrl = (await supabase.storage.from("exam-files").createSignedUrl(exam.test_file_path, 60 * 60 * 3)).data?.signedUrl ?? "";
    return { ...exam, application_status: applicationStatus, test_url: testUrl, attempt: attemptMap.get(exam.id) ?? null, available: applicationStatus === "assigned" && (!exam.open_at || exam.open_at <= now) && (!exam.close_at || exam.close_at >= now) };
  }));
  return NextResponse.json({ student: { id: student.id, name: student.name, school: student.school, grade: student.grade, passwordChanged: student.password_changed }, exams: items });
}

export async function POST(request: Request) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const { student, supabase } = ctx;
  const body = await request.json();
  const action = String(body.action ?? "");
  if (action === "change-password") {
    const password = String(body.password ?? "");
    if (password.length < 6) return NextResponse.json({ message: "새 비밀번호는 6자리 이상이어야 합니다." }, { status: 400 });
    const updated = await supabase.auth.admin.updateUserById(student.auth_user_id, { password });
    if (updated.error) return NextResponse.json({ message: updated.error.message }, { status: 400 });
    await supabase.from("students").update({ password_changed: true }).eq("id", student.id);
    return NextResponse.json({ success: true });
  }
  const examId = String(body.examId ?? "");
  if (action === "request") {
    const { data: exam } = await supabase.from("exams").select("id,student_open").eq("id", examId).eq("student_open", true).maybeSingle();
    if (!exam) return NextResponse.json({ message: "현재 신청 가능한 시험이 아닙니다." }, { status: 404 });
    const { error } = await supabase.from("exam_registrations").upsert({ exam_id: examId, student_id: student.id, status: "requested", requested_at: new Date().toISOString(), assigned_at: null }, { onConflict: "exam_id,student_id" });
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ success: true, status: "requested" });
  }
  if (action === "cancel-request") {
    const { error } = await supabase.from("exam_registrations").delete().eq("exam_id", examId).eq("student_id", student.id).eq("status", "requested");
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ success: true, status: "none" });
  }
  const { data: registration } = await supabase.from("exam_registrations").select("id,status").eq("exam_id", examId).eq("student_id", student.id).maybeSingle();
  if (!registration || registration.status !== "assigned") return NextResponse.json({ message: "아직 시험 배정이 완료되지 않았습니다." }, { status: 403 });
  const { data: exam } = await supabase.from("exams").select("*").eq("id", examId).eq("student_open", true).maybeSingle();
  if (!exam) return NextResponse.json({ message: "응시 가능한 시험이 아닙니다." }, { status: 404 });
  const now = new Date().toISOString();
  if ((exam.open_at && exam.open_at > now) || (exam.close_at && exam.close_at < now)) {
    return NextResponse.json({ message: "현재는 이 시험의 응시 시간이 아닙니다." }, { status: 403 });
  }
  const { data: existing } = await supabase.from("exam_attempts").select("*").eq("exam_id", examId).eq("student_id", student.id).maybeSingle();
  if (action === "start") {
    if (existing?.status === "submitted") return NextResponse.json({ message: "이미 제출한 시험입니다." }, { status: 409 });
    if (existing) return NextResponse.json({ attempt: existing });
    const { data, error } = await supabase.from("exam_attempts").insert({ exam_id: examId, student_id: student.id }).select().single();
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ attempt: data });
  }
  if (!existing || existing.status !== "in_progress") return NextResponse.json({ message: "진행 중인 시험이 없습니다." }, { status: 409 });
  const answers = typeof body.answers === "object" && body.answers ? body.answers : {};
  const previous = existing.answers ?? {};
  const changes = { ...(existing.answer_changes ?? {}) } as Record<string, number>;
  for (const key of Object.keys(answers)) if (String(previous[key] ?? "") !== String(answers[key] ?? "")) changes[key] = Number(changes[key] ?? 0) + 1;
  if (action === "save") {
    const { error } = await supabase.from("exam_attempts").update({ answers, answer_changes: changes, last_saved_at: new Date().toISOString() }).eq("id", existing.id);
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ success: true, savedAt: new Date().toISOString() });
  }
  if (action === "submit") {
    const keys = Array.isArray(exam.answer_keys) ? exam.answer_keys.map(String) : [];
    const wrong: number[] = [], unanswered: number[] = [];
    let correct = 0;
    for (let no = 1; no <= Number(exam.question_count); no++) {
      const answer = String(answers[no] ?? answers[String(no)] ?? "").trim();
      if (!answer) unanswered.push(no);
      else if (keys[no - 1] && answer === String(keys[no - 1]).trim()) correct++;
      else wrong.push(no);
    }
    const score = Math.round((correct / Math.max(1, Number(exam.question_count))) * Number(exam.total_score));
    const submittedAt = new Date().toISOString();
    const { error } = await supabase.from("exam_attempts").update({ status: "submitted", answers, answer_changes: changes, submitted_at: submittedAt, last_saved_at: submittedAt, score, correct_count: correct, wrong_numbers: wrong, unanswered_numbers: unanswered, graded_at: submittedAt }).eq("id", existing.id);
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ success: true, score, correct, wrong, unanswered });
  }
  return NextResponse.json({ message: "지원하지 않는 요청입니다." }, { status: 400 });
}
