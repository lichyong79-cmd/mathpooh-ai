import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
const STATUSES = ["WAITING", "RUNNING", "REVIEW", "APPROVED", "AUTO_REGISTERED", "REJECTED", "FAILED"];

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const resultData = (body.review_result && typeof body.review_result === "object" ? body.review_result : {
      question_type: body.question_type || "unknown", subject: typeof body.subject === "string" ? body.subject.trim() || null : null,
      unit: typeof body.unit === "string" ? body.unit.trim() || null : null, topic: typeof body.topic === "string" ? body.topic.trim() || null : null,
      difficulty: body.difficulty || "중", summary: typeof body.summary === "string" ? body.summary.trim() || null : null,
    }) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("question_no" in body) patch.question_no = Math.max(1, Number(body.question_no));
    if ("page_no" in body) patch.page_no = Math.max(1, Number(body.page_no));
    for (const key of ["crop_x", "crop_y", "crop_width", "crop_height"] as const) if (key in body) patch[key] = Number(body[key]);
    if ("answer" in body) patch.answer = typeof body.answer === "string" ? body.answer.trim() || null : null;
    if ("status" in body && STATUSES.includes(String(body.status))) patch.status = body.status;
    if ("review_reason" in body) patch.review_reason = typeof body.review_reason === "string" ? body.review_reason.trim() || null : null;
    if (["review_result","question_type","subject","unit","topic","difficulty","summary"].some((key) => key in body)) patch.review_result = resultData;
    const supabase = createClient();
    const result = await supabase.from("analysis_questions").update(patch).eq("id", id).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ success: true, question: result.data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "문항 저장에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const supabase = createClient();
    const result = await supabase.from("analysis_questions").delete().eq("id", id);
    if (result.error) throw result.error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "문항 삭제에 실패했습니다." }, { status: 500 });
  }
}
