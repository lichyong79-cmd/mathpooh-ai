import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { isSosCyclePassed } from "@/lib/sos-program-flow";

async function context() {
  if (!await getAdminUser()) return null;
  return createClient();
}

async function slotRows(supabase: any, cycleId: string) {
  const [cycle, memberships, links] = await Promise.all([
    supabase.from("learning_cycles").select("id,name,scheduled_at,attendance_mode").eq("id", cycleId).maybeSingle(),
    supabase.from("learning_cycle_students")
      .select("id,student_id,formal_sequence,scope_code,attendance_mode,scheduled_at,booking_status,sos_gate_status,students(id,name,school,grade)")
      .eq("cycle_id", cycleId).eq("status", "ACTIVE").order("formal_sequence"),
    supabase.from("learning_cycle_exams")
      .select("exam_id,formal_sequence,scope_code,exams(id,title,time_limit,student_open,open_at,close_at,paused_at)")
      .eq("cycle_id", cycleId),
  ]);
  const error = cycle.error || memberships.error || links.error;
  if (error) throw error;
  if (!cycle.data) throw new Error("응시 일정을 찾지 못했습니다.");
  const studentIds = (memberships.data ?? []).map((row: any) => String(row.student_id));
  const [attempts, allMemberships, sessions] = studentIds.length
    ? await Promise.all([
        supabase.from("exam_attempts")
          .select("student_id,formal_sequence,is_practice,status")
          .in("student_id", studentIds).eq("status", "submitted"),
        supabase.from("learning_cycle_students")
          .select("id,student_id,cycle_id,formal_sequence,sos_gate_status,is_practice")
          .in("student_id", studentIds).eq("status", "ACTIVE"),
        supabase.from("sos_training_sessions")
          .select("student_id,status,decision,cycle_kind,target_snapshot")
          .in("student_id", studentIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const progressError = attempts.error || allMemberships.error || sessions.error;
  if (progressError) throw progressError;
  return {
    cycle: cycle.data,
    rows: (memberships.data ?? []).map((membership: any) => {
      // 예약 당시 순번이 아니라 실제로 제출 완료한 공식 시험 다음 순번을 사용한다.
      // 앞선 예약에 결석해도 시험지가 건너뛰지 않는다.
      const completed = (attempts.data ?? []).filter((attempt: any) =>
        String(attempt.student_id) === String(membership.student_id) &&
        attempt.is_practice !== true && Number(attempt.formal_sequence) > 0);
      const lastCompletedSequence = completed.reduce(
        (max: number, attempt: any) => Math.max(max, Number(attempt.formal_sequence) || 0), 0);
      const formalSequence = lastCompletedSequence + 1;
      const previous = formalSequence <= 1 ? null : (allMemberships.data ?? []).find((item: any) =>
        String(item.student_id) === String(membership.student_id) &&
        Number(item.formal_sequence) === formalSequence - 1 && item.is_practice !== true);
      const studentSessions = (sessions.data ?? []).filter((session: any) =>
        String(session.student_id) === String(membership.student_id));
      const gateOpen = formalSequence <= 1 || membership.sos_gate_status === "OVERRIDE" ||
        previous?.sos_gate_status === "PASSED" || previous?.sos_gate_status === "OVERRIDE" ||
        (previous && isSosCyclePassed(studentSessions, String(previous.cycle_id)));
      const link = (links.data ?? []).find((item: any) =>
        Number(item.formal_sequence) === formalSequence &&
        String(item.scope_code ?? "FULL") === String(membership.scope_code ?? "FULL"));
      return {
        ...membership,
        booked_formal_sequence: membership.formal_sequence,
        formal_sequence: formalSequence,
        sos_gate_open: gateOpen,
        exam_id: link?.exam_id ?? null,
        exam: link?.exams ?? null,
      };
    }),
  };
}

export async function GET(request: Request) {
  const supabase = await context();
  if (!supabase) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const cycleId = new URL(request.url).searchParams.get("cycleId") ?? "";
  if (!cycleId) return NextResponse.json({ message: "응시 일정을 선택해 주세요." }, { status: 400 });
  try { return NextResponse.json(await slotRows(supabase, cycleId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "일정 조회 실패" }, { status: 400 }); }
}

export async function POST(request: Request) {
  const supabase = await context();
  if (!supabase) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json();
  const cycleId = String(body.cycleId ?? "");
  const action = String(body.action ?? "start");
  if (!cycleId) return NextResponse.json({ message: "응시 일정을 선택해 주세요." }, { status: 400 });
  try {
    const slot = await slotRows(supabase, cycleId);
    const eligible = slot.rows.filter((row: any) =>
      row.exam_id && !["CANCELLED", "NO_SHOW", "COMPLETED"].includes(String(row.booking_status)) &&
      row.sos_gate_open);
    const blocked = slot.rows.filter((row: any) => !eligible.includes(row));
    if (action === "start") {
      if (!eligible.length) return NextResponse.json({ message: "응시 가능한 참가자가 없습니다. 시험지 연결과 SOS 통과 상태를 확인해 주세요." }, { status: 409 });
      const startedAt = new Date();
      const examMap = new Map<string, any>();
      for (const row of eligible) examMap.set(String(row.exam_id), row.exam);
      for (const [examId, exam] of examMap) {
        const minutes = Math.max(1, Number(exam?.time_limit ?? 100));
        const update = await supabase.from("exams").update({
          student_open: true, open_at: startedAt.toISOString(),
          close_at: new Date(startedAt.getTime() + minutes * 60_000).toISOString(),
          paused_at: null, paused_remaining_seconds: null,
        }).eq("id", examId);
        if (update.error) throw update.error;
      }
      const assignedAt = startedAt.toISOString();
      for (const row of eligible) {
        const membershipUpdate = await supabase.from("learning_cycle_students").update({
          formal_sequence: row.formal_sequence,
          sos_gate_status: Number(row.formal_sequence) <= 1 ? "OPEN" : row.sos_gate_status === "OVERRIDE" ? "OVERRIDE" : "PASSED",
          booking_status: "IN_PROGRESS", updated_at: assignedAt,
        }).eq("id", row.id);
        if (membershipUpdate.error) throw membershipUpdate.error;
        const staleRegistrations = await supabase.from("exam_registrations").update({
          status: "cancelled", booking_status: "CANCELLED",
        }).eq("cycle_student_id", row.id).neq("exam_id", row.exam_id);
        if (staleRegistrations.error) throw staleRegistrations.error;
        const registration = await supabase.from("exam_registrations").upsert({
          exam_id: row.exam_id, student_id: row.student_id, cycle_student_id: row.id,
          formal_sequence: row.formal_sequence, scope_code: row.scope_code,
          attendance_mode: row.attendance_mode, scheduled_at: row.scheduled_at,
          booking_status: "IN_PROGRESS", status: "assigned", assigned_at: assignedAt,
        }, { onConflict: "exam_id,student_id" });
        if (registration.error) throw registration.error;
      }
      return NextResponse.json({
        success: true, started: eligible.length, examCount: examMap.size,
        blocked: blocked.map((row: any) => ({ studentId: row.student_id, name: row.students?.name, reason: row.exam_id ? "이전 SOS 미통과" : "시험지 미연결" })),
      });
    }
    return NextResponse.json({ message: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "일정 시험 시작 실패" }, { status: 400 });
  }
}
