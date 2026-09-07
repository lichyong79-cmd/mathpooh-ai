import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { ensureParentAccount } from "@/lib/parent-account";

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const koreaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const missing = (m: string) => m.includes("sos_program_") ? "먼저 SOS 프로그램 관련 SQL을 실행해 주세요." : m;
async function admin() { return await getAdminUser(); }

async function cancelCycleAssignments(s: any, applicationId: string, now: string) {
  const rows = await s.from("sos_program_cycle_enrollments").select("cycle_id,student_id").eq("application_id", applicationId).eq("status", "ACTIVE");
  if (rows.error) return rows.error.message;
  const cycleIds = [...new Set((rows.data ?? []).map((x: any) => String(x.cycle_id)).filter(Boolean))];
  const studentIds = [...new Set((rows.data ?? []).map((x: any) => String(x.student_id)).filter(Boolean))];
  if (cycleIds.length && studentIds.length) {
    const links = await s.from("learning_cycle_exams").select("exam_id").in("cycle_id", cycleIds);
    if (links.error) return links.error.message;
    const examIds = [...new Set((links.data ?? []).map((x: any) => String(x.exam_id)).filter(Boolean))];
    if (examIds.length) {
      const attempts = await s.from("exam_attempts").select("exam_id,student_id").in("exam_id", examIds).in("student_id", studentIds);
      if (attempts.error) return attempts.error.message;
      const attempted = new Set((attempts.data ?? []).map((x: any) => `${x.exam_id}:${x.student_id}`));
      for (const studentId of studentIds) {
        const removable = examIds.filter((examId: string) => !attempted.has(`${examId}:${studentId}`));
        if (removable.length) {
          const q = await s.from("exam_registrations").delete().eq("student_id", studentId).in("exam_id", removable);
          if (q.error) return q.error.message;
        }
      }
    }
  }
  const cancelled = await s.from("sos_program_cycle_enrollments").update({ status: "CANCELLED", updated_at: now }).eq("application_id", applicationId).eq("status", "ACTIVE");
  return cancelled.error?.message ?? "";
}

export async function GET() {
  if (!await admin()) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const s = createClient();
  const [batches, links, cycles, applications, enrollments, students] = await Promise.all([
    s.from("sos_program_batches").select("*").order("created_at", { ascending: false }),
    s.from("sos_program_batch_cycles").select("batch_id,cycle_id,slot_no"),
    s.from("learning_cycles").select("id,name,start_date,end_date,status").order("start_date", { ascending: false }),
    s.from("sos_program_applications").select("*").order("requested_at", { ascending: false }),
    s.from("sos_program_enrollments").select("id,application_id,batch_id,student_id,status,enrolled_at"),
    s.from("students").select("id,name,school,grade,phone,parent_phone,status").order("name"),
  ]);
  const error = batches.error || links.error || cycles.error || applications.error || enrollments.error || students.error;
  if (error) return NextResponse.json({ message: missing(error.message) }, { status: 400 });
  return NextResponse.json({
    batches: (batches.data ?? []).map((b: any) => ({
      ...b,
      cycles: (links.data ?? [])
        .filter((x: any) => String(x.batch_id) === String(b.id))
        .sort((a: any, z: any) => a.slot_no - z.slot_no)
        .map((x: any) => ({ ...x, ...(cycles.data ?? []).find((c: any) => String(c.id) === String(x.cycle_id)) })),
    })),
    cycles: cycles.data ?? [], applications: applications.data ?? [], enrollments: enrollments.data ?? [], students: students.data ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}

async function normalizedCycleRows(s: any, cycleIdsRaw: unknown) {
  const cycleIds = [...new Set((Array.isArray(cycleIdsRaw) ? cycleIdsRaw : []).map(String))];
  if (cycleIds.length !== 5) return { error: "운영 회차를 정확히 5개 선택해 주세요.", rows: [] as any[] };
  const q = await s.from("learning_cycles").select("id,start_date").in("id", cycleIds).order("start_date");
  if (q.error || (q.data ?? []).length !== 5) return { error: "선택한 운영 회차를 확인해 주세요.", rows: [] as any[] };
  return { error: "", rows: q.data ?? [] };
}

export async function POST(request: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const b = await request.json();
  const action = String(b.action ?? "");
  const s = createClient();
  const now = new Date().toISOString();

  if (action === "create") {
    const checked = await normalizedCycleRows(s, b.cycleIds);
    if (checked.error) return NextResponse.json({ message: checked.error }, { status: 400 });
    const title = String(b.title ?? "").trim();
    if (!title) return NextResponse.json({ message: "5회 묶음 이름을 입력해 주세요." }, { status: 400 });
    const batch = await s.from("sos_program_batches").insert({
      title,
      price: Math.max(0, Number(b.price ?? 350000)),
      application_start: b.applicationStart || null,
      application_end: b.applicationEnd || null,
      capacity: b.capacity ? Math.max(1, Number(b.capacity)) : null,
      memo: String(b.memo ?? ""),
      is_published: false,
    }).select().single();
    if (batch.error || !batch.data) return NextResponse.json({ message: missing(batch.error?.message || "묶음을 만들지 못했습니다.") }, { status: 400 });
    const linked = await s.from("sos_program_batch_cycles").insert(checked.rows.map((x: any, i: number) => ({ batch_id: batch.data.id, cycle_id: x.id, slot_no: i + 1 })));
    if (linked.error) {
      await s.from("sos_program_batches").delete().eq("id", batch.data.id);
      return NextResponse.json({ message: missing(linked.error.message) }, { status: 400 });
    }
    return NextResponse.json({ success: true, batch: batch.data });
  }

  if (action === "update-cycles") {
    const batchId = String(b.batchId ?? "");
    const checked = await normalizedCycleRows(s, b.cycleIds);
    if (!batchId || checked.error) return NextResponse.json({ message: checked.error || "5회 묶음을 선택해 주세요." }, { status: 400 });
    const activeApps = await s.from("sos_program_applications").select("id", { count: "exact", head: true }).eq("batch_id", batchId).in("status", ["REQUESTED", "PAID", "ENROLLED"]);
    if (activeApps.error) return NextResponse.json({ message: activeApps.error.message }, { status: 400 });
    if ((activeApps.count ?? 0) > 0) return NextResponse.json({ message: "신청 접수/결제/등록 이력이 있는 묶음은 회차 구성을 변경할 수 없습니다. 신청을 먼저 정리해 주세요." }, { status: 409 });
    const del = await s.from("sos_program_batch_cycles").delete().eq("batch_id", batchId);
    if (del.error) return NextResponse.json({ message: del.error.message }, { status: 400 });
    const ins = await s.from("sos_program_batch_cycles").insert(checked.rows.map((x: any, i: number) => ({ batch_id: batchId, cycle_id: x.id, slot_no: i + 1 })));
    if (ins.error) return NextResponse.json({ message: ins.error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === "delete-batch") {
    const batchId = String(b.batchId ?? "");
    if (!batchId) return NextResponse.json({ message: "삭제할 모집안을 선택해 주세요." }, { status: 400 });
    const applications = await s.from("sos_program_applications").select("id,status").eq("batch_id", batchId);
    if (applications.error) return NextResponse.json({ message: applications.error.message }, { status: 400 });
    const activeCount = (applications.data ?? []).filter((x: any) => !["CANCELLED", "REFUNDED"].includes(String(x.status))).length;
    if (activeCount > 0) return NextResponse.json({ message: `진행 중인 신청 ${activeCount}건이 있습니다. 아래 신청 내역에서 먼저 취소하거나 삭제해 주세요.` }, { status: 409 });
    // 취소/환불 신청만 남은 모집안은 해당 신청서를 함께 정리한다.
    // 응시·성적·학습 데이터는 다른 테이블에 있으므로 삭제하지 않는다.
    if ((applications.data ?? []).length) {
      const removedApplications = await s.from("sos_program_applications").delete().eq("batch_id", batchId).in("status", ["CANCELLED", "REFUNDED"]);
      if (removedApplications.error) return NextResponse.json({ message: `취소 신청 정리 실패: ${removedApplications.error.message}` }, { status: 400 });
    }
    const q = await s.from("sos_program_batches").delete().eq("id", batchId);
    return q.error ? NextResponse.json({ message: q.error.message }, { status: 400 }) : NextResponse.json({ success: true });
  }

  if (action === "publish") {
    const batchId = String(b.batchId ?? "");
    if (Boolean(b.published)) {
      const [batchCheck, linkCheck] = await Promise.all([
        s.from("sos_program_batches").select("id,application_start,application_end").eq("id", batchId).maybeSingle(),
        s.from("sos_program_batch_cycles").select("slot_no,learning_cycles(start_date)").eq("batch_id", batchId).order("slot_no"),
      ]);
      if (batchCheck.error || !batchCheck.data) return NextResponse.json({ message: "5회 묶음을 찾지 못했습니다." }, { status: 404 });
      if (linkCheck.error || (linkCheck.data ?? []).length !== 5) return NextResponse.json({ message: "정확히 5개 회차가 연결된 묶음만 신청을 열 수 있습니다." }, { status: 400 });
      const starts = (linkCheck.data ?? []).map((x: any) => String(x.learning_cycles?.start_date ?? "").slice(0, 10)).filter(Boolean).sort();
      if (starts.length !== 5) return NextResponse.json({ message: "시작일이 없는 회차가 있어 신청을 열 수 없습니다." }, { status: 400 });
      if (starts.every((x: string) => x < koreaToday())) return NextResponse.json({ message: "5개 회차가 모두 종료된 묶음은 신청을 열 수 없습니다." }, { status: 400 });
      if (batchCheck.data.application_start && batchCheck.data.application_end && batchCheck.data.application_start > batchCheck.data.application_end)
        return NextResponse.json({ message: "신청 시작일이 신청 종료일보다 늦습니다." }, { status: 400 });
    }
    const q = await s.from("sos_program_batches").update({ is_published: Boolean(b.published), updated_at: now }).eq("id", batchId);
    return q.error ? NextResponse.json({ message: missing(q.error.message) }, { status: 400 }) : NextResponse.json({ success: true });
  }

  if (action === "cancel") {
    const applicationId = String(b.applicationId ?? "");
    const application = await s.from("sos_program_applications").select("id,status").eq("id", applicationId).maybeSingle();
    if (application.error) return NextResponse.json({ message: application.error.message }, { status: 400 });
    if (!application.data) return NextResponse.json({ message: "신청서를 찾지 못했습니다." }, { status: 404 });
    if (["CANCELLED", "REFUNDED"].includes(String(application.data.status)))
      return NextResponse.json({ success: true, status: application.data.status });
    const cycleCancelError = await cancelCycleAssignments(s, applicationId, now);
    if (cycleCancelError) return NextResponse.json({ message: `회차 배정 취소 실패: ${missing(cycleCancelError)}` }, { status: 400 });
    const enrollment = await s.from("sos_program_enrollments").update({ status: "CANCELLED" }).eq("application_id", applicationId);
    if (enrollment.error) return NextResponse.json({ message: `등록 취소 실패: ${enrollment.error.message}` }, { status: 400 });
    const q = await s.from("sos_program_applications").update({ status: "CANCELLED", updated_at: now }).eq("id", applicationId).select("id,status").maybeSingle();
    return q.error || !q.data
      ? NextResponse.json({ message: q.error?.message || "신청 취소 상태를 저장하지 못했습니다." }, { status: 400 })
      : NextResponse.json({ success: true, status: q.data.status });
  }

  if (action === "delete-application") {
    const applicationId = String(b.applicationId ?? "");
    if (!applicationId) return NextResponse.json({ message: "삭제할 신청을 선택해 주세요." }, { status: 400 });
    const application = await s.from("sos_program_applications").select("id,status").eq("id", applicationId).maybeSingle();
    if (application.error) return NextResponse.json({ message: application.error.message }, { status: 400 });
    if (!application.data) return NextResponse.json({ success: true });
    if (!["CANCELLED", "REFUNDED"].includes(String(application.data.status))) {
      const cycleCancelError = await cancelCycleAssignments(s, applicationId, now);
      if (cycleCancelError) return NextResponse.json({ message: `회차 배정 취소 실패: ${missing(cycleCancelError)}` }, { status: 400 });
    }
    const removed = await s.from("sos_program_applications").delete().eq("id", applicationId).select("id").maybeSingle();
    return removed.error || !removed.data
      ? NextResponse.json({ message: removed.error?.message || "신청서를 삭제하지 못했습니다." }, { status: 400 })
      : NextResponse.json({ success: true });
  }

  if (action === "enroll") {
    const appResult = await s.from("sos_program_applications").select("*").eq("id", String(b.applicationId ?? "")).maybeSingle();
    const app: any = appResult.data;
    if (appResult.error || !app) return NextResponse.json({ message: "신청서를 찾지 못했습니다." }, { status: 404 });
    if (!["REQUESTED", "PAID"].includes(String(app.status)))
      return NextResponse.json({ message: app.status === "ENROLLED" ? "이미 등록 완료된 신청입니다." : "현재 상태에서는 등록할 수 없습니다." }, { status: 409 });

    let studentId = String(b.studentId ?? app.student_id ?? "");
    if (!studentId) {
      const phone = digits(app.student_phone);
      if (phone.length < 10) return NextResponse.json({ message: "신규 학생 계정 생성을 위해 학생 전화번호를 입력하거나 기존 학생을 연결해 주세요." }, { status: 400 });
      const existing = await s.from("students").select("id").or(`phone.eq.${phone},phone_last8.eq.${phone.slice(-8)}`).maybeSingle();
      if (existing.data) studentId = existing.data.id;
      else {
        const row = await s.from("students").insert({ name: app.student_name, school: app.school, grade: app.grade, phone, phone_last8: phone.slice(-8), parent_phone: digits(app.parent_phone), status: "정상", active: true, joined_at: new Date().toISOString().slice(0, 10) }).select().single();
        if (row.error || !row.data) return NextResponse.json({ message: row.error?.message || "학생을 등록하지 못했습니다." }, { status: 400 });
        const auth = await s.auth.admin.createUser({ email: `${phone}@student.matspu.local`, password: `Mp!${phone.slice(-4)}`, email_confirm: true, user_metadata: { role: "student", student_id: row.data.id, name: row.data.name } });
        if (auth.error || !auth.data.user) {
          await s.from("students").delete().eq("id", row.data.id);
          return NextResponse.json({ message: auth.error?.message || "학생 계정을 만들지 못했습니다." }, { status: 400 });
        }
        await s.from("students").update({ auth_user_id: auth.data.user.id, password_changed: false, password_reset_at: now }).eq("id", row.data.id);
        studentId = row.data.id;
      }
    }

    const child = await s.from("students").select("id,parent_phone").eq("id", studentId).maybeSingle();
    if (!child.data) return NextResponse.json({ message: "연결할 학생을 찾지 못했습니다." }, { status: 404 });
    if (digits(child.data.parent_phone) !== digits(app.parent_phone)) {
      const parentSync = await s.from("students").update({ parent_phone: digits(app.parent_phone) }).eq("id", studentId);
      if (parentSync.error) return NextResponse.json({ message: `학생-학부모 연결 저장 실패: ${parentSync.error.message}` }, { status: 400 });
    }
    try { await ensureParentAccount(s, app.parent_phone); } catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "학부모 계정을 만들지 못했습니다." }, { status: 400 }); }

    const links = await s.from("sos_program_batch_cycles").select("cycle_id").eq("batch_id", app.batch_id);
    if (links.error) return NextResponse.json({ message: `회차 연결 조회 실패: ${links.error.message}` }, { status: 400 });
    const allCycleIds = (links.data ?? []).map((x: any) => String(x.cycle_id));
    if (allCycleIds.length !== 5) return NextResponse.json({ message: `5회 묶음 연결이 올바르지 않습니다. 현재 ${allCycleIds.length}회 연결되어 있습니다.` }, { status: 400 });

    const selected = Array.isArray(app.selected_cycle_ids) ? app.selected_cycle_ids.map(String).filter((id: string) => allCycleIds.includes(id)) : [];
    const partial = String(app.application_mode ?? "ALL") === "CYCLES";
    if (partial && !selected.length) return NextResponse.json({ message: "회차별 신청 정보가 비어 있습니다. 신청 내역을 확인해 주세요." }, { status: 400 });
    const cycleIds = partial ? selected : allCycleIds;

    const enrollment = await s.from("sos_program_enrollments").upsert({ application_id: app.id, batch_id: app.batch_id, student_id: studentId, status: "ACTIVE", enrolled_at: now }, { onConflict: "application_id" });
    if (enrollment.error) return NextResponse.json({ message: `SOS 등록 저장 실패: ${enrollment.error.message}` }, { status: 400 });

    const cycleEnrollment = await s.from("sos_program_cycle_enrollments").upsert(
      cycleIds.map((cycleId: string) => ({ application_id: app.id, batch_id: app.batch_id, cycle_id: cycleId, student_id: studentId, status: "ACTIVE", enrolled_at: now, updated_at: now })),
      { onConflict: "application_id,cycle_id" },
    );
    if (cycleEnrollment.error) return NextResponse.json({ message: `학생-회차 연결 실패: ${missing(cycleEnrollment.error.message)}` }, { status: 400 });

    // 회차에 시험지가 이미 연결된 경우에만 파생 배정을 만든다. 시험지가 나중에 연결되면 learning-cycles API가 자동 배정한다.
    const exams = await s.from("learning_cycle_exams").select("exam_id").in("cycle_id", cycleIds);
    if (exams.error) return NextResponse.json({ message: `시험 연결 조회 실패: ${exams.error.message}` }, { status: 400 });
    const examIds = [...new Set((exams.data ?? []).map((x: any) => String(x.exam_id)).filter(Boolean))];
    if (examIds.length) {
      const assigned = await s.from("exam_registrations").upsert(examIds.map((examId: string) => ({ exam_id: examId, student_id: studentId, status: "assigned", assigned_at: now })), { onConflict: "exam_id,student_id" });
      if (assigned.error) return NextResponse.json({ message: `시험 자동배정 실패: ${assigned.error.message}` }, { status: 400 });
    }

    const finalized = await s.from("sos_program_applications")
      .update({ student_id: studentId, status: "ENROLLED", paid_at: now, enrolled_at: now, updated_at: now })
      .eq("id", app.id)
      .in("status", ["REQUESTED", "PAID"])
      .select("id,status")
      .maybeSingle();
    if (finalized.error || !finalized.data) {
      await s.from("sos_program_enrollments").delete().eq("application_id", app.id);
      return NextResponse.json({ message: finalized.error?.message || "신청 상태 마감 처리에 실패했습니다. 다시 확인해 주세요." }, { status: 409 });
    }
    return NextResponse.json({ success: true, studentId, assignedExamCount: examIds.length, assignedCycleCount: cycleIds.length });
  }

  return NextResponse.json({ message: "지원하지 않는 작업입니다." }, { status: 400 });
}
