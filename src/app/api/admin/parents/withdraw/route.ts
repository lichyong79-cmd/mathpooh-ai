import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/supabase/auth";

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/**
 * SOS325 · 학부모 탈퇴
 *
 * 학부모 계정만 삭제하고 **학생과 학습기록은 그대로 둔다.**
 * 재등록하거나 나중에 성적 추이를 확인해야 할 수 있고,
 * 학습기록은 학생의 것이지 학부모의 것이 아니기 때문이다.
 *
 * 처리 순서
 *   1) 연결된 자녀의 parent_phone 을 비워 연결을 끊는다
 *   2) 학부모 인증 계정을 삭제한다
 *
 * 순서가 중요하다. 계정을 먼저 지우면 어떤 자녀가 연결돼 있었는지 알 수 없다.
 */
export async function POST(request: Request) {
  if (!(await getAdminUser()))
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 403 });

  const body = await request.json().catch(() => ({} as any));
  const phone = digits(body.phone);
  if (phone.length < 10)
    return NextResponse.json({ message: "학부모 전화번호를 확인해 주세요." }, { status: 400 });

  const supabase = createClient();

  try {
    // 1) 연결된 자녀 확인 후 연결 해제 (학생 레코드는 유지)
    const children = await supabase
      .from("students")
      .select("id,name")
      .eq("parent_phone", phone);
    if (children.error) throw children.error;

    const names = (children.data ?? []).map((c: any) => String(c.name ?? "")).filter(Boolean);
    if (children.data?.length) {
      const unlink = await supabase
        .from("students")
        .update({ parent_phone: null })
        .eq("parent_phone", phone);
      if (unlink.error) throw unlink.error;
    }

    // 2) 학부모 인증 계정 삭제
    const email = `${phone}@parent.matspu.local`;
    let deleted = false;
    let page = 1;
    while (page <= 20 && !deleted) {
      const list = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (list.error) throw list.error;
      const target = (list.data?.users ?? []).find(
        (u: any) =>
          String(u.email ?? "").toLowerCase() === email ||
          digits(u.user_metadata?.parent_phone) === phone,
      );
      if (target) {
        const removed = await supabase.auth.admin.deleteUser(target.id);
        if (removed.error) throw removed.error;
        deleted = true;
        break;
      }
      if ((list.data?.users ?? []).length < 200) break;
      page += 1;
    }

    return NextResponse.json({
      success: true,
      accountDeleted: deleted,
      unlinked: children.data?.length ?? 0,
      children: names,
      message: deleted
        ? `학부모 계정을 삭제했습니다. 자녀 ${names.length}명의 학습기록은 그대로 유지됩니다.`
        : `연결만 해제했습니다. 해당 전화번호의 학부모 계정을 찾지 못했습니다.`,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "학부모 탈퇴 처리에 실패했습니다." },
      { status: 400 },
    );
  }
}
