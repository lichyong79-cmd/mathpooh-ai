import { isArchivedPracticeCycle, isArchivedPracticeExam, isArchivedPracticeSession } from "@/lib/archived-practice-exams";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { ensureParentAccount } from "@/lib/parent-account";
import { normalizeSosScope } from "@/lib/sos-program-flow";

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const koreaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const missing = (m: string) => m.includes("sos_program_") ? "먼저 SOS 프로그램 관련 SQL을 실행해 주세요." : m;
async function admin() { return await getAdminUser(); }

async function cancelCycleAssignments(s: any, applicationId: string, now: string) {
  const memberships = await s.from("learning_cycle_students").select("id").eq("application_id", applicationId).eq("status", "ACTIVE");
  if (memberships.error) return memberships.error.message;
  const membershipIds = (memberships.data ?? []).map((row: any) => row.id);
  if (membershipIds.length) {
    const registrations = await s.from("exam_registrations").update({ status: "cancelled", booking_status: "CANCELLED" }).in("cycle_student_id", membershipIds).neq("status", "refunded");
    if (registrations.error) return registrations.error.message;
  }
  const cancelled = await s.from("learning_cycle_students").update({ status: "CANCELLED", updated_at: now }).eq("application_id", applicationId).eq("status", "ACTIVE");
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
        .filter((x: any) => String(x.batch_id) === String(b.id) && !isArchivedPracticeCycle((cycles.data??[]).find((c:any)=>c.id===x.cycle_id)??{}))
        .sort((a: any, z: any) => a.slot_no - z.slot_no)
        .map((x: any) => ({ ...x, ...(cycles.data ?? []).find((c: any) => String(c.id) === String(x.cycle_id)) })),
    })),
    cycles: (cycles.data ?? []).filter((c:any)=>!isArchivedPracticeCycle(c)),
    recentCycles: (cycles.data ?? []).filter((c:any)=>!isArchivedPracticeCycle(c)).slice(0, 10),
    applications: applications.data ?? [], enrollments: enrollments.data ?? [], students: students.data ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}

async function normalizedCycleRows(s: any, cycleIdsRaw: unknown) {
  const cycleIds: string[] = [...new Set<string>((Array.isArray(cycleIdsRaw) ? cycleIdsRaw : []).map((id: unknown) => String(id)))];
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

  if (action === "update-application-cycles") {
    const applicationId = String(b.applicationId ?? "");
    const requestedIds = [...new Set<string>((Array.isArray(b.cycleIds) ? b.cycleIds : []).map(String))];
    const appResult = await s.from("sos_program_applications").select("*").eq("id", applicationId).maybeSingle();
    const app: any = appResult.data;
    if (appResult.error || !app) return NextResponse.json({ message: "신청서를 찾지 못했습니다." }, { status: 404 });
    if (["CANCELLED", "REFUNDED"].includes(String(app.status)))
      return NextResponse.json({ message: "취소·환불된 신청은 참가일을 변경할 수 없습니다." }, { status: 409 });

    const originalIds = Array.isArray(app.selected_cycle_ids) && app.selected_cycle_ids.length
      ? app.selected_cycle_ids.map(String)
      : (await s.from("sos_program_batch_cycles").select("cycle_id").eq("batch_id", app.batch_id).order("slot_no")).data?.map((x: any) => String(x.cycle_id)) ?? [];
    const purchasedCount = Math.max(1, Number(app.purchased_count) || originalIds.length || 5);
    if (requestedIds.length !== purchasedCount)
      return NextResponse.json({ message: `결제된 ${purchasedCount}회와 동일하게 참가일 ${purchasedCount}개를 선택해 주세요.` }, { status: 400 });

    const recent = await s.from("learning_cycles").select("id,name,start_date,scheduled_at")
      .order("start_date", { ascending: false }).limit(50);
    if (recent.error) return NextResponse.json({ message: recent.error.message }, { status: 400 });
    const allowed = (recent.data ?? []).filter((c: any) => !isArchivedPracticeCycle(c)).slice(0, 10);
    if (requestedIds.some((id) => !allowed.some((c: any) => String(c.id) === id)))
      return NextResponse.json({ message: "최근 10회 참가 일정 안에서만 변경할 수 있습니다." }, { status: 400 });

    const selectedCycles = allowed.filter((c: any) => requestedIds.includes(String(c.id)))
      .sort((a: any, z: any) => String(a.start_date).localeCompare(String(z.start_date)));
    const studentId = String(app.student_id ?? b.studentId ?? "");
    if (String(app.status) === "ENROLLED" && studentId) {
      const [members, attempts] = await Promise.all([
        s.from("learning_cycle_students").select("id,cycle_id,booking_status,formal_sequence,scope_code,status")
          .eq("application_id", applicationId),
        s.from("exam_attempts").select("cycle_student_id,status,formal_sequence,is_practice")
          .eq("student_id", studentId).in("status", ["in_progress", "submitted"]),
      ]);
      if (members.error || attempts.error) return NextResponse.json({ message: members.error?.message || attempts.error?.message }, { status: 400 });
      const attemptMemberIds = new Set((attempts.data ?? []).map((x: any) => String(x.cycle_student_id ?? "")).filter(Boolean));
      const protectedRemoved = (members.data ?? []).filter((m: any) => !requestedIds.includes(String(m.cycle_id)) &&
        (["IN_PROGRESS", "COMPLETED"].includes(String(m.booking_status)) || attemptMemberIds.has(String(m.id))));
      if (protectedRemoved.length)
        return NextResponse.json({ message: "이미 응시 중이거나 완료한 날짜는 변경할 수 없습니다. 다른 예정 날짜만 교체해 주세요." }, { status: 409 });
      const removable = (members.data ?? []).filter((m: any) => !requestedIds.includes(String(m.cycle_id)) &&
        !["IN_PROGRESS", "COMPLETED"].includes(String(m.booking_status)) && !attemptMemberIds.has(String(m.id)));
      const removableIds = removable.map((m: any) => String(m.id));
      if (removableIds.length) {
        const cancelledRegs = await s.from("exam_registrations").update({ status: "cancelled", booking_status: "CANCELLED" })
          .in("cycle_student_id", removableIds).neq("status", "refunded");
        if (cancelledRegs.error) return NextResponse.json({ message: cancelledRegs.error.message }, { status: 400 });
        const cancelledMembers = await s.from("learning_cycle_students").update({ status: "CANCELLED", booking_status: "CANCELLED", updated_at: now })
          .in("id", removableIds);
        if (cancelledMembers.error) return NextResponse.json({ message: cancelledMembers.error.message }, { status: 400 });
      }

      const completedSequence = Math.max(0, ...(attempts.data ?? []).filter((x: any) => x.status === "submitted" && !x.is_practice)
        .map((x: any) => Number(x.formal_sequence) || 0));
      const scopeCode = normalizeSosScope(app.scope_code);
      for (let index = 0; index < selectedCycles.length; index += 1) {
        const cycle: any = selectedCycles[index];
        const existing: any = (members.data ?? []).find((m: any) => String(m.cycle_id) === String(cycle.id));
        if (existing && (["IN_PROGRESS", "COMPLETED"].includes(String(existing.booking_status)) || attemptMemberIds.has(String(existing.id)))) continue;
        const saved = await s.from("learning_cycle_students").upsert({
          application_id: applicationId, cycle_id: cycle.id, student_id: studentId,
          source: "SOS_APPLICATION", status: "ACTIVE", registered_at: now, updated_at: now,
          formal_sequence: completedSequence + index + 1, scope_code: scopeCode, attendance_mode: "ZOOM",
          scheduled_at: cycle.scheduled_at || null, booking_status: "SCHEDULED",
          sos_gate_status: completedSequence + index + 1 <= 1 ? "OPEN" : "LOCKED", is_practice: false,
        }, { onConflict: "cycle_id,student_id" });
        if (saved.error) return NextResponse.json({ message: `학생 일정 변경 실패: ${missing(saved.error.message)}` }, { status: 400 });
      }
    }

    const updated = await s.from("sos_program_applications").update({
      application_mode: "CYCLES", selected_cycle_ids: requestedIds, purchased_count: purchasedCount, updated_at: now,
    }).eq("id", applicationId);
    return updated.error
      ? NextResponse.json({ message: updated.error.message }, { status: 400 })
      : NextResponse.json({ success: true, selectedCycleIds: requestedIds });
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

    const links = await s.from("sos_program_batch_cycles").select("cycle_id,slot_no,learning_cycles(start_date,scheduled_at)").eq("batch_id", app.batch_id).order("slot_no");
    if (links.error) return NextResponse.json({ message: `회차 연결 조회 실패: ${links.error.message}` }, { status: 400 });
    const allCycleIds = (links.data ?? []).map((x: any) => String(x.cycle_id));
    if (allCycleIds.length !== 5) return NextResponse.json({ message: `5회 묶음 연결이 올바르지 않습니다. 현재 ${allCycleIds.length}회 연결되어 있습니다.` }, { status: 400 });

    const selected = Array.isArray(app.selected_cycle_ids) ? app.selected_cycle_ids.map(String) : [];
    const partial = String(app.application_mode ?? "ALL") === "CYCLES";
    if (partial && !selected.length) return NextResponse.json({ message: "회차별 신청 정보가 비어 있습니다. 신청 내역을 확인해 주세요." }, { status: 400 });
    const cycleIds = partial ? selected : allCycleIds;
    const selectedCycleResult = await s.from("learning_cycles").select("id,start_date,scheduled_at").in("id", cycleIds).order("start_date");
    if (selectedCycleResult.error || (selectedCycleResult.data ?? []).length !== cycleIds.length)
      return NextResponse.json({ message: selectedCycleResult.error?.message || "선택한 참가 일정을 확인해 주세요." }, { status: 400 });
    const selectedSlots = (selectedCycleResult.data ?? []).map((cycle: any) => ({ cycle_id: cycle.id, learning_cycles: cycle }));
    const scopeCode = normalizeSosScope(app.scope_code);

    const [formalAttempts, formalMemberships] = await Promise.all([
      s.from("exam_attempts").select("formal_sequence,is_practice").eq("student_id", studentId).eq("status", "submitted"),
      s.from("learning_cycle_students").select("formal_sequence,is_practice").eq("student_id", studentId).eq("status", "ACTIVE"),
    ]);
    if (formalAttempts.error || formalMemberships.error)
      return NextResponse.json({ message: formalAttempts.error?.message || formalMemberships.error?.message || "공식 참가순번 확인 실패" }, { status: 400 });
    const existingSequences = [...(formalAttempts.data ?? []), ...(formalMemberships.data ?? [])]
      .filter((row: any) => !row.is_practice && Number(row.formal_sequence) > 0)
      .map((row: any) => Number(row.formal_sequence));
    const firstSequence = Math.max(0, ...existingSequences) + 1;

    const enrollment = await s.from("sos_program_enrollments").upsert({ application_id: app.id, batch_id: app.batch_id, student_id: studentId, status: "ACTIVE", enrolled_at: now }, { onConflict: "application_id" });
    if (enrollment.error) return NextResponse.json({ message: `SOS 등록 저장 실패: ${enrollment.error.message}` }, { status: 400 });

    const cycleEnrollmentRows = selectedSlots.map((slot: any, index: number) => ({
      application_id: app.id, cycle_id: slot.cycle_id, student_id: studentId,
      source: "SOS_APPLICATION", status: "ACTIVE", registered_at: now, updated_at: now,
      formal_sequence: firstSequence + index, scope_code: scopeCode, attendance_mode: "ZOOM",
      scheduled_at: slot.learning_cycles?.scheduled_at || null, booking_status: "SCHEDULED",
      sos_gate_status: firstSequence + index <= 1 ? "OPEN" : "LOCKED", is_practice: false,
    }));
    const cycleEnrollment = await s.from("learning_cycle_students").upsert(cycleEnrollmentRows, { onConflict: "cycle_id,student_id" }).select("id,cycle_id,student_id,formal_sequence,scope_code,attendance_mode,scheduled_at,booking_status");
    if (cycleEnrollment.error) return NextResponse.json({ message: `학생-회차 연결 실패: ${missing(cycleEnrollment.error.message)}` }, { status: 400 });

    // 입금확인은 참가 등록까지만 처리합니다. 시험지는 배정 화면에서 지정합니다.

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
    return NextResponse.json({ success: true, studentId, assignedCycleCount: cycleIds.length, firstSequence, scopeCode });
  }

  return NextResponse.json({ message: "지원하지 않는 작업입니다." }, { status: 400 });
}
