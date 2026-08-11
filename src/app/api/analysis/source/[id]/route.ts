import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const supabase = createClient();
    const source = await supabase.from("source_files").select("*").eq("id", id).single();
    if (source.error || !source.data) throw source.error ?? new Error("시험지를 찾을 수 없습니다.");
    const analysis = await supabase.from("source_analysis").select("*").eq("source_file_id", id).maybeSingle();
    if (analysis.error) throw analysis.error;
    let questions: unknown[] = [];
    if (analysis.data) {
      const query = await supabase.from("analysis_questions").select("*").eq("analysis_id", analysis.data.id).order("question_no");
      if (query.error) throw query.error;
      questions = query.data ?? [];
    }

    // v164: "문제은행 등록완료"의 기준을 서버 한 곳으로 통일한다.
    // 화면이 review_result.bank_status만 보고 판단하면 상태 표시가 목록과 어긋난다.
    const bank = await supabase
      .from("problem_bank_questions")
      .select("analysis_question_id,question_no")
      .eq("source_file_id", id);
    if (bank.error) throw bank.error;
    const registeredQuestionIds = [...new Set(
      (bank.data ?? []).map((row) => String(row.analysis_question_id ?? "").trim()).filter(Boolean),
    )];
    const registeredQuestionNos = [...new Set(
      (bank.data ?? []).map((row:any) => Number(row.question_no)).filter(Number.isFinite),
    )];

    const sign = async (path: string | null) => {
      if (!path) return null;
      const result = await supabase.storage.from("exam-pdf").createSignedUrl(path, 3600);
      if (result.error) throw result.error;
      return result.data.signedUrl;
    };
    return NextResponse.json({
      success: true,
      source: source.data,
      analysis: analysis.data,
      questions,
      registeredQuestionIds,
      registeredQuestionNos,
      examUrl: await sign(source.data.exam_pdf_path),
      solutionUrl: await sign(source.data.solution_pdf_path),
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "작업장을 불러오지 못했습니다." }, { status: 500 });
  }
}
