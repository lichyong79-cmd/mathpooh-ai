import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (user.user_metadata?.role === "student") return NextResponse.json({ message: "관리자만 사용할 수 있습니다." }, { status: 403 });
  const { studentId } = await request.json();
  const supabase = createServerSupabase();
  const { data: student, error } = await supabase.from("students").select("id,name,phone,phone_last8,auth_user_id").eq("id", studentId).maybeSingle();
  if (error || !student) return NextResponse.json({ message: "학생 정보를 찾지 못했습니다. 실제 등록 학생에서 실행해 주세요." }, { status: 404 });
  const phone = digits(student.phone || student.phone_last8);
  if (phone.length < 8) return NextResponse.json({ message: "학생 전화번호를 먼저 정확히 입력해 주세요." }, { status: 400 });
  const loginId = phone;
  const temporaryPassword = phone.slice(-4);
  const authPassword = `Mp!${temporaryPassword}`;
  const email = `${phone}@student.matspu.local`;
  let authUserId = student.auth_user_id as string | null;
  if (authUserId) {
    const updated = await supabase.auth.admin.updateUserById(authUserId, { password: authPassword, user_metadata: { role: "student", student_id: student.id, name: student.name } });
    if (updated.error) return NextResponse.json({ message: updated.error.message }, { status: 400 });
  } else {
    const created = await supabase.auth.admin.createUser({ email, password: authPassword, email_confirm: true, user_metadata: { role: "student", student_id: student.id, name: student.name } });
    if (created.error || !created.data.user) return NextResponse.json({ message: created.error?.message || "학생 계정을 만들지 못했습니다." }, { status: 400 });
    authUserId = created.data.user.id;
  }
  await supabase.from("students").update({ auth_user_id: authUserId, password_changed: false, password_reset_at: new Date().toISOString(), phone: loginId }).eq("id", student.id);
  return NextResponse.json({ success: true, loginId, temporaryPassword });
}
