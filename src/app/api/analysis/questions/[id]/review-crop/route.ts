import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

type OpenAiPayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
};

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "verdict", "page_no", "crop_x", "crop_y", "crop_width", "crop_height",
    "missing_content", "foreign_content", "excessive_whitespace", "reason",
  ],
  properties: {
    verdict: { type: "string", enum: ["PASS", "ADJUST"] },
    page_no: { type: "integer", minimum: 1, maximum: 500 },
    crop_x: { type: "number", minimum: 0, maximum: 100 },
    crop_y: { type: "number", minimum: 0, maximum: 100 },
    crop_width: { type: "number", minimum: 0.1, maximum: 100 },
    crop_height: { type: "number", minimum: 0.1, maximum: 100 },
    missing_content: { type: "boolean" },
    foreign_content: { type: "boolean" },
    excessive_whitespace: { type: "boolean" },
    reason: { type: "string" },
  },
} as const;

function outputText(payload: OpenAiPayload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("\n");
}

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!cleaned) throw new Error("AI 검수 결과가 비어 있습니다.");
  return JSON.parse(cleaned);
}

function clamp(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
}

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-5";
    if (!apiKey) {
      return NextResponse.json({ success: false, message: "OPENAI_API_KEY가 없습니다." }, { status: 500 });
    }

    const supabase = createClient();
    const questionResult = await supabase
      .from("analysis_questions")
      .select("id,analysis_id,question_no,page_no,crop_x,crop_y,crop_width,crop_height,question_image_path,ai_result,confidence")
      .eq("id", id)
      .single();
    if (questionResult.error || !questionResult.data) {
      throw questionResult.error ?? new Error("문항을 찾을 수 없습니다.");
    }

    const question = questionResult.data as any;
    const analysis = await supabase
      .from("source_analysis")
      .select("source_file_id")
      .eq("id", question.analysis_id)
      .single();
    if (analysis.error || !analysis.data) throw analysis.error ?? new Error("분석 정보를 찾을 수 없습니다.");

    const source = await supabase
      .from("source_files")
      .select("title,grade,subject,exam_pdf_path")
      .eq("id", analysis.data.source_file_id)
      .single();
    if (source.error || !source.data?.exam_pdf_path) throw source.error ?? new Error("시험지 PDF가 없습니다.");
    if (!question.question_image_path) {
      return NextResponse.json({ success: false, message: "검수할 문항 이미지가 없습니다." }, { status: 400 });
    }

    const [pdfSigned, imageSigned] = await Promise.all([
      supabase.storage.from("exam-pdf").createSignedUrl(source.data.exam_pdf_path, 60 * 10),
      supabase.storage.from("question-images").createSignedUrl(question.question_image_path, 60 * 10),
    ]);
    if (pdfSigned.error) throw pdfSigned.error;
    if (imageSigned.error) throw imageSigned.error;

    const prompt = `너는 학생에게 배포할 수학 문항 이미지의 최종 품질 검수자다.

시험지 전체 PDF와 현재 잘린 문항 이미지를 함께 보고 ${question.question_no}번 문항만 정확히 포함되었는지 검사하라.
현재 좌표(페이지 전체 0~100 기준): page=${question.page_no}, x=${question.crop_x}, y=${question.crop_y}, width=${question.crop_width}, height=${question.crop_height}

검수 기준:
- 문항번호, 본문, 모든 수식, 조건, 보기, 선택지, 표, 그래프, 그림이 완전하게 포함되어야 한다.
- 분수, 지수, 근호, 도형의 선과 문자가 경계에서 잘리면 안 된다.
- 이전 또는 다음 문항의 번호·본문·그림이 섞이면 안 된다.
- 문항과 관계없는 위·아래·좌·우의 큰 공백은 제거해야 한다.
- 문항의 모든 요소를 감싸는 최소 직사각형에 작은 안전 여백만 남겨야 한다.
- 다음 문항번호 위치를 그대로 아래 경계로 쓰지 말고, 현재 문항의 실제 마지막 내용까지만 포함한다.

완벽하면 verdict=PASS와 현재 좌표를 그대로 반환한다.
문제가 하나라도 있으면 verdict=ADJUST로 하고, 시험지 전체 PDF에서 ${question.question_no}번 문항을 다시 찾아 학생에게 바로 배포 가능한 수정 좌표를 반환한다.
수정 좌표는 현재 좌표에 대한 이동량이 아니라 페이지 전체 기준 절대 좌표다.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: [
          { type: "input_text", text: prompt },
          { type: "input_file", file_url: pdfSigned.data.signedUrl },
          { type: "input_image", image_url: imageSigned.data.signedUrl, detail: "high" },
        ] }],
        text: { format: { type: "json_schema", name: "crop_quality_review", strict: true, schema: reviewSchema } },
        max_output_tokens: 1200,
      }),
      signal: AbortSignal.timeout(110_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI 크롭 검수 실패 (${response.status}): ${body}`);
    }

    const review = parseJson(outputText(await response.json() as OpenAiPayload));
    const pageNo = Math.max(1, Math.trunc(Number(review.page_no) || Number(question.page_no) || 1));
    const x = clamp(review.crop_x, 0, 99.5);
    const y = clamp(review.crop_y, 0, 99.5);
    const width = clamp(review.crop_width, 1, 100 - x);
    const height = clamp(review.crop_height, 1, 100 - y);
    const adjusted = review.verdict === "ADJUST";

    const patch: Record<string, unknown> = {
      confidence: adjusted ? Math.min(Number(question.confidence ?? 1), 0.9) : Number(question.confidence ?? 1),
      review_reason: adjusted ? String(review.reason || "AI 크롭 검수에서 좌표 수정") : null,
      ai_result: {
        ...(question.ai_result ?? {}),
        crop_quality_review: {
          verdict: review.verdict,
          missing_content: Boolean(review.missing_content),
          foreign_content: Boolean(review.foreign_content),
          excessive_whitespace: Boolean(review.excessive_whitespace),
          reason: String(review.reason ?? ""),
        },
      },
      updated_at: new Date().toISOString(),
    };
    if (adjusted) {
      Object.assign(patch, {
        page_no: pageNo,
        crop_x: x,
        crop_y: y,
        crop_width: width,
        crop_height: height,
      });
    }

    const updated = await supabase
      .from("analysis_questions")
      .update(patch)
      .eq("id", id)
      .select("id,question_no,page_no,crop_x,crop_y,crop_width,crop_height,confidence,review_reason,question_image_path,status")
      .single();
    if (updated.error) throw updated.error;

    return NextResponse.json({ success: true, adjusted, review, question: updated.data });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "문항 크롭 검수에 실패했습니다.",
    }, { status: 500 });
  }
}
