import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clearBankRegistration(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const next = { ...(value as Record<string, unknown>) };
  delete next.bank_status;
  delete next.bank_registered_at;
  delete next.duplicate_status;
  delete next.duplicate_of;
  delete next.duplicate_title;
  delete next.duplicate_checked_at;
  return next;
}

export async function POST(request: NextRequest) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const body = await request.json() as {
      sourceFileId?: string;
      confirmation?: string;
    };

    const sourceFileId = String(body.sourceFileId ?? "").trim();
    if (!sourceFileId) {
      return NextResponse.json(
        { success: false, message: "시험지 ID가 없습니다." },
        { status: 400 },
      );
    }

    const supabase = createClient();

    const source = await supabase
      .from("source_files")
      .select("id,title")
      .eq("id", sourceFileId)
      .single();

    if (source.error || !source.data) {
      throw source.error ?? new Error("시험지 정보를 찾지 못했습니다.");
    }

    if (String(body.confirmation ?? "").trim() !== String(source.data.title ?? "").trim()) {
      return NextResponse.json(
        {
          success: false,
          message: `확인 문구가 다릅니다. 시험지명을 정확히 입력해 주세요: ${source.data.title}`,
        },
        { status: 400 },
      );
    }

    const analysis = await supabase
      .from("source_analysis")
      .select("id")
      .eq("source_file_id", sourceFileId)
      .maybeSingle();

    if (analysis.error) throw analysis.error;
    if (!analysis.data?.id) {
      return NextResponse.json(
        { success: false, message: "분석 정보를 찾지 못했습니다." },
        { status: 404 },
      );
    }

    // 실제 문제은행에 등록된 이 시험지 문항만 찾는다.
    const bankRows = await supabase
      .from("problem_bank_questions")
      .select("id,analysis_question_id,question_no")
      .eq("source_file_id", sourceFileId);

    if (bankRows.error) throw bankRows.error;

    const rows = bankRows.data ?? [];
    if (!rows.length) {
      return NextResponse.json({
        success: true,
        reverted: 0,
        message: "이 시험지에는 문제은행 등록완료 문항이 없습니다.",
      });
    }

    const analysisQuestionIds = rows
      .map((row) => String(row.analysis_question_id ?? "").trim())
      .filter(Boolean);

    // 분석 문항의 AI/해설/Crop/DNA는 유지하고 등록 플래그만 해제한다.
    if (analysisQuestionIds.length) {
      const linked = await supabase
        .from("analysis_questions")
        .select("id,review_result")
        .in("id", analysisQuestionIds);

      if (linked.error) throw linked.error;

      for (const item of linked.data ?? []) {
        const updated = await supabase
          .from("analysis_questions")
          .update({
            status: "APPROVED",
            review_result: clearBankRegistration(item.review_result),
            review_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        if (updated.error) throw updated.error;
      }
    }

    // 문제은행 복사본만 제거한다. analysis_questions 및 이미지/AI 결과는 건드리지 않는다.
    const deleted = await supabase
      .from("problem_bank_questions")
      .delete()
      .eq("source_file_id", sourceFileId);

    if (deleted.error) throw deleted.error;

    // 시험지 분석 상태는 3단계 등록대기로 유지한다.
    const analysisUpdate = await supabase
      .from("source_analysis")
      .update({
        status: "DONE",
        progress: 100,
        current_step: "3단계 · AI 문항분석 완료 · 등록대기",
        updated_at: new Date().toISOString(),
      })
      .eq("id", analysis.data.id);

    if (analysisUpdate.error) throw analysisUpdate.error;

    return NextResponse.json({
      success: true,
      reverted: rows.length,
      message: `${rows.length}문항을 문제은행 등록완료에서 등록대기로 되돌렸습니다. 자르기·해설·DNA·난이도는 그대로 보존했습니다.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "등록대기 되돌리기에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
