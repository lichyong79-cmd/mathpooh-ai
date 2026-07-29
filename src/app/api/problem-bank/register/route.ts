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
    const { analysisId } = await request.json() as { analysisId?: string };
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
    const registerable = questions.filter((item) =>
      item.status === "APPROVED" || item.status === "AUTO_REGISTERED"
    );
    if (registerable.length === 0) {
      return NextResponse.json({ success: false, message: "등록할 문항이 없습니다." }, { status: 400 });
    }

    const result = await registerQuestions(supabase, sourceQuery.data, registerable);
    const now = new Date().toISOString();

    // 실제 문제은행 등록이 끝난 문항만 REGISTERED로 확정한다.
    // analysis_question_id 기반 upsert이므로 같은 작업을 다시 실행해도 중복 등록되지 않는다.
    const registeredIds = registerable.map((item) => item.id);
    if (registeredIds.length > 0) {
      const registeredUpdate = await supabase
        .from("analysis_questions")
        .update({ status: "REGISTERED", review_reason: null, updated_at: now })
        .in("id", registeredIds);
      if (registeredUpdate.error) throw registeredUpdate.error;
    }
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
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "문제은행 등록에 실패했습니다." },
      { status: 500 },
    );
  }
}
