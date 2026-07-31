import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
type ResetStage = "recognition" | "crop" | "analysis";

function cropOnlyReview(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const key of ["crop_engine_version", "crop_manual", "crop_saved_at"]) {
    if (key in source) kept[key] = source[key];
  }
  return kept;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const { stage } = await request.json() as { stage?: ResetStage };
    if (!stage || !["recognition", "crop", "analysis"].includes(stage)) {
      return NextResponse.json({ success: false, message: "초기화 단계가 올바르지 않습니다." }, { status: 400 });
    }

    const supabase = createClient();
    const found = await supabase
      .from("analysis_questions")
      .select("id,status,question_image_path,review_result")
      .eq("analysis_id", id);
    if (found.error) throw found.error;

    const editable = (found.data ?? []).filter((row) => {
      const review = row.review_result && typeof row.review_result === "object"
        ? row.review_result as Record<string, unknown>
        : {};
      return row.status !== "REGISTERED" && review.bank_status !== "REGISTERED";
    });
    const imagePaths = editable
      .map((row) => row.question_image_path)
      .filter((path): path is string => typeof path === "string" && path.length > 0);

    if (stage === "recognition") {
      if (imagePaths.length) await supabase.storage.from("question-images").remove(imagePaths);
      const ids = editable.map((row) => row.id);
      if (ids.length) {
        const deleted = await supabase.from("analysis_questions").delete().in("id", ids);
        if (deleted.error) throw deleted.error;
      }
    } else if (stage === "crop") {
      if (imagePaths.length) await supabase.storage.from("question-images").remove(imagePaths);
      for (const row of editable) {
        const updated = await supabase.from("analysis_questions").update({
          question_image_path: null,
          crop_x: null,
          crop_y: null,
          crop_width: null,
          crop_height: null,
          answer: null,
          confidence: null,
          review_result: {},
          review_reason: null,
          status: "WAITING",
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (updated.error) throw updated.error;
      }
    } else {
      for (const row of editable) {
        const updated = await supabase.from("analysis_questions").update({
          answer: null,
          confidence: null,
          review_result: cropOnlyReview(row.review_result),
          review_reason: null,
          status: "WAITING",
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (updated.error) throw updated.error;
      }
    }

    const currentStep = stage === "recognition"
      ? "1단계 · AI 문제인식 대기"
      : stage === "crop"
        ? "2단계 · AI 자르기 대기"
        : "3단계 · AI 문항분석 대기";
    const analysisPatch = await supabase.from("source_analysis").update({
      current_step: currentStep,
      status: "WAITING",
      progress: 0,
      total_questions: stage === "recognition" ? 0 : editable.length,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (analysisPatch.error) throw analysisPatch.error;

    return NextResponse.json({
      success: true,
      resetCount: editable.length,
      preservedRegisteredCount: (found.data ?? []).length - editable.length,
    });
  } catch (error) {
    const detail = error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : detail || "전체 취소에 실패했습니다.",
    }, { status: 500 });
  }
}
