import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidExamId(examId: string | null) {
  if (!examId) {
    return NextResponse.json(
      { message: "시험을 선택해 주세요." },
      { status: 400 },
    );
  }
  if (!UUID_PATTERN.test(examId)) {
    return NextResponse.json(
      { message: "DB에 등록된 실제 시험을 선택해 주세요." },
      { status: 400 },
    );
  }
  return null;
}

async function adminContext() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (user.user_metadata?.role === "student" || user.user_metadata?.role === "parent") {
    return { error: NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 }) };
  }
  return { supabase: createServerSupabase() };
}

export async function GET(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const examId = new URL(request.url).searchParams.get("examId");
  const invalid = invalidExamId(examId);
  if (invalid) return invalid;
  const { data, error } = await ctx.supabase.from("exam_registrations").select("id,exam_id,student_id,status,requested_at,assigned_at,registered_at").eq("exam_id", examId).order("requested_at");
  return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ registrations: data ?? [], studentIds: (data ?? []).filter((item) => item.status === "assigned").map((item) => item.student_id), requestedStudentIds: (data ?? []).filter((item) => item.status === "requested").map((item) => item.student_id) });
}

export async function POST(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const body = await request.json();
  const examId = String(body.examId ?? "");
  const studentId = String(body.studentId ?? "");
  const nextStatus = String(body.status ?? "");
  const registered = Boolean(body.registered);
  const invalid = invalidExamId(examId);
  if (invalid) return invalid;
  if (!studentId) return NextResponse.json({ message: "학생을 선택해 주세요." }, { status: 400 });
  if (["requested", "assigned", "cancelled", "refunded"].includes(nextStatus)) {
    const now = new Date().toISOString();
    const payload = { exam_id: examId, student_id: studentId, status: nextStatus, ...(nextStatus === "assigned" ? { assigned_at: now } : {}) };
    const { error } = await ctx.supabase.from("exam_registrations").upsert(payload, { onConflict: "exam_id,student_id" });
    return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ success: true, status: nextStatus });
  }
  if (registered) {
    const { error } = await ctx.supabase.from("exam_registrations").upsert({ exam_id: examId, student_id: studentId, status: "assigned", assigned_at: new Date().toISOString() }, { onConflict: "exam_id,student_id" });
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  } else {
    const { error } = await ctx.supabase.from("exam_registrations").delete().eq("exam_id", examId).eq("student_id", studentId);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

export async function PUT(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const body = await request.json();
  const examId = String(body.examId ?? "");
  const studentIds: string[] = Array.isArray(body.studentIds) ? body.studentIds.map(String) : [];
  const invalid = invalidExamId(examId);
  if (invalid) return invalid;
  const removed = await ctx.supabase.from("exam_registrations").delete().eq("exam_id", examId);
  if (removed.error) return NextResponse.json({ message: removed.error.message }, { status: 400 });
  if (studentIds.length) {
    const assignedAt = new Date().toISOString();
    const inserted = await ctx.supabase.from("exam_registrations").insert(studentIds.map((studentId) => ({ exam_id: examId, student_id: studentId, status: "assigned", assigned_at: assignedAt })));
    if (inserted.error) return NextResponse.json({ message: inserted.error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
