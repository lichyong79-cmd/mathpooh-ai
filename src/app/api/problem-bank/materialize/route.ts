import { NextRequest, NextResponse } from "next/server";
import { createCanvas } from "@napi-rs/canvas";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
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

export async function POST(request: NextRequest) {
  try {
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

    const questions = (questionResult.data ?? []) as CropQuestion[];
    const targets = questions.filter(validCrop);
    if (targets.length === 0) {
      return NextResponse.json({ success: false, message: "문항 영역 좌표가 없습니다." }, { status: 400 });
    }

    const signed = await supabase.storage.from("exam-pdf").createSignedUrl(source.data.exam_pdf_path, 60 * 15);
    if (signed.error) throw signed.error;
    const pdfResponse = await fetch(signed.data.signedUrl, { cache: "no-store" });
    if (!pdfResponse.ok) throw new Error("시험지 PDF를 불러오지 못했습니다.");
    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({ data: pdfBytes, disableWorker: true });
    const pdf = await loadingTask.promise;
    const byPage = new Map<number, CropQuestion[]>();
    for (const question of targets) {
      const pageNo = Number(question.page_no);
      byPage.set(pageNo, [...(byPage.get(pageNo) ?? []), question]);
    }

    let saved = 0;
    const errors: string[] = [];
    for (const [pageNo, pageQuestions] of byPage) {
      if (pageNo > pdf.numPages) {
        errors.push(`${pageNo}페이지 없음`);
        continue;
      }
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 2.2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      await page.render({ canvasContext: context as never, viewport }).promise;

      for (const question of pageQuestions) {
        try {
          const x = Math.max(0, Math.floor(canvas.width * Number(question.crop_x ?? 0) / 100));
          const y = Math.max(0, Math.floor(canvas.height * Number(question.crop_y ?? 0) / 100));
          const width = Math.min(canvas.width - x, Math.ceil(canvas.width * Number(question.crop_width) / 100));
          const height = Math.min(canvas.height - y, Math.ceil(canvas.height * Number(question.crop_height) / 100));
          if (width < 20 || height < 20) throw new Error("영역이 너무 작습니다.");

          const cropped = createCanvas(width, height);
          cropped.getContext("2d").drawImage(canvas, x, y, width, height, 0, 0, width, height);
          const buffer = cropped.toBuffer("image/webp", 88);
          const path = `${analysis.data.source_file_id}/${analysis.data.id}/${String(question.question_no).padStart(3, "0")}.webp`;
          const upload = await supabase.storage.from("question-images").upload(path, buffer, {
            contentType: "image/webp",
            upsert: true,
          });
          if (upload.error) throw upload.error;

          const now = new Date().toISOString();
          const updateAnalysis = await supabase.from("analysis_questions")
            .update({ question_image_path: path, updated_at: now })
            .eq("id", question.id);
          if (updateAnalysis.error) throw updateAnalysis.error;

          const updateBank = await supabase.from("problem_bank_questions")
            .update({
              page_no: question.page_no,
              crop_x: question.crop_x,
              crop_y: question.crop_y,
              crop_width: question.crop_width,
              crop_height: question.crop_height,
              question_image_path: path,
              updated_at: now,
            })
            .eq("analysis_question_id", question.id);
          if (updateBank.error) throw updateBank.error;
          saved += 1;
        } catch (error) {
          errors.push(`${question.question_no}번: ${error instanceof Error ? error.message : "저장 실패"}`);
        }
      }
    }

    return NextResponse.json({
      success: saved > 0,
      saved,
      failed: errors.length,
      errors,
      message: `${saved}개 문항을 개별 이미지로 저장했습니다.`,
    }, { status: saved > 0 ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "문항 분리에 실패했습니다.",
    }, { status: 500 });
  }
}
