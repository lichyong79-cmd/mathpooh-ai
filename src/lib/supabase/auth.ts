import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * 요청 쿠키에서 로그인 사용자를 확인합니다.
 * 미들웨어에서 이미 한 번 막지만, 서버 라우트는 service role 키로
 * RLS를 우회하므로 라우트 안에서도 반드시 다시 확인합니다.
 */
export async function getSessionUser() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          // 라우트 핸들러에서는 쿠키를 갱신하지 않습니다. 미들웨어가 담당합니다.
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export function unauthorized() {
  return NextResponse.json(
    { success: false, message: "로그인이 필요합니다." },
    { status: 401 }
  );
}

/**
 * 라우트 맨 앞에서 호출합니다.
 * 로그인 상태가 아니면 401 응답을 돌려주고, 맞으면 null을 돌려줍니다.
 *
 *   const denied = await requireUser();
 *   if (denied) return denied;
 */
export async function requireUser() {
  const user = await getSessionUser();
  return user ? null : unauthorized();
}

/**
 * SOS280 · 관리자 전용 가드 (허용목록 방식)
 *
 * 이전에는 "student가 아니면 통과"하는 거부목록이었다.
 * 그래서 학부모 계정이나 역할이 붙지 않은 계정까지 관리자로 통과했다.
 * 이제 role === "admin"만 통과시킨다.
 *
 *   const denied = await requireAdmin();
 *   if (denied) return denied;
 */
export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (String(user.user_metadata?.role ?? "") !== "admin") {
    return NextResponse.json(
      { success: false, message: "관리자 권한이 필요합니다." },
      { status: 403 }
    );
  }
  return null;
}

export async function getAdminUser() {
  const user = await getSessionUser();
  if (!user) return null;
  return String(user.user_metadata?.role ?? "") === "admin" ? user : null;
}
