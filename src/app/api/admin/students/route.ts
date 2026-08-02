import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
async function adminOnly() { const user = await getSessionUser(); return !user || user.user_metadata?.role === "student" ? null : user; }
const output = (row: any) => ({ id: String(row.id), name: row.name ?? "", school: row.school ?? "", grade: row.grade ?? "고1", phone: row.phone ?? row.phone_last8 ?? "", parentPhone: row.parent_phone ?? "", status: row.status ?? (row.active === false ? "퇴원" : "정상"), sosStatus: "진단대기", lastScore: null, lastExam: "-", joinedAt: row.joined_at ?? String(row.created_at ?? "").slice(0,10), memo: row.memo ?? "" });

export async function GET() { if (!await adminOnly()) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 }); const supabase = createClient(); const { data, error } = await supabase.from("students").select("*").order("created_at", { ascending: false }); return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ students: (data ?? []).map(output) }); }

export async function POST(request: Request) {
  if (!await adminOnly()) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json(); const phone = digits(body.phone); if (phone.length < 10) return NextResponse.json({ message: "학생 전화번호를 정확히 입력해 주세요." }, { status: 400 });
  const supabase = createClient();
  const { data: student, error } = await supabase.from("students").insert({ name: String(body.name ?? "").trim(), school: String(body.school ?? "").trim(), grade: body.grade ?? "고1", phone, phone_last8: phone.slice(-8), parent_phone: digits(body.parentPhone), status: body.status ?? "정상", active: body.status !== "퇴원", memo: body.memo ?? "", joined_at: body.joinedAt || new Date().toISOString().slice(0,10) }).select().single();
  if (error || !student) return NextResponse.json({ message: error?.message || "학생 등록 실패" }, { status: 400 });
  const created = await supabase.auth.admin.createUser({ email: `${phone}@student.matspu.local`, password: `Mp!${phone.slice(-4)}`, email_confirm: true, user_metadata: { role: "student", student_id: student.id, name: student.name } });
  if (created.error || !created.data.user) { await supabase.from("students").delete().eq("id", student.id); return NextResponse.json({ message: created.error?.message || "학생 계정 생성 실패" }, { status: 400 }); }
  const { data: linked } = await supabase.from("students").update({ auth_user_id: created.data.user.id, password_changed: false, password_reset_at: new Date().toISOString() }).eq("id", student.id).select().single();
  return NextResponse.json({ student: output(linked), loginId: phone, temporaryPassword: phone.slice(-4) });
}

export async function PATCH(request: Request) { if (!await adminOnly()) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 }); const body = await request.json(); const supabase = createClient(); const phone = digits(body.phone); const { data, error } = await supabase.from("students").update({ name: body.name, school: body.school, grade: body.grade, phone, phone_last8: phone.slice(-8), parent_phone: digits(body.parentPhone), status: body.status, active: body.status !== "퇴원", memo: body.memo ?? "", joined_at: body.joinedAt }).eq("id", body.id).select().single(); return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ student: output(data) }); }

export async function DELETE(request: Request) { if (!await adminOnly()) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 }); const id = new URL(request.url).searchParams.get("id"); const supabase = createClient(); const { data: student } = await supabase.from("students").select("auth_user_id").eq("id", id).maybeSingle(); const { error } = await supabase.from("students").delete().eq("id", id); if (!error && student?.auth_user_id) await supabase.auth.admin.deleteUser(student.auth_user_id); return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ success: true }); }
