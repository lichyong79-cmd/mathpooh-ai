import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registerQuestions } from "@/lib/problem-bank";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json() as {
      action?: "approve" | "reject";
      answer?: string;
      reviewResult?: Record<string, unknown>;
    };

    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json({ success: false, message: "처리 방식이 올바르지 않습니다." }, { status: 400 });
    }

    const supabase = createClient();
    const questionQuery = await supabase
      .from("analysis_questions")
      .select("id,analysis_id,question_no,answer,status,confidence,ai_result,review_result")
      .eq("id", id)
      .single();
    if (questionQuery.error || !questionQuery.data) {
      throw questionQuery.error ?? new Error("문항을 찾을 수 없습니다.");
    }

    const now = new Date().toISOString();
    if (body.action === "reject") {
      const rejected = await supabase
        .from("analysis_questions")
        .update({ status: "REJECTED", updated_at: now })
        .eq("id", id);
      if (rejected.error) throw rejected.error;
      return NextResponse.json({ success: true, status: "REJECTED" });
    }

    const analysisQuery = await supabase
      .from("source_analysis")
      .select("source_file_id")
      .eq("id", questionQuery.data.analysis_id)
      .single();
    if (analysisQuery.error || !analysisQuery.data) throw analysisQuery.error;

    const sourceQuery = await supabase
      .from("source_files")
      .select("*")
      .eq("id", analysisQuery.data.source_file_id)
      .single();
    if (sourceQuery.error || !sourceQuery.data) throw sourceQuery.error;

    const approvedQuestion = {
      ...questionQuery.data,
      answer: body.answer ?? questionQuery.data.answer,
      review_result: body.reviewResult ?? questionQuery.data.review_result,
    };

    await registerQuestions(supabase, sourceQuery.data, [approvedQuestion]);

    const approved = await supabase
      .from("analysis_questions")
      .update({
        answer: approvedQuestion.answer,
        review_result: approvedQuestion.review_result,
        status: "APPROVED",
        review_reason: null,
        updated_at: now,
      })
      .eq("id", id);
    if (approved.error) throw approved.error;

    return NextResponse.json({ success: true, status: "APPROVED" });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "문항 처리에 실패했습니다." },
      { status: 500 },
    );
  }
}
