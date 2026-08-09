import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body?.problemIds)
      ? body.problemIds.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)
      : [];

    if (!ids.length) {
      return NextResponse.json({ success: false, message: "problemIds가 필요합니다." }, { status: 400 });
    }

    const targetIds = ids.slice(0, 20); // 한 번에 과도하게 호출하지 않도록 제한
    const origin = new URL(request.url).origin;
    const results: any[] = [];

    for (const problemId of targetIds) {
      const response = await fetch(`${origin}/api/problem-bank/regrade-difficulty`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ problemId }),
        cache: "no-store",
      });

      const raw = await response.text();
      let result: any = {};
      try {
        result = raw ? JSON.parse(raw) : {};
      } catch {
        result = { success: false, message: raw || `HTTP ${response.status}` };
      }
      results.push({ problemId, ok: response.ok && result?.success, ...result });
    }

    return NextResponse.json({
      success: true,
      requested: ids.length,
      processed: targetIds.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "일괄 난이도 재판정 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
