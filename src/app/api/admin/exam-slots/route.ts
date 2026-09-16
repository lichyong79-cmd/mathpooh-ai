import { priorLearningPassed } from "@/lib/exam-flow";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { bookingExam, BOOKING_CLOCK_COLUMNS } from "@/lib/exam-flow";

async function context() {
  if (!await getAdminUser()) return null;
  return createClient();
}

async function slotRows(supabase: any, cycleId: string) {
  const [cycle, memberships, links, registrations] = await Promise.all([
    supabase.from("learning_cycles").select("id,name,scheduled_at,attendance_mode").eq("id", cycleId).maybeSingle(),
    supabase.from("learning_cycle_students")
      .select("id,student_id,formal_sequence,scope_code,attendance_mode,scheduled_at,booking_status,sos_gate_status,students!inner(id,name,school,grade,active,status)")
      .eq("cycle_id", cycleId).eq("status", "ACTIVE").eq("students.active",true).neq("students.status","퇴원").not("booking_status","in","(CANCELLED,NO_SHOW)").order("formal_sequence"),
    supabase.from("learning_cycle_exams")
      .select("exam_id,formal_sequence,scope_code,exams(id,title,time_limit,student_open,open_at,close_at,paused_at)")
      .eq("cycle_id", cycleId),
    supabase.from("exam_registrations").select(`id,student_id,cycle_student_id,exam_id,formal_sequence,scope_code,scheduled_at,booking_status,${BOOKING_CLOCK_COLUMNS}`).eq("status","assigned"),
  ]);
  const error = cycle.error || memberships.error || links.error || registrations.error;
  if (error) throw error;
  if (!cycle.data) throw new Error("응시 일정을 찾지 못했습니다.");
  const studentIds = (memberships.data ?? []).map((row: any) => String(row.student_id));
  const [attempts, allMemberships, sessions] = studentIds.length
    ? await Promise.all([
        supabase.from("exam_attempts")
          .select("student_id,formal_sequence,scope_code,is_practice,status")
          .in("student_id", studentIds).eq("status", "submitted"),
        supabase.from("learning_cycle_students")
          .select("id,student_id,cycle_id,formal_sequence,scope_code,sos_gate_status,is_practice,booking_status")
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
        String(attempt.scope_code ?? "FULL") === String(membership.scope_code ?? "FULL") &&
        attempt.is_practice !== true && Number(attempt.formal_sequence) > 0);
      const lastCompletedSequence = completed.reduce(
        (max: number, attempt: any) => Math.max(max, Number(attempt.formal_sequence) || 0), 0);
      const registration = (registrations.data ?? []).find((r:any)=>r.cycle_student_id===membership.id);
      const formalSequence = registration?.formal_sequence ?? lastCompletedSequence + 1;
      const previous = formalSequence <= 1 ? null : (allMemberships.data ?? []).find((item: any) =>
        String(item.student_id) === String(membership.student_id) &&
        String(item.scope_code ?? "FULL") === String(membership.scope_code ?? "FULL") &&
        Number(item.formal_sequence) === formalSequence - 1 && item.is_practice !== true);
      const studentSessions = (sessions.data ?? []).filter((session: any) =>
        String(session.student_id) === String(membership.student_id));
      const gateOpen = priorLearningPassed((allMemberships.data ?? []).filter((m:any)=>String(m.student_id)===String(membership.student_id)), studentSessions, membership);
      const link = (links.data ?? []).find((item: any) =>
        item.exam_id === registration?.exam_id && Number(item.formal_sequence) === formalSequence &&
        String(item.scope_code ?? "FULL") === String(membership.scope_code ?? "FULL"));
      return {
        ...membership,
        booked_formal_sequence: membership.formal_sequence,
        formal_sequence: formalSequence,
        sos_gate_open: gateOpen,
        exam_id: link?.exam_id ?? null,
        exam: link?.exams ? bookingExam(link.exams,registration) : null,
        registration,
        timer_prepared: Boolean(registration?.clock_initialized && registration?.clock_open_at===cycle.data.scheduled_at),
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
  catch (error) { return NextResponse.json({ message: (error as any)?.message || "일정 조회 실패" }, { status: 400 }); }
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
    if(!["prepare","start","pause","resume"].includes(action))return NextResponse.json({message:"지원하지 않는 작업입니다."},{status:400});
    const assigned=slot.rows.filter((r:any)=>r.exam_id&&!["CANCELLED","NO_SHOW","COMPLETED"].includes(String(r.booking_status)));
    const eligible=assigned.filter((r:any)=>action==="prepare"?true:action==="start"?r.sos_gate_open:action==="pause"?r.booking_status==="IN_PROGRESS"&&!r.exam?.paused_at&&Date.parse(r.exam?.close_at)>Date.now():r.booking_status==="IN_PROGRESS"&&r.exam?.paused_at);
    if(!eligible.length)return NextResponse.json({message:action==="start"?"시작할 학생이 없습니다. 시험지 배정과 이전 SOS 완료 상태를 확인해 주세요.":"처리할 학생이 없습니다. 회차와 배정 상태를 확인해 주세요."},{status:409});
    const result=await supabase.rpc("sos_control_cycle_exam",{p_cycle_id:cycleId,p_action:action,p_membership_ids:eligible.map((r:any)=>r.id)});
    if(result.error)throw result.error;
    return NextResponse.json({...result.data,started:action==="start"?eligible.length:0,blocked:assigned.filter((r:any)=>!r.sos_gate_open).map((r:any)=>({name:r.students?.name,reason:"이전 SOS 미완료"}))});
  } catch (error) {
    return NextResponse.json({ message: (error as any)?.message || "일정 시험 시작 실패" }, { status: 400 });
  }
}
