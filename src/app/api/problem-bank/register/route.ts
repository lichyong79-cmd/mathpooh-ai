import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registerQuestions } from "@/lib/problem-bank";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { analysisId, questionIds } = await request.json() as { analysisId?: string; questionIds?: string[] };
    if (!analysisId) {
      return NextResponse.json({ success: false, message: "분석 ID가 없습니다." }, { status: 400 });
    }

    const supabase = createClient();
    const analysisQuery = await supabase
      .from("source_analysis")
      .select("*")
      .eq("id", analysisId)
      .single();
    if (analysisQuery.error || !analysisQuery.data) {
      throw analysisQuery.error ?? new Error("분석 정보를 찾을 수 없습니다.");
    }

    const sourceQuery = await supabase
      .from("source_files")
      .select("*")
      .eq("id", analysisQuery.data.source_file_id)
      .single();
    if (sourceQuery.error || !sourceQuery.data) {
      throw sourceQuery.error ?? new Error("원본 시험지를 찾을 수 없습니다.");
    }

    const questionQuery = await supabase
      .from("analysis_questions")
      .select("id,question_no,answer,status,confidence,ai_result,review_result,page_no,crop_x,crop_y,crop_width,crop_height,question_image_path")
      .eq("analysis_id", analysisId)
      .order("question_no");
    if (questionQuery.error) throw questionQuery.error;

    const questions = questionQuery.data ?? [];
    const requestedIds = Array.isArray(questionIds) && questionIds.length > 0 ? new Set(questionIds) : null;
    const registerable = questions.filter((item) =>
      (item.status === "APPROVED" || item.status === "AUTO_REGISTERED") &&
      (!requestedIds || requestedIds.has(item.id))
    );
    if (registerable.length === 0) {
      return NextResponse.json({ success: false, message: "등록할 문항이 없습니다." }, { status: 400 });
    }

    const result = await registerQuestions(supabase, sourceQuery.data, registerable);
    const now = new Date().toISOString();

    // analysis_questions.status는 AI 분석/검토 상태만 관리한다.
    // DB check constraint에 REGISTERED가 없으므로 등록 여부는 review_result 안의
    // bank_status / bank_registered_at으로 별도 기록한다.
    // analysis_question_id 기반 upsert이므로 같은 작업을 다시 실행해도 중복 등록되지 않는다.
    const registrationUpdates = await Promise.all(
      registerable.map(async (item) => {
        const nextReviewResult = {
          ...(item.review_result ?? {}),
          bank_status: "REGISTERED",
          bank_registered_at: now,
        };
        return supabase
          .from("analysis_questions")
          .update({
            review_result: nextReviewResult,
            review_reason: null,
            updated_at: now,
          })
          .eq("id", item.id);
      }),
    );
    const registrationUpdateError = registrationUpdates.find((item) => item.error)?.error;
    if (registrationUpdateError) throw registrationUpdateError;
    const analysisUpdate = await supabase
      .from("source_analysis")
      .update({
        status: "DONE",
        progress: 100,
        current_step: "문제은행 등록 완료",
        finished_at: now,
        updated_at: now,
      })
      .eq("id", analysisId);
    if (analysisUpdate.error) throw analysisUpdate.error;

    return NextResponse.json({
      success: true,
      registered: result.registered,
      embedded: result.embedded,
      message: `${result.registered}개 문항을 문제은행에 등록했습니다.`,
    });
  } catch (error: any) {
    console.error("[problem-bank/register]", error);
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "문제은행 등록에 실패했습니다.",
        code: error?.code || null,
        details: error?.details || null,
        hint: error?.hint || null,
      },
      { status: 500 },
    );
  }
}
