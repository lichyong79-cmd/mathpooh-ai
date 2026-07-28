"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * createBrowserClient는 제네릭 함수라서 `ReturnType<typeof createBrowserClient>`로
 * 타입을 잡으면 any로 무너집니다. 제네릭이 아닌 래퍼를 하나 두고
 * 그 반환 타입을 쓰면 타입이 정확히 잡힙니다.
 */
function makeBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

let client: ReturnType<typeof makeBrowserClient> | null = null;

/**
 * 브라우저 전용 Supabase 클라이언트입니다.
 * 세션을 쿠키에 저장하므로 proxy와 서버 라우트가 같은 세션을 읽습니다.
 */
export function createClient() {
  if (!client) client = makeBrowserClient();
  return client;
}
