import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 모든 페이지와 API를 로그인 뒤로 숨깁니다.
 * 동시에 만료 직전의 access token을 갱신해 쿠키에 다시 심습니다.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser()는 매번 Supabase에 토큰을 검증시킵니다.
  // getSession()은 쿠키만 읽으므로 여기서는 쓰면 안 됩니다.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // 서비스 기본 주소는 통합 로그인 주소입니다.
  if (pathname === "/") {
    if (user?.user_metadata?.role === "student") {
      return NextResponse.redirect(new URL("/s", request.url));
    }
    return NextResponse.rewrite(new URL("/student-login", request.url));
  }

  if (pathname === "/s" && !user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname === "/s" && user?.user_metadata?.role !== "student") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const isPublicPath =
    pathname === "/login" ||
    pathname === "/student-login" ||
    pathname === "/parent-login" ||
    pathname === "/admin/login" ||
    pathname.startsWith("/auth/") ||
    // Vercel Cron 호출에는 로그인 쿠키가 없습니다.
    // 이 경로를 열어두지 않으면 프록시가 401을 돌려줘서 AI 생성 작업이 영원히 실행되지 않습니다.
    // 실제 인증은 라우트 안에서 CRON_SECRET(Authorization: Bearer ...)로 합니다.
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/health";

  if (!user && !isPublicPath) {
    // API는 리다이렉트 대신 401을 돌려줘야 fetch 쪽에서 처리할 수 있습니다.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }
    const isAdminPath =
      pathname.startsWith("/admin") ||
      pathname.startsWith("/problem-bank") ||
      pathname.startsWith("/pdf-mapper");
    const loginUrl = new URL(isAdminPath ? "/admin/login" : pathname.startsWith("/p") ? "/parent-login" : "/student-login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/login" || pathname === "/admin/login" || pathname === "/parent-login")) {
    const role = user.user_metadata?.role;
    if (pathname === "/parent-login" && role === "parent") return NextResponse.redirect(new URL("/p", request.url));
    if (pathname === "/admin/login") return NextResponse.redirect(new URL(role === "student" ? "/" : role === "parent" ? "/p" : "/admin", request.url));
  }

  if (user?.user_metadata?.role === "student" && pathname === "/student-login") {
    return NextResponse.redirect(new URL("/s", request.url));
  }

  // SOS280: 관리자 전용 API 경로.
  // 예전에는 화면 경로(/admin, /problem-bank)만 막아서, /api/problem-bank/catalog 같은
  // 주소를 학생이 직접 열면 문제은행 전체가 정답까지 그대로 나갔다.
  const isAdminApi =
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/problem-bank/") ||
    pathname.startsWith("/api/analysis/") ||
    pathname.startsWith("/api/pdf-mapper/");

  const role = user?.user_metadata?.role;
  if (isAdminApi && role !== "admin") {
    return NextResponse.json(
      { success: false, message: "관리자 권한이 필요합니다." },
      { status: 403 }
    );
  }

  if (role === "student" && (pathname.startsWith("/admin") || pathname.startsWith("/problem-bank") || pathname.startsWith("/pdf-mapper"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (user?.user_metadata?.role === "parent" && pathname !== "/p" && !pathname.startsWith("/parent-login") && !pathname.startsWith("/auth/")) {
    return NextResponse.redirect(new URL("/p", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 정적 자원을 제외한 모든 경로에 적용합니다.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
