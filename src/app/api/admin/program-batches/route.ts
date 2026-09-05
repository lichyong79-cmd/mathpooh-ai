import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { ensureParentAccount } from "@/lib/parent-account";

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const koreaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const missing = (m: string) => m.includes("sos_program_") ? "먼저 supabase-sos310-five-cycle-applications.sql을 실행해 주세요." : m;
async function admin() { return await getAdminUser(); }

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
    batches: (batches.data ?? []).map((b: any) => ({ ...b, cycles: (links.data ?? []).filter((x: any) => String(x.batch_id) === String(b.id)).sort((a: any, z: any) => a.slot_no - z.slot_no).map((x: any) => ({ ...x, ...(cycles.data ?? []).find((c: any) => String(c.id) === String(x.cycle_id)) })) })),
    cycles: cycles.data ?? [], applications: applications.data ?? [], enrollments: enrollments.data ?? [], students: students.data ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const b = await request.json(); const action = String(b.action ?? ""); const s = createClient(); const now = new Date().toISOString();
  if (action === "create") {
    const cycleIds = [...new Set((Array.isArray(b.cycleIds) ? b.cycleIds : []).map(String))];
    if (cycleIds.length !== 5) return NextResponse.json({ message: "운영 회차를 정확히 5개 선택해 주세요." }, { status: 400 });
    const title = String(b.title ?? "").trim(); if (!title) return NextResponse.json({ message: "5회 묶음 이름을 입력해 주세요." }, { status: 400 });
    const cycleRows = await s.from("learning_cycles").select("id,start_date").in("id", cycleIds).order("start_date");
    if (cycleRows.error || (cycleRows.data ?? []).length !== 5) return NextResponse.json({ message: "선택한 운영 회차를 확인해 주세요." }, { status: 400 });
    const firstStart = String((cycleRows.data ?? [])[0]?.start_date ?? "").slice(0, 10);
    if (!firstStart) return NextResponse.json({ message: "1회차 시작일이 없는 운영 회차는 묶을 수 없습니다." }, { status: 400 });
    if (firstStart < koreaToday()) return NextResponse.json({ message: "이미 시작한 회차가 포함된 5회 묶음은 만들 수 없습니다." }, { status: 400 });
    const batch = await s.from("sos_program_batches").insert({ title, price: Math.max(0, Number(b.price ?? 350000)), application_start: b.applicationStart || null, application_end: b.applicationEnd || null, capacity: b.capacity ? Math.max(1, Number(b.capacity)) : null, memo: String(b.memo ?? ""), is_published: false }).select().single();
    if (batch.error || !batch.data) return NextResponse.json({ message: missing(batch.error?.message || "묶음을 만들지 못했습니다.") }, { status: 400 });
    const linked = await s.from("sos_program_batch_cycles").insert((cycleRows.data ?? []).map((x: any, i: number) => ({ batch_id: batch.data.id, cycle_id: x.id, slot_no: i + 1 })));
    if (linked.error) { await s.from("sos_program_batches").delete().eq("id", batch.data.id); return NextResponse.json({ message: missing(linked.error.message) }, { status: 400 }); }
    return NextResponse.json({ success: true, batch: batch.data });
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
      if (starts[0] < koreaToday()) return NextResponse.json({ message: "1회차가 이미 지난 묶음은 신청을 열 수 없습니다." }, { status: 400 });
      if (batchCheck.data.application_start && batchCheck.data.application_end && batchCheck.data.application_start > batchCheck.data.application_end)
        return NextResponse.json({ message: "신청 시작일이 신청 종료일보다 늦습니다." }, { status: 400 });
    }
    const q = await s.from("sos_program_batches").update({ is_published: Boolean(b.published), updated_at: now }).eq("id", batchId);
    return q.error ? NextResponse.json({ message: missing(q.error.message) }, { status: 400 }) : NextResponse.json({ success: true });
  }
  if (action === "cancel") {
    const q = await s.from("sos_program_applications").update({ status: "CANCELLED", updated_at: now }).eq("id", String(b.applicationId ?? "")).eq("status", "REQUESTED");
    return q.error ? NextResponse.json({ message: q.error.message }, { status: 400 }) : NextResponse.json({ success: true });
  }
  if (action === "enroll") {
    const appResult = await s.from("sos_program_applications").select("*").eq("id", String(b.applicationId ?? "")).maybeSingle();
    const app: any = appResult.data; if (appResult.error || !app) return NextResponse.json({ message: "신청서를 찾지 못했습니다." }, { status: 404 });
    if (!['REQUESTED', 'PAID'].includes(String(app.status)))
      return NextResponse.json({ message: app.status === 'ENROLLED' ? "이미 등록 완료된 신청입니다." : "현재 상태에서는 등록할 수 없습니다." }, { status: 409 });
    let studentId = String(b.studentId ?? app.student_id ?? "");
    if (!studentId) {
      const phone = digits(app.student_phone); if (phone.length < 10) return NextResponse.json({ message: "신규 학생 계정 생성을 위해 학생 전화번호를 입력하거나 기존 학생을 연결해 주세요." }, { status: 400 });
      const existing = await s.from("students").select("id").or(`phone.eq.${phone},phone_last8.eq.${phone.slice(-8)}`).maybeSingle();
      if (existing.data) studentId = existing.data.id;
      else {
        const row = await s.from("students").insert({ name: app.student_name, school: app.school, grade: app.grade, phone, phone_last8: phone.slice(-8), parent_phone: digits(app.parent_phone), status: "정상", active: true, joined_at: new Date().toISOString().slice(0, 10) }).select().single();
        if (row.error || !row.data) return NextResponse.json({ message: row.error?.message || "학생을 등록하지 못했습니다." }, { status: 400 });
        const auth = await s.auth.admin.createUser({ email: `${phone}@student.matspu.local`, password: `Mp!${phone.slice(-4)}`, email_confirm: true, user_metadata: { role: "student", student_id: row.data.id, name: row.data.name } });
        if (auth.error || !auth.data.user) { await s.from("students").delete().eq("id", row.data.id); return NextResponse.json({ message: auth.error?.message || "학생 계정을 만들지 못했습니다." }, { status: 400 }); }
        await s.from("students").update({ auth_user_id: auth.data.user.id, password_changed: false, password_reset_at: now }).eq("id", row.data.id); studentId = row.data.id;
      }
    }
    const child = await s.from("students").select("id,parent_phone").eq("id", studentId).maybeSingle();
    if (!child.data) return NextResponse.json({ message: "연결할 학생을 찾지 못했습니다." }, { status: 404 });
    if (digits(child.data.parent_phone) !== digits(app.parent_phone)) {
      const parentSync = await s.from("students").update({ parent_phone: digits(app.parent_phone) }).eq("id", studentId);
      if (parentSync.error) return NextResponse.json({ message: `학생-학부모 연결 저장 실패: ${parentSync.error.message}` }, { status: 400 });
    }
    try { await ensureParentAccount(s, app.parent_phone); } catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "학부모 계정을 만들지 못했습니다." }, { status: 400 }); }
    // 회차/시험 배정을 먼저 검증한다. 중간 실패를 조용히 무시하지 않는다.
    const links = await s.from("sos_program_batch_cycles").select("cycle_id").eq("batch_id", app.batch_id);
    if (links.error) return NextResponse.json({ message: `회차 연결 조회 실패: ${links.error.message}` }, { status: 400 });
    const cycleIds = (links.data ?? []).map((x: any) => x.cycle_id);
    if (cycleIds.length !== 5) return NextResponse.json({ message: `5회 묶음 연결이 올바르지 않습니다. 현재 ${cycleIds.length}회 연결되어 있습니다.` }, { status: 400 });

    const exams = await s.from("learning_cycle_exams").select("exam_id").in("cycle_id", cycleIds);
    if (exams.error) return NextResponse.json({ message: `시험 연결 조회 실패: ${exams.error.message}` }, { status: 400 });
    const examIds = [...new Set((exams.data ?? []).map((x: any) => String(x.exam_id)).filter(Boolean))];
    if (examIds.length) {
      const assigned = await s.from("exam_registrations").upsert(
        examIds.map((examId: string) => ({ exam_id: examId, student_id: studentId, status: "assigned", assigned_at: now })),
        { onConflict: "exam_id,student_id" },
      );
      if (assigned.error) return NextResponse.json({ message: `시험 자동배정 실패: ${assigned.error.message}` }, { status: 400 });
    }

    const enrollment = await s.from("sos_program_enrollments").upsert({ application_id: app.id, batch_id: app.batch_id, student_id: studentId, status: "ACTIVE", enrolled_at: now }, { onConflict: "application_id" });
    if (enrollment.error) return NextResponse.json({ message: `5회 등록 저장 실패: ${enrollment.error.message}` }, { status: 400 });

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
    return NextResponse.json({ success: true, studentId, assignedExamCount: examIds.length });
  }
  return NextResponse.json({ message: "지원하지 않는 작업입니다." }, { status: 400 });
}
