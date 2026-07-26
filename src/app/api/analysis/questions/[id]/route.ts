import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as {
      question_type?: string;
      subject?: string;
      unit?: string;
      topic?: string;
      difficulty?: string;
      answer?: string;
      summary?: string;
      status?: string;
    };

    const reviewResult = {
      question_type: body.question_type || "unknown",
      subject: body.subject?.trim() || null,
      unit: body.unit?.trim() || null,
      topic: body.topic?.trim() || null,
      difficulty: body.difficulty || "중",
      summary: body.summary?.trim() || null,
    };

    const supabase = createClient();
    const result = await supabase
      .from("analysis_questions")
      .update({
        answer: body.answer?.trim() || null,
        status: ["WAITING", "RUNNING", "REVIEW", "APPROVED", "FAILED"].includes(body.status || "") ? body.status : "REVIEW",
        review_result: reviewResult,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (result.error) throw result.error;
    return NextResponse.json({ success: true, question: result.data });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "문항 검수 저장에 실패했습니다." },
      { status: 500 },
    );
  }
}
