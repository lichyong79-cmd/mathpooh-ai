import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트입니다. RLS를 우회하는 service role 키를 씁니다.
 *
 * 예전에는 service role 키가 없으면 조용히 anon 키로 내려갔습니다.
 * RLS를 잠근 뒤에는 그 폴백이 "권한 없음" 에러의 원인이 되므로,
 * 키가 없으면 바로 실패시켜 원인을 드러냅니다.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.");
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. " +
      "서버 라우트는 service role 키가 반드시 필요합니다. (.env.local / Vercel 환경변수 확인)"
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
