"use client";

import { createClient } from "@/lib/supabase/client";
import { supabaseKey } from "@/lib/supabase";

/**
 * Supabase REST / Storage를 fetch로 직접 호출할 때 쓰는 헤더입니다.
 *
 * 예전에는 Authorization에도 anon 키를 넣었습니다. RLS를 잠근 뒤에는
 * 로그인 사용자의 access token을 넣어야 통과합니다.
 * apikey 헤더는 프로젝트 식별용이라 anon 키를 그대로 씁니다.
 *
 *   headers: await authHeaders()
 *   headers: await authHeaders({ "Content-Type": "application/json" })
 */
export async function authHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    if (typeof window !== "undefined") {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");
  }

  return { apikey: supabaseKey, Authorization: `Bearer ${token}`, ...extra };
}

/**
 * 비공개 버킷의 파일을 볼 수 있는 임시 서명 URL을 만듭니다.
 *
 * 예전에는 `/storage/v1/object/public/...` 주소를 그대로 썼습니다.
 * 버킷을 비공개로 바꾼 뒤에는 이 함수를 통해서만 접근할 수 있습니다.
 * 서명 URL은 기본 1시간 뒤 만료됩니다.
 */
export async function signedStorageUrl(
  bucket: string,
  path?: string | null,
  expiresInSeconds = 60 * 60
): Promise<string> {
  if (!path) return "";
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(`파일 주소를 만들지 못했습니다: ${error.message}`);
  return data.signedUrl;
}
