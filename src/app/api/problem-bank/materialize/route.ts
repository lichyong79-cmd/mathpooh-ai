import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type CropQuestion = {
  id: string;
  question_no: number;
  page_no: number | null;
  crop_x: number | null;
  crop_y: number | null;
  crop_width: number | null;
  crop_height: number | null;
};

function validCrop(question: CropQuestion) {
  return Number(question.page_no) >= 1
    && Number(question.crop_width) > 0
    && Number(question.crop_height) > 0;
}

async function prepare(request: NextRequest) {
  const body = await request.json() as { analysisId?: string; sourceFileId?: string };
  const supabase = createClient();
  let analysisQuery = supabase.from("source_analysis").select("id,source_file_id");
  if (body.analysisId) analysisQuery = analysisQuery.eq("id", body.analysisId);
  else if (body.sourceFileId) analysisQuery = analysisQuery.eq("source_file_id", body.sourceFileId);
  else return NextResponse.json({ success: false, message: "분석 또는 시험지 ID가 없습니다." }, { status: 400 });

  const analysis = await analysisQuery.single();
  if (analysis.error || !analysis.data) throw analysis.error ?? new Error("분석을 찾을 수 없습니다.");

  const source = await supabase
    .from("source_files")
    .select("id,exam_pdf_path")
    .eq("id", analysis.data.source_file_id)
    .single();
  if (source.error || !source.data?.exam_pdf_path) throw source.error ?? new Error("시험지 PDF가 없습니다.");

  const questionResult = await supabase
    .from("analysis_questions")
    .select("id,question_no,page_no,crop_x,crop_y,crop_width,crop_height")
    .eq("analysis_id", analysis.data.id)
    .order("question_no");
  if (questionResult.error) throw questionResult.error;

  const questions = ((questionResult.data ?? []) as CropQuestion[]).filter(validCrop);
  if (questions.length === 0) {
    return NextResponse.json({ success: false, message: "문항 영역 좌표가 없습니다." }, { status: 400 });
  }

  const signed = await supabase.storage.from("exam-pdf").createSignedUrl(source.data.exam_pdf_path, 60 * 30);
  if (signed.error) throw signed.error;

  return NextResponse.json({
    success: true,
    analysisId: analysis.data.id,
    sourceFileId: source.data.id,
    pdfUrl: signed.data.signedUrl,
    questions,
  });
}

async function upload(request: NextRequest) {
  const form = await request.formData();
  const image = form.get("image");
  const analysisId = String(form.get("analysisId") ?? "");
  const sourceFileId = String(form.get("sourceFileId") ?? "");
  const questionId = String(form.get("questionId") ?? "");
  const questionNo = Number(form.get("questionNo"));

  if (!(image instanceof File) || !analysisId || !sourceFileId || !questionId || !Number.isFinite(questionNo)) {
    return NextResponse.json({ success: false, message: "문항 이미지 업로드 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const supabase = createClient();
  const path = `${sourceFileId}/${analysisId}/${String(questionNo).padStart(3, "0")}.webp`;
  const bytes = Buffer.from(await image.arrayBuffer());
  const stored = await supabase.storage.from("question-images").upload(path, bytes, {
    contentType: "image/webp",
    upsert: true,
  });
  if (stored.error) throw stored.error;

  const now = new Date().toISOString();
  const updateAnalysis = await supabase
    .from("analysis_questions")
    .update({ question_image_path: path, updated_at: now })
    .eq("id", questionId);
  if (updateAnalysis.error) throw updateAnalysis.error;

  const updateBank = await supabase
    .from("problem_bank_questions")
    .update({ question_image_path: path, updated_at: now })
    .eq("analysis_question_id", questionId);
  if (updateBank.error) throw updateBank.error;

  return NextResponse.json({ success: true, path, questionNo });
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    return contentType.includes("multipart/form-data") ? await upload(request) : await prepare(request);
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "문항 이미지 처리에 실패했습니다.",
    }, { status: 500 });
  }
}
