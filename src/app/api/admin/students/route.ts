import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { ensureParentAccount } from "@/lib/parent-account";

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
// SOS280: 거부목록("student가 아니면 통과")이라 학부모·역할 미지정 계정까지 통과했다. 허용목록으로 바꾼다.
async function adminOnly() { return await getAdminUser(); }
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
  let parentWarning="";try{await ensureParentAccount(supabase,body.parentPhone);}catch(e){parentWarning=e instanceof Error?e.message:"학부모 계정 생성 실패";}
  return NextResponse.json({ student: output(linked), loginId: phone, temporaryPassword: phone.slice(-4), parentAccountCreated:!parentWarning, parentWarning });
}

export async function PATCH(request: Request) {
  if (!await adminOnly()) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });

  const body = await request.json();
  const supabase = createClient();
  const phone = digits(body.phone);
  if (phone.length < 10) return NextResponse.json({ message: "학생 전화번호를 정확히 입력해 주세요." }, { status: 400 });

  const { data: current, error: currentError } = await supabase
    .from("students")
    .select("id,name,phone,phone_last8,auth_user_id,password_changed")
    .eq("id", body.id)
    .maybeSingle();
  if (currentError || !current) return NextResponse.json({ message: "학생 정보를 찾지 못했습니다." }, { status: 404 });

  const oldPhone = digits(current.phone || current.phone_last8);
  const phoneChanged = oldPhone !== phone;
  const email = `${phone}@student.matspu.local`;
  let authUserId = current.auth_user_id as string | null;

  // 전화번호가 바뀌면 학생 로그인 아이디(Auth 이메일)도 반드시 함께 변경한다.
  if (authUserId) {
    const authUpdate = await supabase.auth.admin.updateUserById(authUserId, {
      ...(phoneChanged ? { email, email_confirm: true } : {}),
      user_metadata: { role: "student", student_id: current.id, name: String(body.name ?? current.name ?? "") },
    });
    if (authUpdate.error) {
      const duplicate = /already|registered|duplicate|exists/i.test(authUpdate.error.message);
      return NextResponse.json({
        message: duplicate
          ? "변경하려는 전화번호로 이미 생성된 로그인 계정이 있습니다. 중복 학생 계정을 확인해 주세요."
          : `로그인 계정 수정 실패: ${authUpdate.error.message}`,
      }, { status: 400 });
    }
  } else {
    const temporaryPassword = phone.slice(-4);
    const created = await supabase.auth.admin.createUser({
      email,
      password: `Mp!${temporaryPassword}`,
      email_confirm: true,
      user_metadata: { role: "student", student_id: current.id, name: String(body.name ?? current.name ?? "") },
    });
    if (created.error || !created.data.user) {
      return NextResponse.json({ message: created.error?.message || "학생 로그인 계정을 만들지 못했습니다." }, { status: 400 });
    }
    authUserId = created.data.user.id;
  }

  const { data, error } = await supabase.from("students").update({
    name: body.name,
    school: body.school,
    grade: body.grade,
    phone,
    phone_last8: phone.slice(-8),
    parent_phone: digits(body.parentPhone),
    status: body.status,
    active: body.status !== "퇴원",
    memo: body.memo ?? "",
    joined_at: body.joinedAt,
    auth_user_id: authUserId,
  }).eq("id", body.id).select().single();

  if (error) {
    // DB 반영에 실패한 경우, 바뀐 Auth 아이디를 기존 값으로 최대한 되돌린다.
    if (phoneChanged && authUserId && oldPhone.length >= 10) {
      await supabase.auth.admin.updateUserById(authUserId, { email: `${oldPhone}@student.matspu.local`, email_confirm: true });
    }
    const duplicate = /students_phone_last8_key|duplicate key/i.test(error.message);
    return NextResponse.json({
      message: duplicate ? "이미 등록된 학생 전화번호입니다." : error.message,
    }, { status: 400 });
  }

  let parentWarning="";try{await ensureParentAccount(supabase,body.parentPhone);}catch(e){parentWarning=e instanceof Error?e.message:"학부모 계정 생성 실패";}
  return NextResponse.json({
    student: output(data),
    loginId: phone,
    loginIdChanged: phoneChanged,
    parentAccountCreated:!parentWarning,
    parentWarning,
  });
}

export async function DELETE(request: Request) { if (!await adminOnly()) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 }); const id = new URL(request.url).searchParams.get("id"); const supabase = createClient(); const { data: student } = await supabase.from("students").select("auth_user_id").eq("id", id).maybeSingle(); const { error } = await supabase.from("students").delete().eq("id", id); if (!error && student?.auth_user_id) await supabase.auth.admin.deleteUser(student.auth_user_id); return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ success: true }); }
