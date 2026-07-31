import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const form = await request.formData();
    const image = form.get("image");
    const analysisId = String(form.get("analysisId") ?? "");
    const sourceFileId = String(form.get("sourceFileId") ?? "");
    const questionId = String(form.get("questionId") ?? "");
    const questionNo = Number(form.get("questionNo"));
    const pageNo = Number(form.get("pageNo"));
    if (!(image instanceof File) || !analysisId || !sourceFileId || !questionId || !Number.isFinite(questionNo) || pageNo < 1) {
      return NextResponse.json({ success: false, message: "공식 해설 이미지 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const supabase = createClient();
    const current = await supabase.from("analysis_questions").select("ai_result").eq("id", questionId).single();
    if (current.error || !current.data) throw current.error ?? new Error("문항을 찾을 수 없습니다.");

    const path = `solutions/${sourceFileId}/${analysisId}/${String(questionNo).padStart(3, "0")}.webp`;
    const stored = await supabase.storage.from("question-images").upload(path, Buffer.from(await image.arrayBuffer()), {
      contentType: "image/webp", upsert: true,
    });
    if (stored.error) throw stored.error;

    const aiResult = {
      ...(current.data.ai_result ?? {}),
      official_solution_image_path: path,
      official_solution_page_no: pageNo,
      official_solution_materialized_at: new Date().toISOString(),
    };
    const updated = await supabase.from("analysis_questions").update({ ai_result: aiResult, updated_at: new Date().toISOString() }).eq("id", questionId);
    if (updated.error) throw updated.error;

    return NextResponse.json({ success: true, path, questionNo, pageNo });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "공식 해설 이미지 저장에 실패했습니다." }, { status: 500 });
  }
}
