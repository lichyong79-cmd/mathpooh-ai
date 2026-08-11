import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { summarizeWorkflow } from "@/lib/problem-bank-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (analysis.error) throw analysis.error;

    if (!analysis.data?.id) {
      return NextResponse.json(
        { success: true, ...summarizeWorkflow([]) },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    const questions: any[] = [];
    for (let from = 0; ; from += 1000) {
      const result = await supabase
        .from("analysis_questions")
        .select("id,status,review_result")
        .eq("analysis_id", analysis.data.id)
        .order("question_no", { ascending: true })
        .range(from, from + 999);

      if (result.error) throw result.error;
      const page = result.data ?? [];
      questions.push(...page);
      if (page.length < 1000) break;
    }

    return NextResponse.json(
      { success: true, ...summarizeWorkflow(questions) },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "상태 조회 실패" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
