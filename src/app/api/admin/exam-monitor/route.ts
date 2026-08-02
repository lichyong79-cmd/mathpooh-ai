import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

async function adminContext() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (user.user_metadata?.role === "student" || user.user_metadata?.role === "parent") return { error: NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 }) };
  return { supabase: createServerSupabase() };
}

export async function GET(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const examId = new URL(request.url).searchParams.get("examId");
  if (!examId) return NextResponse.json({ message: "시험을 선택해 주세요." }, { status: 400 });
  const { data: exam, error: examError } = await ctx.supabase.from("exams").select("id,title,exam_date,time_limit,student_open,open_at,close_at").eq("id", examId).maybeSingle();
  if (examError || !exam) return NextResponse.json({ message: examError?.message || "시험을 찾지 못했습니다." }, { status: 404 });
  const { data: registrations, error: registrationError } = await ctx.supabase.from("exam_registrations").select("student_id,status,requested_at,assigned_at").eq("exam_id", examId).eq("status", "assigned");
  if (registrationError) return NextResponse.json({ message: registrationError.message }, { status: 400 });
  const studentIds = (registrations ?? []).map((item) => item.student_id);
  if (!studentIds.length) return NextResponse.json({ exam, rows: [] });
  const [{ data: students, error: studentError }, { data: attempts, error: attemptError }] = await Promise.all([
    ctx.supabase.from("students").select("id,name,school,grade,phone").in("id", studentIds),
    ctx.supabase.from("exam_attempts").select("id,student_id,status,answers,started_at,last_saved_at,submitted_at,score,correct_count").eq("exam_id", examId).in("student_id", studentIds),
  ]);
  if (studentError || attemptError) return NextResponse.json({ message: studentError?.message || attemptError?.message }, { status: 400 });
  const studentMap = new Map((students ?? []).map((student) => [student.id, student]));
  const attemptMap = new Map((attempts ?? []).map((attempt) => [attempt.student_id, attempt]));
  const rows = (registrations ?? []).map((registration) => ({ registration, student: studentMap.get(registration.student_id), attempt: attemptMap.get(registration.student_id) ?? null })).filter((row) => row.student);
  return NextResponse.json({ exam, rows });
}

export async function PATCH(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const body = await request.json();
  const examId = String(body.examId ?? "");
  if (!examId) return NextResponse.json({ message: "시험을 선택해 주세요." }, { status: 400 });
  const payload = { student_open: Boolean(body.studentOpen), open_at: body.openAt || null, close_at: body.closeAt || null };
  const { data, error } = await ctx.supabase.from("exams").update(payload).eq("id", examId).select("id,title,exam_date,time_limit,student_open,open_at,close_at").single();
  return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ exam: data });
}
