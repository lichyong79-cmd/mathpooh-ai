import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processObjectiveCropAuditBatch } from "@/lib/objective-crop-audit";
import { processObjectiveCropRecoveryBatch } from "@/lib/objective-crop-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 호환용 유지 경로.
 * 과거 난이도 재판정 cron 경로를 외부 스케줄러가 호출하고 있을 수 있어 URL은 유지한다.
 * 현재는 난이도 작업을 전혀 하지 않고 문항 crop 품질 복구만 수행한다.
 */
async function run(request: Request) {
  const expected = String(process.env.CRON_SECRET ?? "").trim();
  if (!expected) {
    return NextResponse.json({ success: false, message: "CRON_SECRET 환경변수가 설정되지 않았습니다." }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ success: false, message: "cron unauthorized" }, { status: 401 });
  }

  after(async () => {
    try { await processObjectiveCropRecoveryBatch(createClient(), 20); } catch {}
    try { await processObjectiveCropAuditBatch(createClient(), 64); } catch {}
  });

  return NextResponse.json({
    success: true,
    accepted: true,
    message: "문항 crop 품질 복구 작업만 실행합니다. 난이도 재판정은 제거되었습니다.",
  }, { status: 202 });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
