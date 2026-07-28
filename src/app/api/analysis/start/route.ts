import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type AiCropQuestion = {
  question_no: number;
  page_no: number;
  crop_x: number;
  crop_y: number;
  crop_width: number;
  crop_height: number;
  confidence: number;
  review_reason: string;
};

type OpenAiPayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  usage?: { total_tokens?: number };
};

const cropSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "question_no", "page_no", "crop_x", "crop_y", "crop_width",
          "crop_height", "confidence", "review_reason",
        ],
        properties: {
          question_no: { type: "integer", minimum: 1, maximum: 200 },
          page_no: { type: "integer", minimum: 1, maximum: 500 },
          crop_x: { type: "number", minimum: 0, maximum: 100 },
          crop_y: { type: "number", minimum: 0, maximum: 100 },
          crop_width: { type: "number", minimum: 0.1, maximum: 100 },
          crop_height: { type: "number", minimum: 0.1, maximum: 100 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          review_reason: { type: "string" },
        },
      },
    },
  },
} as const;

function outputText(payload: OpenAiPayload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("\n");
}

function clamp(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, safe));
}

function normalizeCrops(items: AiCropQuestion[]) {
  const byNumber = new Map<number, AiCropQuestion>();
  for (const raw of items) {
    const questionNo = Math.trunc(Number(raw.question_no));
    if (!Number.isFinite(questionNo) || questionNo < 1) continue;
    const x = clamp(Number(raw.crop_x), 0, 99.5);
    const y = clamp(Number(raw.crop_y), 0, 99.5);
    const width = clamp(Number(raw.crop_width), 1, 100 - x);
    const height = clamp(Number(raw.crop_height), 1, 100 - y);
    byNumber.set(questionNo, {
      question_no: questionNo,
      page_no: Math.max(1, Math.trunc(Number(raw.page_no) || 1)),
      crop_x: x,
      crop_y: y,
      crop_width: width,
      crop_height: height,
      confidence: clamp(Number(raw.confidence), 0, 1),
      review_reason: String(raw.review_reason ?? "").trim(),
    });
  }
  return [...byNumber.values()].sort((a, b) => a.question_no - b.question_no);
}

function parseOpenAiError(status: number, body: string) {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    message = parsed.error?.message || body;
  } catch {}
  return `OpenAI 문항 자르기 실패 (${status}): ${message}`;
}

export async function POST(request: NextRequest) {
  const denied = await requireUser();
  if (denied) return denied;

  const supabase = createClient();
  let analysisId: string | null = null;
  let jobId: string | null = null;

  try {
    const { sourceFileId } = (await request.json()) as { sourceFileId?: string };
    if (!sourceFileId) {
      return NextResponse.json({ success: false, message: "시험지를 선택해 주세요." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-5";
    if (!apiKey) {
      return NextResponse.json({ success: false, message: "OPENAI_API_KEY가 없습니다." }, { status: 500 });
    }

    const sourceResult = await supabase
      .from("source_files")
      .select("id,title,source,grade,subject,exam_pdf_path,solution_pdf_path")
      .eq("id", sourceFileId)
      .single();
    if (sourceResult.error || !sourceResult.data) {
      return NextResponse.json({ success: false, message: "시험지를 찾을 수 없습니다." }, { status: 404 });
    }
    const source = sourceResult.data;
    if (!source.exam_pdf_path) {
      return NextResponse.json({ success: false, message: "시험지 PDF가 없습니다." }, { status: 400 });
    }

    let analysisResult = await supabase
      .from("source_analysis")
      .select("*")
      .eq("source_file_id", sourceFileId)
      .maybeSingle();
    if (analysisResult.error) throw analysisResult.error;
    if (!analysisResult.data) {
      analysisResult = await supabase
        .from("source_analysis")
        .insert({ source_file_id: sourceFileId })
        .select("*")
        .single();
      if (analysisResult.error) throw analysisResult.error;
    }

    analysisId = analysisResult.data.id;
    const startedAt = new Date().toISOString();
    const job = await supabase
      .from("analysis_jobs")
      .insert({
        analysis_id: analysisId,
        job_type: "FULL_ANALYSIS",
        status: "RUNNING",
        progress: 5,
        started_at: startedAt,
        logs: [{ at: startedAt, message: `1단계 AI 문항 자르기 시작 · ${model}` }],
      })
      .select("id")
      .single();
    if (job.error) throw job.error;
    jobId = job.data.id;

    await supabase.from("source_analysis").update({
      status: "RUNNING",
      progress: 10,
      current_step: "1단계 · AI가 문항 경계를 찾는 중",
      started_at: startedAt,
      finished_at: null,
      updated_at: startedAt,
    }).eq("id", analysisId);

    const signed = await supabase.storage.from("exam-pdf").createSignedUrl(source.exam_pdf_path, 60 * 60);
    if (signed.error) throw signed.error;

    const prompt = [
      "너는 한국 수학 시험지에서 학생에게 바로 제공할 수 있는 '완성된 문항 이미지'의 경계를 찾는 비전 엔진이다.",
      "단순히 문항번호와 다음 번호 사이를 자르지 말고, 각 문항을 하나의 독립된 시각적 객체로 이해하라.",
      "",
      "[문항에 반드시 포함할 것]",
      "- 문항번호",
      "- 문제 본문 전체와 줄바꿈된 문장",
      "- 모든 수식, 분수의 분자·분모, 지수, 근호, 첨자",
      "- 조건, ㄱ·ㄴ·ㄷ, 보기, 선택지, 답안에 필요한 문구",
      "- 해당 문항에 속한 그림, 그래프, 표, 좌표축, 도형과 그 안의 문자",
      "- 본문과 떨어져 배치되어도 내용상 같은 문항에 속하는 요소",
      "",
      "[반드시 제외할 것]",
      "- 이전 문항의 마지막 줄이나 그림",
      "- 다음 문항의 번호 및 본문",
      "- 시험지 제목, 이름란, 머리말, 꼬리말, 쪽번호, 저작권 문구",
      "- 문항과 관계없는 큰 빈 공간",
      "",
      "[경계 결정 방법]",
      "1. 먼저 실제 문항번호를 찾는다.",
      "2. 그 번호에서 시작되는 본문을 따라가며 같은 문항에 속한 모든 시각 요소를 묶는다.",
      "3. 다음 문항번호는 현재 문항의 종료 후보일 뿐이며, 실제 현재 문항의 마지막 내용까지만 포함한다.",
      "4. 현재 문항의 모든 요소를 감싸는 가장 작은 직사각형을 만든다.",
      "5. 글자나 선이 잘리지 않도록 사방에 아주 작은 안전 여백만 둔다. 큰 공백은 남기지 않는다.",
      "6. 최종 결과를 다시 눈으로 검수하여 누락, 다른 문항 혼입, 과도한 공백이 없는지 확인한다.",
      "",
      "2단 편집은 왼쪽 단과 오른쪽 단을 각각 독립적으로 판단한다. 옆 문항의 영역을 포함하지 않는다.",
      "문항이 단을 가로지르거나 큰 그림이 옆에 있는 경우에는 실제로 그 문항에 속한 범위만 포함한다.",
      "좌표는 각 페이지 전체 기준 0~100 백분율이다. crop_x,crop_y는 왼쪽 위, crop_width,crop_height는 폭과 높이다.",
      "문항번호는 시험지에 인쇄된 실제 번호를 그대로 사용하고 누락·중복 없이 번호순으로 반환한다.",
      "학생에게 바로 배포하기 어려울 정도로 경계가 불확실하면 confidence를 낮추고 review_reason에 구체적인 이유를 적는다.",
      "확실하면 review_reason은 빈 문자열이다.",
      `시험지 정보: ${source.title} / ${source.source ?? ""} / ${source.grade ?? ""} / ${source.subject ?? ""}`,
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: [
          { type: "input_text", text: prompt },
          { type: "input_file", file_url: signed.data.signedUrl },
        ] }],
        text: { format: { type: "json_schema", name: "math_exam_crops", strict: true, schema: cropSchema } },
        max_output_tokens: 14000,
      }),
      signal: AbortSignal.timeout(280_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(parseOpenAiError(response.status, await response.text()));

    const payload = (await response.json()) as OpenAiPayload;
    const parsed = JSON.parse(outputText(payload).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as { questions: AiCropQuestion[] };
    const crops = normalizeCrops(parsed.questions ?? []);
    if (!crops.length) throw new Error("AI가 문항 영역을 찾지 못했습니다.");

    await supabase.from("analysis_questions").delete().eq("analysis_id", analysisId);
    const inserted = await supabase.from("analysis_questions").insert(crops.map((crop) => ({
      analysis_id: analysisId,
      question_no: crop.question_no,
      answer: null,
      status: "WAITING",
      confidence: crop.confidence,
      page_no: crop.page_no,
      crop_x: crop.crop_x,
      crop_y: crop.crop_y,
      crop_width: crop.crop_width,
      crop_height: crop.crop_height,
      review_reason: crop.review_reason || null,
      ai_result: {
        crop_engine: "AI_VISUAL_OBJECT_V3",
        ai_crop: { confidence: crop.confidence, review_reason: crop.review_reason || null },
      },
      review_result: {},
      question_image_path: null,
    }))).select("id,question_no,page_no,crop_x,crop_y,crop_width,crop_height,confidence,review_reason,question_image_path,status");
    if (inserted.error) throw inserted.error;

    await supabase.from("source_analysis").update({
      status: "RUNNING",
      progress: 35,
      current_step: `1단계 완료 · ${crops.length}개 문항 · 이미지 생성 대기`,
      total_questions: crops.length,
      updated_at: new Date().toISOString(),
    }).eq("id", analysisId);

    await supabase.from("analysis_jobs").update({
      progress: 35,
      updated_at: new Date().toISOString(),
      logs: [{ at: startedAt, message: `1단계 AI 문항 자르기 완료 · ${crops.length}개` }],
    }).eq("id", jobId);

    return NextResponse.json({
      success: true,
      analysisId,
      sourceFileId,
      questionCount: crops.length,
      questions: inserted.data ?? [],
      pdfUrl: signed.data.signedUrl,
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 문항 자르기에 실패했습니다.";
    const failedAt = new Date().toISOString();
    if (analysisId) {
      await supabase.from("source_analysis").update({ status: "FAILED", progress: 0, current_step: message, updated_at: failedAt }).eq("id", analysisId);
    }
    if (jobId) {
      await supabase.from("analysis_jobs").update({ status: "FAILED", error_message: message, finished_at: failedAt, updated_at: failedAt }).eq("id", jobId);
    }
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
