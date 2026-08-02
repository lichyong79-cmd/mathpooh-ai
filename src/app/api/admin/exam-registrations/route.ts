import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

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
  if (!examId) return NextResponse.json({ message: "시험을 선택해 주세요." }, { status: 400 });
  const { data, error } = await ctx.supabase.from("exam_registrations").select("id,exam_id,student_id,registered_at").eq("exam_id", examId).order("registered_at");
  return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ registrations: data ?? [], studentIds: (data ?? []).map((item) => item.student_id) });
}

export async function POST(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const body = await request.json();
  const examId = String(body.examId ?? "");
  const studentId = String(body.studentId ?? "");
  const registered = Boolean(body.registered);
  if (!examId || !studentId) return NextResponse.json({ message: "시험과 학생을 선택해 주세요." }, { status: 400 });
  if (registered) {
    const { error } = await ctx.supabase.from("exam_registrations").upsert({ exam_id: examId, student_id: studentId }, { onConflict: "exam_id,student_id" });
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
  if (!examId) return NextResponse.json({ message: "시험을 선택해 주세요." }, { status: 400 });
  const removed = await ctx.supabase.from("exam_registrations").delete().eq("exam_id", examId);
  if (removed.error) return NextResponse.json({ message: removed.error.message }, { status: 400 });
  if (studentIds.length) {
    const inserted = await ctx.supabase.from("exam_registrations").insert(studentIds.map((studentId) => ({ exam_id: examId, student_id: studentId })));
    if (inserted.error) return NextResponse.json({ message: inserted.error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
