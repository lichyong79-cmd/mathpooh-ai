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
    const manual = String(form.get("manual") ?? "") === "true";
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

    const previousAi = current.data.ai_result ?? {};
    const previousOfficial = previousAi.official_solution && typeof previousAi.official_solution === "object"
      ? previousAi.official_solution
      : {};
    const previousVerification = String(previousOfficial.verification ?? "");
    const staleMissing = previousVerification === "official_pdf_extract_required" || previousVerification === "official_pdf_missing";
    const aiResult = {
      ...previousAi,
      official_solution_image_path: path,
      official_solution_page_no: pageNo,
      official_solution_materialized_at: new Date().toISOString(),
      official_solution_manual_crop: manual,
      official_solution: {
        ...previousOfficial,
        connected: true,
        question_no: questionNo,
        ...(staleMissing ? {
          verification: manual ? "manual_crop_connected" : "official_pdf_image_connected",
          issues: [],
        } : {}),
      },
    };
    const updated = await supabase.from("analysis_questions").update({ ai_result: aiResult, updated_at: new Date().toISOString() }).eq("id", questionId);
    if (updated.error) throw updated.error;

    return NextResponse.json({ success: true, path, questionNo, pageNo });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "공식 해설 이미지 저장에 실패했습니다." }, { status: 500 });
  }
}
