import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { normalizeSosScope } from "@/lib/sos-program-flow";

const missing = (message: string) =>
  message.includes("formal_sequence") || message.includes("scope_code")
    ? "먼저 supabase-sos364-personal-exam-sequence.sql을 실행해 주세요."
    : message.includes("learning_cycle_students")
      ? "먼저 회차별 학생 등록 SQL을 실행해 주세요."
      : message;

async function context() {
  if (!await getAdminUser()) return null;
  return createClient();
}

async function nextSequence(s: any, studentId: string, scopeCode: string) {
  const [attempts, bookings] = await Promise.all([
    s.from("exam_attempts").select("formal_sequence,scope_code,is_practice,status").eq("student_id", studentId).eq("status", "submitted"),
    s.from("learning_cycle_students").select("formal_sequence,scope_code,is_practice,status").eq("student_id", studentId).eq("status", "ACTIVE"),
  ]);
  if (attempts.error || bookings.error) throw attempts.error || bookings.error;
  const used = [...(attempts.data ?? []), ...(bookings.data ?? [])]
    .filter((row: any) => !row.is_practice && Number(row.formal_sequence) > 0 && normalizeSosScope(row.scope_code) === scopeCode)
    .map((row: any) => Number(row.formal_sequence));
  return Math.max(0, ...used) + 1;
}

async function syncExactExam(s: any, membership: any) {
  const link = await s.from("learning_cycle_exams").select("exam_id")
    .eq("cycle_id", membership.cycle_id).eq("formal_sequence", membership.formal_sequence)
    .eq("scope_code", membership.scope_code).maybeSingle();
  if (link.error) throw link.error;
  if (!link.data) return { assigned: false };
  const assignedAt = new Date().toISOString();
  const stale = await s.from("exam_registrations").update({
    status: "cancelled", booking_status: "CANCELLED",
  }).eq("cycle_student_id", membership.id).neq("exam_id", link.data.exam_id);
  if (stale.error) throw stale.error;
  const saved = await s.from("exam_registrations").upsert({
    exam_id: link.data.exam_id, student_id: membership.student_id, cycle_student_id: membership.id,
    formal_sequence: membership.formal_sequence, scope_code: membership.scope_code,
    attendance_mode: membership.attendance_mode, scheduled_at: membership.scheduled_at,
    booking_status: membership.booking_status, status: "assigned", assigned_at: assignedAt,
  }, { onConflict: "exam_id,student_id" });
  if (saved.error) throw saved.error;
  return { assigned: true, examId: link.data.exam_id };
}

async function registerOne(s: any, body: any, source: "ADMIN" | "SOS_APPLICATION" = "ADMIN") {
  const cycleId = String(body.cycleId ?? ""), studentId = String(body.studentId ?? "");
  if (!cycleId || !studentId) throw new Error("응시 일정과 학생을 선택해 주세요.");
  const cycle = await s.from("learning_cycles").select("scheduled_at,attendance_mode").eq("id", cycleId).maybeSingle();
  if (cycle.error || !cycle.data) throw cycle.error ?? new Error("응시 일정을 찾지 못했습니다.");
  const scopeCode = normalizeSosScope(body.scopeCode);
  const formalSequence = Number(body.formalSequence) > 0 ? Number(body.formalSequence) : await nextSequence(s, studentId, scopeCode);
  const now = new Date().toISOString();
  const saved = await s.from("learning_cycle_students").upsert({
    cycle_id: cycleId, student_id: studentId, application_id: body.applicationId || null, source,
    status: "ACTIVE", formal_sequence: formalSequence, scope_code: scopeCode,
    attendance_mode: "ZOOM", scheduled_at: cycle.data.scheduled_at,
    booking_status: "SCHEDULED", sos_gate_status: formalSequence <= 1 ? "OPEN" : "LOCKED",
    is_practice: false, registered_at: now, updated_at: now,
  }, { onConflict: "cycle_id,student_id" }).select("*").single();
  if (saved.error || !saved.data) throw saved.error ?? new Error("참가 일정을 저장하지 못했습니다.");
  const exam = await syncExactExam(s, saved.data);
  return { registration: saved.data, ...exam };
}

export async function GET(request: Request) {
  const s = await context();
  if (!s) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const cycleId = new URL(request.url).searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ message: "응시 일정을 선택해 주세요." }, { status: 400 });
  const q = await s.from("learning_cycle_students")
    .select("id,cycle_id,student_id,application_id,source,status,registered_at,formal_sequence,scope_code,attendance_mode,scheduled_at,booking_status,sos_gate_status,sos_passed_at,is_practice")
    .eq("cycle_id", cycleId).eq("status", "ACTIVE").order("formal_sequence");
  return q.error
    ? NextResponse.json({ message: missing(q.error.message) }, { status: 400 })
    : NextResponse.json({ registrations: q.data ?? [], studentIds: (q.data ?? []).map((row: any) => row.student_id) });
}

export async function POST(request: Request) {
  const s = await context();
  if (!s) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json();
  const cycleId = String(body.cycleId ?? ""), studentId = String(body.studentId ?? "");
  if (!cycleId || !studentId) return NextResponse.json({ message: "응시 일정과 학생을 선택해 주세요." }, { status: 400 });
  if (Boolean(body.registered)) {
    try { return NextResponse.json({ success: true, ...(await registerOne(s, body)) }); }
    catch (error) { return NextResponse.json({ message: missing(error instanceof Error ? error.message : "참가 등록 실패") }, { status: 400 }); }
  }
  const found = await s.from("learning_cycle_students").select("id,application_id").eq("cycle_id", cycleId).eq("student_id", studentId).maybeSingle();
  if (found.error) return NextResponse.json({ message: missing(found.error.message) }, { status: 400 });
  if (found.data?.application_id) return NextResponse.json({ message: "학부모 신청으로 등록된 학생입니다. 참가권 신청 관리에서 취소해 주세요." }, { status: 409 });
  if (found.data?.id) {
    const linkedRegistrations = await s.from("exam_registrations").select("exam_id").eq("cycle_student_id", found.data.id);
    if (linkedRegistrations.error) return NextResponse.json({ message: linkedRegistrations.error.message }, { status: 400 });
    const examIds = (linkedRegistrations.data ?? []).map((x: any) => x.exam_id);
    if (examIds.length) {
      const attempts = await s.from("exam_attempts").select("id", { count: "exact", head: true })
        .eq("student_id", studentId).in("exam_id", examIds);
      if ((attempts.count ?? 0) > 0) return NextResponse.json({ message: "이미 응시 기록이 있는 일정은 삭제할 수 없습니다. 참가 상태를 관리자 예외처리해 주세요." }, { status: 409 });
    }
    await s.from("exam_registrations").delete().eq("cycle_student_id", found.data.id);
  }
  const removed = await s.from("learning_cycle_students").delete().eq("cycle_id", cycleId).eq("student_id", studentId);
  return removed.error ? NextResponse.json({ message: missing(removed.error.message) }, { status: 400 }) : NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const s = await context();
  if (!s) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ message: "수정할 참가자를 선택해 주세요." }, { status: 400 });
  const payload: any = { updated_at: new Date().toISOString() };
  if (body.formalSequence != null) payload.formal_sequence = Math.max(1, Number(body.formalSequence));
  if (body.scopeCode != null) payload.scope_code = normalizeSosScope(body.scopeCode);
  if (body.bookingStatus != null) payload.booking_status = String(body.bookingStatus);
  if (body.sosGateStatus != null) payload.sos_gate_status = String(body.sosGateStatus);
  const saved = await s.from("learning_cycle_students").update(payload).eq("id", id).select("*").single();
  if (saved.error || !saved.data) return NextResponse.json({ message: missing(saved.error?.message || "수정 실패") }, { status: 400 });
  try { return NextResponse.json({ success: true, registration: saved.data, ...(await syncExactExam(s, saved.data)) }); }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "시험지 재배정 실패" }, { status: 400 }); }
}

export async function PUT(request: Request) {
  const s = await context();
  if (!s) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json();
  const cycleId = String(body.cycleId ?? "");
  const studentIds: string[] = [...new Set<string>((Array.isArray(body.studentIds) ? body.studentIds : []).map(String))];
  if (!cycleId) return NextResponse.json({ message: "응시 일정을 선택해 주세요." }, { status: 400 });
  const applicationRows = await s.from("learning_cycle_students").select("student_id").eq("cycle_id", cycleId).eq("status", "ACTIVE").not("application_id", "is", null);
  if (applicationRows.error) return NextResponse.json({ message: missing(applicationRows.error.message) }, { status: 400 });
  const fixedIds = new Set<string>((applicationRows.data ?? []).map((row: any) => String(row.student_id)));
  const manualRows = await s.from("learning_cycle_students").select("id").eq("cycle_id", cycleId).is("application_id", null);
  if (manualRows.error) return NextResponse.json({ message: missing(manualRows.error.message) }, { status: 400 });
  const manualIds = (manualRows.data ?? []).map((row: any) => row.id);
  if (manualIds.length) {
    const registrations = await s.from("exam_registrations").delete().in("cycle_student_id", manualIds);
    if (registrations.error) return NextResponse.json({ message: missing(registrations.error.message) }, { status: 400 });
  }
  const removed = await s.from("learning_cycle_students").delete().eq("cycle_id", cycleId).is("application_id", null);
  if (removed.error) return NextResponse.json({ message: missing(removed.error.message) }, { status: 400 });
  for (const studentId of studentIds.filter((id) => !fixedIds.has(id))) {
    try { await registerOne(s, { ...body, cycleId, studentId }); }
    catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "일괄 참가 등록 실패" }, { status: 400 }); }
  }
  return NextResponse.json({ success: true, studentIds: [...new Set([...fixedIds, ...studentIds])] });
}
