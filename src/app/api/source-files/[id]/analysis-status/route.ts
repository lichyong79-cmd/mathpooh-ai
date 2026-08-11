import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bankStatusOf(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return String((value as Record<string, unknown>).bank_status ?? "").trim();
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const supabase = createClient();

    const analysis = await supabase
      .from("source_analysis")
      .select("id,status,current_step")
      .eq("source_file_id", id)
      .maybeSingle();

    if (analysis.error) throw analysis.error;

    if (!analysis.data?.id) {
      return NextResponse.json({
        success: true,
        state: "UNANALYZED",
        label: "미분석",
        total: 0,
        registered: 0,
        pending: 0,
        review: 0,
        failed: 0,
      });
    }

    const questions = await supabase
      .from("analysis_questions")
      .select("status,review_result")
      .eq("analysis_id", analysis.data.id);

    if (questions.error) throw questions.error;

    let registered = 0, pending = 0, review = 0, failed = 0;

    for (const q of questions.data ?? []) {
      if (bankStatusOf(q.review_result) === "REGISTERED") registered++;
      else if (q.status === "REVIEW") review++;
      else if (q.status === "FAILED" || q.status === "REJECTED") failed++;
      else if (q.status === "APPROVED" || q.status === "AUTO_REGISTERED") pending++;
    }

    const total = questions.data?.length ?? 0;
    let state = "ANALYZING";
    let label = "분석중";

    if (total === 0) { state = "UNANALYZED"; label = "미분석"; }
    else if (registered === total) { state = "REGISTERED"; label = `문제은행 등록완료 ${registered}문항`; }
    else if (review > 0) { state = "REVIEW"; label = `3단계 분석 · 대기 ${pending} · 보류 ${review}`; }
    else if (pending > 0) { state = "PENDING"; label = `3단계 분석 · 등록대기 ${pending}`; }
    else if (failed > 0) { state = "FAILED"; label = `분석 실패 ${failed}`; }

    return NextResponse.json({
      success: true,
      state, label, total, registered, pending, review, failed,
      analysisStatus: analysis.data.status,
      currentStep: analysis.data.current_step,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "분석 상태 조회 실패" },
      { status: 500 },
    );
  }
}
