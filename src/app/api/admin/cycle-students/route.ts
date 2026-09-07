import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/auth";

const missing = (message: string) => message.includes("learning_cycle_students")
  ? "먼저 supabase-sos338-learning-cycle-students.sql을 실행해 주세요."
  : message;

async function context() {
  if (!await getAdminUser()) return null;
  return createClient();
}

export async function GET(request: Request) {
  const s = await context();
  if (!s) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const cycleId = new URL(request.url).searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ message: "회차를 선택해 주세요." }, { status: 400 });
  const q = await s.from("learning_cycle_students").select("id,cycle_id,student_id,application_id,source,status,registered_at").eq("cycle_id", cycleId).eq("status", "ACTIVE");
  return q.error
    ? NextResponse.json({ message: missing(q.error.message) }, { status: 400 })
    : NextResponse.json({ registrations: q.data ?? [], studentIds: (q.data ?? []).map((x: any) => x.student_id) });
}

export async function POST(request: Request) {
  const s = await context();
  if (!s) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json();
  const cycleId = String(body.cycleId ?? ""), studentId = String(body.studentId ?? "");
  if (!cycleId || !studentId) return NextResponse.json({ message: "회차와 학생을 선택해 주세요." }, { status: 400 });
  if (Boolean(body.registered)) {
    const q = await s.from("learning_cycle_students").upsert({ cycle_id: cycleId, student_id: studentId, application_id: null, source: "ADMIN", status: "ACTIVE", registered_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "cycle_id,student_id" });
    return q.error ? NextResponse.json({ message: missing(q.error.message) }, { status: 400 }) : NextResponse.json({ success: true });
  }
  const found = await s.from("learning_cycle_students").select("application_id").eq("cycle_id", cycleId).eq("student_id", studentId).maybeSingle();
  if (found.error) return NextResponse.json({ message: missing(found.error.message) }, { status: 400 });
  if (found.data?.application_id) return NextResponse.json({ message: "학부모 신청으로 등록된 학생입니다. SOS 모집·신청 관리에서 신청을 취소해 주세요." }, { status: 409 });
  const q = await s.from("learning_cycle_students").delete().eq("cycle_id", cycleId).eq("student_id", studentId);
  return q.error ? NextResponse.json({ message: missing(q.error.message) }, { status: 400 }) : NextResponse.json({ success: true });
}

export async function PUT(request: Request) {
  const s = await context();
  if (!s) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json();
  const cycleId = String(body.cycleId ?? "");
  const studentIds: string[] = [...new Set<string>((Array.isArray(body.studentIds) ? body.studentIds : []).map((x: unknown) => String(x)))];
  if (!cycleId) return NextResponse.json({ message: "회차를 선택해 주세요." }, { status: 400 });
  const applicationRows = await s.from("learning_cycle_students").select("student_id").eq("cycle_id", cycleId).eq("status", "ACTIVE").not("application_id", "is", null);
  if (applicationRows.error) return NextResponse.json({ message: missing(applicationRows.error.message) }, { status: 400 });
  const fixedIds = new Set<string>((applicationRows.data ?? []).map((x: any) => String(x.student_id)));
  const removed = await s.from("learning_cycle_students").delete().eq("cycle_id", cycleId).is("application_id", null);
  if (removed.error) return NextResponse.json({ message: missing(removed.error.message) }, { status: 400 });
  const manualIds = studentIds.filter((id) => !fixedIds.has(id));
  if (manualIds.length) {
    const now = new Date().toISOString();
    const inserted = await s.from("learning_cycle_students").insert(manualIds.map((studentId) => ({ cycle_id: cycleId, student_id: studentId, source: "ADMIN", status: "ACTIVE", registered_at: now, updated_at: now })));
    if (inserted.error) return NextResponse.json({ message: missing(inserted.error.message) }, { status: 400 });
  }
  return NextResponse.json({ success: true, studentIds: [...new Set<string>([...fixedIds, ...manualIds])] });
}
