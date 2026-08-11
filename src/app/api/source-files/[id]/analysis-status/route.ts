import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { countSourceWorkflow, emptySourceWorkflowCounts, summarizeSourceWorkflow } from "@/lib/source-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// v164: 목록 API와 완전히 같은 기준을 쓰도록 공용 계산기만 호출한다.
export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const supabase = createClient();
    const analysis = await supabase.from("source_analysis").select("id").eq("source_file_id", id).maybeSingle();
    if (analysis.error) throw analysis.error;
    if (!analysis.data?.id) {
      return NextResponse.json({ success: true, ...summarizeSourceWorkflow(emptySourceWorkflowCounts()) });
    }

    const [questionsResult, bankResult] = await Promise.all([
      supabase.from("analysis_questions").select("id,status").eq("analysis_id", analysis.data.id),
      supabase.from("problem_bank_questions").select("analysis_question_id").eq("source_file_id", id),
    ]);
    if (questionsResult.error) throw questionsResult.error;
    if (bankResult.error) throw bankResult.error;

    const registeredIds = new Set((bankResult.data ?? []).map((row) => String(row.analysis_question_id ?? "")).filter(Boolean));
    const anonymousRegistered = (bankResult.data ?? []).filter((row) => !row.analysis_question_id).length;
    const counts = countSourceWorkflow(
      (questionsResult.data ?? []).map((q) => ({ status: q.status, bankRegistered: registeredIds.has(String(q.id)) })),
      anonymousRegistered,
    );

    return NextResponse.json({ success: true, ...summarizeSourceWorkflow(counts) });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "상태 조회 실패" }, { status: 500 });
  }
}
