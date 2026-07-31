import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

function withoutBankRegistration(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const next = { ...(value as Record<string, unknown>) };
  delete next.bank_status;
  delete next.bank_registered_at;
  return next;
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await request.json() as { scope?: "question" | "source"; confirmation?: string };
    const scope = body.scope === "source" ? "source" : "question";
    const supabase = createClient();

    const bank = await supabase.from("problem_bank_questions")
      .select("id,title,source_file_id,analysis_question_id,question_no")
      .eq("id", id).single();
    if (bank.error || !bank.data) {
      return NextResponse.json({ success: false, message: "삭제할 문제은행 문항을 찾지 못했습니다." }, { status: 404 });
    }

    const source = await supabase.from("source_files").select("id,title").eq("id", bank.data.source_file_id).single();
    if (source.error || !source.data) throw source.error ?? new Error("원본 시험지 정보를 찾지 못했습니다.");
    const expected = scope === "source" ? source.data.title : bank.data.title;
    if (String(body.confirmation ?? "").trim() !== expected) {
      return NextResponse.json({ success: false, message: `삭제 확인 문구가 다릅니다. 정확히 입력: ${expected}` }, { status: 400 });
    }

    const bankRowsQuery = scope === "source"
      ? await supabase.from("problem_bank_questions").select("id,analysis_question_id").eq("source_file_id", bank.data.source_file_id)
      : await supabase.from("problem_bank_questions").select("id,analysis_question_id").eq("id", id);
    if (bankRowsQuery.error) throw bankRowsQuery.error;
    const bankRows = bankRowsQuery.data ?? [];
    const analysisIds = bankRows.map((row) => row.analysis_question_id).filter(Boolean) as string[];

    // 먼저 연결된 분석 문항의 등록 잠금을 해제한다. 문제·Crop·공식 해설·DNA는 보존한다.
    if (analysisIds.length) {
      const linked = await supabase.from("analysis_questions").select("id,review_result").in("id", analysisIds);
      if (linked.error) throw linked.error;
      for (const row of linked.data ?? []) {
        const unlocked = await supabase.from("analysis_questions").update({
          review_result: withoutBankRegistration(row.review_result),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (unlocked.error) throw unlocked.error;
      }
    }

    const removed = scope === "source"
      ? await supabase.from("problem_bank_questions").delete().eq("source_file_id", bank.data.source_file_id)
      : await supabase.from("problem_bank_questions").delete().eq("id", id);
    if (removed.error) throw removed.error;

    const analysis = await supabase.from("source_analysis").select("id").eq("source_file_id", bank.data.source_file_id).maybeSingle();
    if (analysis.error) throw analysis.error;
    if (analysis.data?.id) {
      const returned = await supabase.from("source_analysis").update({
        current_step: "3단계 · AI 문항분석",
        status: "WAITING",
        updated_at: new Date().toISOString(),
      }).eq("id", analysis.data.id);
      if (returned.error) throw returned.error;
    }

    return NextResponse.json({
      success: true,
      scope,
      deletedCount: bankRows.length,
      sourceTitle: source.data.title,
      message: scope === "source"
        ? `${source.data.title}의 문제은행 ${bankRows.length}문항을 삭제하고 AI 분석 3단계로 돌려보냈습니다.`
        : `${bank.data.question_no}번을 문제은행에서 삭제하고 AI 분석 3단계로 돌려보냈습니다.`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "문제은행 삭제에 실패했습니다.",
    }, { status: 500 });
  }
}
