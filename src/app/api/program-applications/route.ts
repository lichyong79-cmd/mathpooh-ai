import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { normalizeSosScope } from "@/lib/sos-program-flow";

export const dynamic = "force-dynamic";
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const koreaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const missing = (m: string) => m.includes("sos_program_") ? "먼저 SOS 프로그램 관련 SQL을 실행해 주세요." : m;

async function publicBatches(supabase: any) {
  const now = new Date().toISOString();
  const batches = await supabase
    .from("sos_program_batches")
    .select("id,title,price,application_start,application_end,capacity,memo,created_at")
    .eq("is_published", true)
    .or(`application_start.is.null,application_start.lte.${now}`)
    .or(`application_end.is.null,application_end.gte.${now}`)
    .order("created_at", { ascending: false });
  if (batches.error) throw new Error(missing(batches.error.message));
  const ids = (batches.data ?? []).map((x: any) => x.id);
  if (!ids.length) return [];
  const [links, applications] = await Promise.all([
    supabase.from("sos_program_batch_cycles").select("batch_id,cycle_id,slot_no,learning_cycles(id,name,start_date,end_date,status)").in("batch_id", ids).order("slot_no"),
    supabase.from("sos_program_applications").select("batch_id,status").in("batch_id", ids).in("status", ["REQUESTED", "PAID", "ENROLLED"]),
  ]);
  if (links.error || applications.error) throw new Error(missing(links.error?.message || applications.error?.message || "신청 정보를 불러오지 못했습니다."));
  const today = koreaToday();
  return (batches.data ?? []).map((batch: any) => {
    const cycles = (links.data ?? []).filter((x: any) => String(x.batch_id) === String(batch.id)).map((x: any) => ({ cycle_id: x.cycle_id, slot_no: x.slot_no, ...(x.learning_cycles ?? {}) }));
    return {
      ...batch,
      cycles: cycles.map((c: any) => ({ ...c, is_closed: String(c.start_date ?? "").slice(0, 10) < today })),
      application_count: (applications.data ?? []).filter((x: any) => String(x.batch_id) === String(batch.id)).length,
    };
  }).filter((batch: any) => (batch.cycles ?? []).some((cycle: any) => !cycle.is_closed));
}

export async function GET() {
  try {
    return NextResponse.json({ batches: await publicBatches(createClient()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "모집 정보를 불러오지 못했습니다." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || String(user.user_metadata?.role) !== "parent")
    return NextResponse.json({ message: "학부모 계정으로 로그인한 뒤 신청해 주세요." }, { status: 401 });

  const body = await request.json();
  const action = String(body.action ?? "");
  const parentPhoneFromUser = digits(user.user_metadata?.parent_phone ?? String(user.email ?? "").split("@")[0]);

  if (action === "cancel") {
    const applicationId = String(body.applicationId ?? "");
    if (!applicationId) return NextResponse.json({ message: "취소할 신청을 선택해 주세요." }, { status: 400 });
    const supabase = createClient();
    const found = await supabase.from("sos_program_applications").select("id,status,parent_phone").eq("id", applicationId).maybeSingle();
    if (found.error || !found.data || digits(found.data.parent_phone) !== parentPhoneFromUser)
      return NextResponse.json({ message: "신청 정보를 확인할 수 없습니다." }, { status: 404 });
    if (String(found.data.status) !== "REQUESTED")
      return NextResponse.json({ message: "결제 확인 또는 등록이 완료된 신청은 학부모 화면에서 취소할 수 없습니다. 관리자에게 문의해 주세요." }, { status: 409 });
    const cancelled = await supabase.from("sos_program_applications").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", applicationId).eq("status", "REQUESTED");
    return cancelled.error ? NextResponse.json({ message: missing(cancelled.error.message) }, { status: 400 }) : NextResponse.json({ success: true });
  }

  const batchId = String(body.batchId ?? "");
  const parentName = String(user.user_metadata?.name ?? body.parentName ?? "학부모").trim();
  const parentPhone = parentPhoneFromUser;
  const studentName = String(body.studentName ?? "").trim();
  const studentPhone = digits(body.studentPhone);
  const school = String(body.school ?? "").trim();
  const grade = String(body.grade ?? "고1").trim();
  const paymentMethod = String(body.paymentMethod ?? "").toUpperCase();
  const applicationMode = String(body.applicationMode ?? "ALL").toUpperCase() === "CYCLES" ? "CYCLES" : "ALL";
  const scopeCode = normalizeSosScope(body.scopeCode);

  if (!batchId || !parentName || parentPhone.length < 10 || !studentName || !school || studentPhone.length < 10)
    return NextResponse.json({ message: "학부모·학생 정보와 학생 전화번호를 빠짐없이 입력해 주세요." }, { status: 400 });
  if (!["CARD", "BANK_TRANSFER"].includes(paymentMethod))
    return NextResponse.json({ message: "결제 방법을 선택해 주세요." }, { status: 400 });

  const supabase = createClient();
  const now = new Date().toISOString();
  const today = koreaToday();
  const batch = await supabase.from("sos_program_batches").select("id,price,capacity,application_start,application_end").eq("id", batchId).eq("is_published", true).maybeSingle();
  if (batch.error || !batch.data) return NextResponse.json({ message: "현재 신청 가능한 SOS 프로그램이 아닙니다." }, { status: 404 });
  if ((batch.data.application_start && batch.data.application_start > now) || (batch.data.application_end && batch.data.application_end < now))
    return NextResponse.json({ message: "신청 기간이 아닙니다." }, { status: 400 });

  const cycleLinks = await supabase.from("sos_program_batch_cycles").select("cycle_id,slot_no,learning_cycles(start_date)").eq("batch_id", batchId).order("slot_no");
  if (cycleLinks.error) return NextResponse.json({ message: missing(cycleLinks.error.message) }, { status: 400 });
  const cycleRows = (cycleLinks.data ?? []).map((x: any) => ({ cycleId: String(x.cycle_id), slotNo: Number(x.slot_no), start: String(x.learning_cycles?.start_date ?? "").slice(0, 10) }));
  if (cycleRows.length !== 5) return NextResponse.json({ message: "5회 프로그램의 회차 구성을 확인해 주세요." }, { status: 400 });
  const available = cycleRows.filter((x: any) => x.start && x.start >= today);
  if (!available.length) return NextResponse.json({ message: "모든 회차가 종료된 프로그램입니다." }, { status: 400 });

  const requested: string[] = Array.from(
    new Set<string>((Array.isArray(body.selectedCycleIds) ? body.selectedCycleIds : []).map((id: unknown) => String(id)))
  );
  let selectedCycleIds = applicationMode === "ALL" ? available.map((x: any) => x.cycleId) : requested.filter((id: string) => available.some((x: any) => x.cycleId === id));
  if (!selectedCycleIds.length) return NextResponse.json({ message: "신청할 회차를 1개 이상 선택해 주세요." }, { status: 400 });
  if (requested.some((id: string) => !available.some((x: any) => x.cycleId === id))) return NextResponse.json({ message: "이미 종료된 회차는 신청할 수 없습니다." }, { status: 400 });

  const unitPrice = Math.round(Number(batch.data.price ?? 0) / 5);
  const chargedPrice = unitPrice * selectedCycleIds.length;

  const existingApplication = await supabase.from("sos_program_applications").select("id,status").eq("batch_id", batchId).eq("parent_phone", parentPhone).eq("student_name", studentName).maybeSingle();
  if (existingApplication.error) return NextResponse.json({ message: missing(existingApplication.error.message) }, { status: 400 });
  if (existingApplication.data && ["REQUESTED", "PAID", "ENROLLED"].includes(String(existingApplication.data.status)))
    return NextResponse.json({ message: "이미 신청된 SOS 프로그램입니다. 기존 신청 상태를 확인해 주세요." }, { status: 409 });

  if (batch.data.capacity) {
    const count = await supabase.from("sos_program_applications").select("id", { count: "exact", head: true }).eq("batch_id", batchId).in("status", ["REQUESTED", "PAID", "ENROLLED"]);
    if ((count.count ?? 0) >= Number(batch.data.capacity)) return NextResponse.json({ message: "신청 정원이 마감되었습니다." }, { status: 409 });
  }

  const linked = await supabase.from("students").select("id,name,phone,school,grade").eq("id", String(body.studentId ?? "")).eq("parent_phone", parentPhone).maybeSingle();
  if (linked.error || !linked.data) return NextResponse.json({ message: "먼저 학부모 페이지에서 신청할 자녀를 등록해 주세요." }, { status: 403 });

  const payload = {
    batch_id: batchId,
    student_id: linked.data.id,
    parent_name: parentName,
    parent_phone: parentPhone,
    student_name: studentName,
    student_phone: studentPhone,
    school,
    grade,
    payment_method: paymentMethod,
    application_mode: applicationMode,
    selected_cycle_ids: selectedCycleIds,
    purchased_count: selectedCycleIds.length,
    scope_code: scopeCode,
    charged_price: chargedPrice,
    status: "REQUESTED",
    source: "PARENT",
    requested_at: now,
    paid_at: null,
    enrolled_at: null,
    updated_at: now,
  };
  const saved = existingApplication.data
    ? await supabase.from("sos_program_applications").update(payload).eq("id", existingApplication.data.id).in("status", ["CANCELLED", "REFUNDED"]).select("id,status,payment_method,application_mode,selected_cycle_ids,purchased_count,scope_code,charged_price").single()
    : await supabase.from("sos_program_applications").insert(payload).select("id,status,payment_method,application_mode,selected_cycle_ids,purchased_count,scope_code,charged_price").single();

  return saved.error ? NextResponse.json({ message: missing(saved.error.message) }, { status: 400 }) : NextResponse.json({ success: true, application: saved.data });
}
