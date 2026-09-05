import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const koreaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const missing = (m: string) =>
  m.includes("sos_program_")
    ? "먼저 supabase-sos310-five-cycle-applications.sql을 실행해 주세요."
    : m;

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
    supabase
      .from("sos_program_batch_cycles")
      .select("batch_id,slot_no,learning_cycles(id,name,start_date,end_date,status)")
      .in("batch_id", ids)
      .order("slot_no"),
    supabase
      .from("sos_program_applications")
      .select("batch_id,status")
      .in("batch_id", ids)
      .in("status", ["REQUESTED", "PAID", "ENROLLED"]),
  ]);
  if (links.error || applications.error)
    throw new Error(missing(links.error?.message || applications.error?.message || "신청 정보를 불러오지 못했습니다."));
  const today = koreaToday();
  return (batches.data ?? []).map((batch: any) => ({
    ...batch,
    cycles: (links.data ?? [])
      .filter((x: any) => String(x.batch_id) === String(batch.id))
      .map((x: any) => ({ slot_no: x.slot_no, ...(x.learning_cycles ?? {}) })),
    application_count: (applications.data ?? []).filter((x: any) => String(x.batch_id) === String(batch.id)).length,
  })).filter((batch: any) => {
    const starts = (batch.cycles ?? []).map((cycle: any) => String(cycle.start_date ?? "").slice(0, 10)).filter(Boolean).sort();
    // 5회 묶음은 1회차가 이미 지난 뒤에는 신규 신청을 받지 않는다.
    return !starts[0] || starts[0] >= today;
  });
}

export async function GET() {
  try {
    return NextResponse.json(
      { batches: await publicBatches(createClient()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "모집 정보를 불러오지 못했습니다." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const batchId = String(body.batchId ?? "");
  const parentName = String(body.parentName ?? "").trim();
  const parentPhone = digits(body.parentPhone);
  const studentName = String(body.studentName ?? "").trim();
  const studentPhone = digits(body.studentPhone);
  const school = String(body.school ?? "").trim();
  const grade = String(body.grade ?? "고1").trim();
  const paymentMethod = String(body.paymentMethod ?? "").toUpperCase();
  if (!batchId || !parentName || parentPhone.length < 10 || !studentName || !school || studentPhone.length < 10)
    return NextResponse.json({ message: "학부모·학생 정보와 학생 전화번호를 빠짐없이 입력해 주세요." }, { status: 400 });
  if (!['CARD', 'BANK_TRANSFER'].includes(paymentMethod))
    return NextResponse.json({ message: "결제 방법을 선택해 주세요." }, { status: 400 });
  const supabase = createClient();
  const now = new Date().toISOString();
  const batch = await supabase
    .from("sos_program_batches")
    .select("id,capacity,application_start,application_end")
    .eq("id", batchId)
    .eq("is_published", true)
    .maybeSingle();
  if (batch.error || !batch.data)
    return NextResponse.json({ message: "현재 신청 가능한 5회 묶음이 아닙니다." }, { status: 404 });
  if ((batch.data.application_start && batch.data.application_start > now) || (batch.data.application_end && batch.data.application_end < now))
    return NextResponse.json({ message: "신청 기간이 아닙니다." }, { status: 400 });

  const cycleLinks = await supabase
    .from("sos_program_batch_cycles")
    .select("slot_no,learning_cycles(start_date)")
    .eq("batch_id", batchId)
    .order("slot_no");
  if (cycleLinks.error)
    return NextResponse.json({ message: missing(cycleLinks.error.message) }, { status: 400 });
  const firstStart = (cycleLinks.data ?? [])
    .map((x: any) => String(x.learning_cycles?.start_date ?? "").slice(0, 10))
    .filter(Boolean)
    .sort()[0];
  if (firstStart && firstStart < koreaToday())
    return NextResponse.json({ message: "이미 시작한 SOS 5회 프로그램은 신청할 수 없습니다." }, { status: 400 });

  const existingApplication = await supabase
    .from("sos_program_applications")
    .select("id,status")
    .eq("batch_id", batchId)
    .eq("parent_phone", parentPhone)
    .eq("student_name", studentName)
    .maybeSingle();
  if (existingApplication.error)
    return NextResponse.json({ message: missing(existingApplication.error.message) }, { status: 400 });
  if (existingApplication.data && ["REQUESTED", "PAID", "ENROLLED"].includes(String(existingApplication.data.status)))
    return NextResponse.json({ message: "이미 신청된 SOS 5회 프로그램입니다. 기존 신청 상태를 확인해 주세요." }, { status: 409 });

  if (batch.data.capacity) {
    const count = await supabase.from("sos_program_applications").select("id", { count: "exact", head: true }).eq("batch_id", batchId).in("status", ["REQUESTED", "PAID", "ENROLLED"]);
    if ((count.count ?? 0) >= Number(batch.data.capacity))
      return NextResponse.json({ message: "신청 정원이 마감되었습니다." }, { status: 409 });
  }
  let studentId: string | null = null;
  let source = "PUBLIC";
  const user = await getSessionUser();
  if (user?.user_metadata?.role === "parent") {
    const linked = await supabase.from("students").select("id").eq("id", String(body.studentId ?? "")).eq("parent_phone", parentPhone).maybeSingle();
    if (linked.data) { studentId = linked.data.id; source = "PARENT"; }
  }
  const payload = {
    batch_id: batchId,
    student_id: studentId,
    parent_name: parentName,
    parent_phone: parentPhone,
    student_name: studentName,
    student_phone: studentPhone,
    school,
    grade,
    payment_method: paymentMethod,
    status: "REQUESTED",
    source,
    requested_at: now,
    paid_at: null,
    enrolled_at: null,
    updated_at: now,
  };
  const saved = existingApplication.data
    ? await supabase.from("sos_program_applications").update(payload).eq("id", existingApplication.data.id).in("status", ["CANCELLED", "REFUNDED"]).select("id,status,payment_method").single()
    : await supabase.from("sos_program_applications").insert(payload).select("id,status,payment_method").single();
  return saved.error
    ? NextResponse.json({ message: missing(saved.error.message) }, { status: 400 })
    : NextResponse.json({ success: true, application: saved.data });
}
