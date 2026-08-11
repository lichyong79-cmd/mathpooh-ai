import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const supabase = createClient();

    const analysis = await supabase
      .from("source_analysis")
      .select("id")
      .eq("source_file_id", id)
      .maybeSingle();

    if (analysis.error) throw analysis.error;
    if (!analysis.data?.id) {
      return NextResponse.json({
        success: true,
        total: 0, registered: 0, pending: 0, review: 0, failed: 0, label: "미분석",
      });
    }

    const q = await supabase
      .from("analysis_questions")
      .select("status,review_result")
      .eq("analysis_id", analysis.data.id);

    if (q.error) throw q.error;

    let registered = 0, pending = 0, review = 0, failed = 0;
    for (const row of q.data ?? []) {
      const bankStatus = String((row.review_result as any)?.bank_status ?? "");
      if (bankStatus === "REGISTERED") registered++;
      else if (row.status === "REVIEW") review++;
      else if (row.status === "FAILED" || row.status === "REJECTED") failed++;
      else if (row.status === "APPROVED" || row.status === "AUTO_REGISTERED") pending++;
    }

    const total = q.data?.length ?? 0;
    const label =
      total > 0 && registered === total ? "등록완료" :
      review > 0 ? `검토보류 ${review}` :
      pending > 0 ? `등록대기 ${pending}` :
      total > 0 ? "분석중" : "미분석";

    return NextResponse.json({ success: true, total, registered, pending, review, failed, label });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "분석 상태 조회 실패" },
      { status: 500 },
    );
  }
}
