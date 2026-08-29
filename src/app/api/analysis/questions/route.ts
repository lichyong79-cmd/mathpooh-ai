import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const body = await request.json() as { analysisId?: string; questionNo?: number; pageNo?: number; x?: number; y?: number; width?: number; height?: number };
    if (!body.analysisId) return NextResponse.json({ success: false, message: "분석 ID가 없습니다." }, { status: 400 });
    const supabase = createClient();
    const row = {
      analysis_id: body.analysisId,
      question_no: Math.max(1, Number(body.questionNo ?? 1)),
      page_no: Math.max(1, Number(body.pageNo ?? 1)),
      crop_x: Number(body.x ?? 5), crop_y: Number(body.y ?? 5), crop_width: Number(body.width ?? 40), crop_height: Number(body.height ?? 20),
      // 1단계에서는 문항 존재와 위치만 저장한다. REVIEW/분석값은 3단계에서 결정한다.
      answer: null, status: "WAITING", confidence: 1,
      ai_result: {}, review_result: {},
    };
    const result = await supabase.from("analysis_questions").insert(row).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ success: true, question: result.data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "문항 추가에 실패했습니다." }, { status: 500 });
  }
}
