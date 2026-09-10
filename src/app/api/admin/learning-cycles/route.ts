import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { normalizeSosScope } from "@/lib/sos-program-flow";

async function admin() {
  const user = await getSessionUser();
  if (!user || ["student", "parent"].includes(String(user.user_metadata?.role))) return null;
  return { supabase: createClient(), user };
}

const missing = (message: string) =>
  message.includes("formal_sequence") || message.includes("scope_code") || message.includes("scheduled_at")
    ? "먼저 supabase-sos364-personal-exam-sequence.sql을 실행해 주세요."
    : message.includes("learning_cycles") || message.includes("learning_cycle_exams")
      ? "먼저 회차 관련 SQL을 실행해 주세요."
      : message;

async function syncLinkedStudents(supabase: any, cycleId: string, examId: string, formalSequence: number, scopeCode: string) {
  const [members, cycle] = await Promise.all([
    supabase.from("learning_cycle_students")
      .select("id,student_id,scheduled_at,attendance_mode,booking_status")
      .eq("cycle_id", cycleId).eq("status", "ACTIVE")
      .eq("formal_sequence", formalSequence).eq("scope_code", scopeCode),
    supabase.from("learning_cycles").select("scheduled_at,attendance_mode").eq("id", cycleId).maybeSingle(),
  ]);
  if (members.error) throw members.error;
  if (!(members.data ?? []).length) return 0;
  const assignedAt = new Date().toISOString();
  const rows = (members.data ?? []).map((member: any) => ({
    exam_id: examId, student_id: member.student_id, cycle_student_id: member.id,
    formal_sequence: formalSequence, scope_code: scopeCode,
    attendance_mode: member.attendance_mode || cycle.data?.attendance_mode || "ZOOM",
    scheduled_at: member.scheduled_at || cycle.data?.scheduled_at || null,
    booking_status: member.booking_status || "SCHEDULED", status: "assigned", assigned_at: assignedAt,
  }));
  const saved = await supabase.from("exam_registrations").upsert(rows, { onConflict: "exam_id,student_id" });
  if (saved.error) throw saved.error;
  return rows.length;
}

export async function GET() {
  const ctx = await admin();
  if (!ctx) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const [cycles, links, exams, attempts] = await Promise.all([
    ctx.supabase.from("learning_cycles").select("*").order("scheduled_at", { ascending: false, nullsFirst: false }).order("start_date", { ascending: false }),
    ctx.supabase.from("learning_cycle_exams").select("id,cycle_id,exam_id,formal_sequence,scope_code,linked_at"),
    ctx.supabase.from("exams").select("id,round,title,exam_code,exam_date,grade,subject,status,question_count").order("exam_date", { ascending: false }),
    ctx.supabase.from("exam_attempts").select("exam_id,status"),
  ]);
  const error = cycles.error || links.error || exams.error || attempts.error;
  if (error) return NextResponse.json({ message: missing(error.message) }, { status: 400 });
  const counts = new Map<string, { submitted: number; total: number }>();
  for (const attempt of attempts.data ?? []) {
    const key = String((attempt as any).exam_id);
    const count = counts.get(key) ?? { submitted: 0, total: 0 };
    count.total += 1;
    if ((attempt as any).status === "submitted") count.submitted += 1;
    counts.set(key, count);
  }
  const baseExams = (exams.data ?? []).map((exam: any) => ({
    ...exam, submittedCount: counts.get(String(exam.id))?.submitted ?? 0,
    attemptCount: counts.get(String(exam.id))?.total ?? 0,
    links: (links.data ?? []).filter((link: any) => String(link.exam_id) === String(exam.id)),
  }));
  const cycleRows = (cycles.data ?? []).map((cycle: any) => ({
    ...cycle,
    exams: (links.data ?? []).filter((link: any) => String(link.cycle_id) === String(cycle.id))
      .map((link: any) => ({
        ...baseExams.find((exam: any) => String(exam.id) === String(link.exam_id)),
        linkId: link.id, formalSequence: link.formal_sequence, scopeCode: link.scope_code,
      })).filter((exam: any) => exam.id),
  }));
  return NextResponse.json({ cycles: cycleRows, exams: baseExams }, { headers: { "Cache-Control": "no-store,max-age=0" } });
}

export async function POST(request: Request) {
  const ctx = await admin();
  if (!ctx) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json();
  const action = String(body.action ?? "");
  const now = new Date().toISOString();

  if (action === "create") {
    const name = String(body.name ?? "").trim(), start = String(body.startDate ?? ""), end = String(body.endDate ?? start);
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : start ? new Date(`${start}T23:00:00+09:00`) : null;
    if (!name || !start || !end || !scheduledAt || Number.isNaN(scheduledAt.getTime()))
      return NextResponse.json({ message: "일정명과 날짜·응시시각을 입력해 주세요." }, { status: 400 });
    const saved = await ctx.supabase.from("learning_cycles").insert({
      name, start_date: start, end_date: end, scheduled_at: scheduledAt.toISOString(), attendance_mode: "ZOOM",
      booking_open: true, status: "ACTIVE", memo: String(body.memo ?? ""), created_by: ctx.user.id,
    }).select().single();
    return saved.error ? NextResponse.json({ message: missing(saved.error.message) }, { status: 400 }) : NextResponse.json({ cycle: saved.data });
  }

  if (action === "update") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ message: "응시 일정을 선택해 주세요." }, { status: 400 });
    const payload: any = { updated_at: now };
    for (const [from, to] of [["name", "name"], ["startDate", "start_date"], ["endDate", "end_date"], ["status", "status"], ["memo", "memo"], ["bookingOpen", "booking_open"]] as const)
      if (body[from] != null) payload[to] = body[from];
    if (body.scheduledAt) payload.scheduled_at = new Date(body.scheduledAt).toISOString();
    const saved = await ctx.supabase.from("learning_cycles").update(payload).eq("id", id).select().single();
    if (!saved.error && saved.data && payload.scheduled_at) {
      const memberships = await ctx.supabase.from("learning_cycle_students").select("id").eq("cycle_id", id).eq("status", "ACTIVE");
      await ctx.supabase.from("learning_cycle_students").update({ scheduled_at: payload.scheduled_at, updated_at: now }).eq("cycle_id", id).eq("status", "ACTIVE");
      const ids = (memberships.data ?? []).map((row: any) => row.id);
      if (ids.length) await ctx.supabase.from("exam_registrations").update({ scheduled_at: payload.scheduled_at }).in("cycle_student_id", ids);
    }
    return saved.error ? NextResponse.json({ message: missing(saved.error.message) }, { status: 400 }) : NextResponse.json({ cycle: saved.data });
  }

  if (action === "delete") {
    const id = String(body.id ?? "");
    const [examLinks, batchLinks, students] = await Promise.all([
      ctx.supabase.from("learning_cycle_exams").select("id", { count: "exact", head: true }).eq("cycle_id", id),
      ctx.supabase.from("sos_program_batch_cycles").select("batch_id", { count: "exact", head: true }).eq("cycle_id", id),
      ctx.supabase.from("learning_cycle_students").select("id", { count: "exact", head: true }).eq("cycle_id", id).eq("status", "ACTIVE"),
    ]);
    if ((examLinks.count ?? 0) || (batchLinks.count ?? 0) || (students.count ?? 0))
      return NextResponse.json({ message: "시험지·모집·참가자가 연결된 일정은 삭제할 수 없습니다. 먼저 연결을 정리해 주세요." }, { status: 409 });
    const removed = await ctx.supabase.from("learning_cycles").delete().eq("id", id);
    return removed.error ? NextResponse.json({ message: missing(removed.error.message) }, { status: 400 }) : NextResponse.json({ success: true });
  }

  if (action === "assign-exam") {
    const cycleId = String(body.cycleId ?? ""), examId = String(body.examId ?? "");
    const formalSequence = Math.max(1, Number(body.formalSequence ?? 1));
    const scopeCode = normalizeSosScope(body.scopeCode);
    if (!cycleId || !examId) return NextResponse.json({ message: "응시 일정과 시험지를 선택해 주세요." }, { status: 400 });
    const occupied = await ctx.supabase.from("learning_cycle_exams").select("id,exam_id")
      .eq("cycle_id", cycleId).eq("formal_sequence", formalSequence).eq("scope_code", scopeCode).maybeSingle();
    if (occupied.error) return NextResponse.json({ message: missing(occupied.error.message) }, { status: 400 });
    if (occupied.data && String(occupied.data.exam_id) !== examId)
      return NextResponse.json({ message: `${formalSequence}회차의 같은 범위에 이미 다른 시험지가 연결되어 있습니다. 먼저 기존 연결을 빼 주세요.` }, { status: 409 });
    const existing = await ctx.supabase.from("learning_cycle_exams").select("id").eq("cycle_id", cycleId).eq("exam_id", examId).maybeSingle();
    const saved = existing.data
      ? await ctx.supabase.from("learning_cycle_exams").update({ formal_sequence: formalSequence, scope_code: scopeCode, linked_at: now }).eq("id", existing.data.id)
      : await ctx.supabase.from("learning_cycle_exams").insert({ cycle_id: cycleId, exam_id: examId, formal_sequence: formalSequence, scope_code: scopeCode, linked_at: now });
    if (saved.error) return NextResponse.json({ message: missing(saved.error.message) }, { status: 400 });
    try {
      // 같은 시험지를 서로 다른 날짜의 신규 학생에게 다시 쓸 수 있으므로
      // 예정시각은 시험지 전역값이 아니라 학생별 registration에만 저장한다.
      const examSchedule = await ctx.supabase.from("exams")
        .update({ student_open: true }).eq("id", examId);
      if (examSchedule.error) throw examSchedule.error;
      const assignedCount = await syncLinkedStudents(ctx.supabase, cycleId, examId, formalSequence, scopeCode);
      return NextResponse.json({ success: true, assignedCount });
    } catch (error) {
      return NextResponse.json({ message: error instanceof Error ? error.message : "학생 시험배정 동기화 실패" }, { status: 400 });
    }
  }

  if (action === "unassign-exam") {
    const cycleId = String(body.cycleId ?? ""), examId = String(body.examId ?? "");
    if (cycleId) {
      const members = await ctx.supabase.from("learning_cycle_students")
        .select("id").eq("cycle_id", cycleId);
      if (members.error) return NextResponse.json({ message: missing(members.error.message) }, { status: 400 });
      const memberIds = (members.data ?? []).map((row: any) => row.id);
      if (memberIds.length) {
        const cancelled = await ctx.supabase.from("exam_registrations")
          .update({ status: "cancelled", booking_status: "CANCELLED" })
          .eq("exam_id", examId).in("cycle_student_id", memberIds);
        if (cancelled.error) return NextResponse.json({ message: missing(cancelled.error.message) }, { status: 400 });
      }
    }
    let query = ctx.supabase.from("learning_cycle_exams").delete().eq("exam_id", examId);
    if (cycleId) query = query.eq("cycle_id", cycleId);
    const removed = await query;
    return removed.error ? NextResponse.json({ message: missing(removed.error.message) }, { status: 400 }) : NextResponse.json({ success: true });
  }

  return NextResponse.json({ message: "지원하지 않는 작업입니다." }, { status: 400 });
}
