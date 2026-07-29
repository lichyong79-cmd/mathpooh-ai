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
  question_number_y: number;
  confidence: number;
  review_reason: string;
};

type AnalysisQuestion = {
  question_no: number;
  answer: string;
  question_type: "objective" | "subjective" | "unknown";
  subject: string;
  unit: string;
  topic: string;
  difficulty: "하" | "중" | "상" | "최상";
  confidence: number;
  summary: string;
};

type OpenAiPayload = {
  id?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
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
          "question_no",
          "page_no",
          "crop_x",
          "crop_y",
          "crop_width",
          "crop_height",
          "question_number_y",
          "confidence",
          "review_reason",
        ],
        properties: {
          question_no: { type: "integer", minimum: 1, maximum: 200 },
          page_no: { type: "integer", minimum: 1, maximum: 500 },
          crop_x: { type: "number", minimum: 0, maximum: 100 },
          crop_y: { type: "number", minimum: 0, maximum: 100 },
          crop_width: { type: "number", minimum: 1, maximum: 100 },
          crop_height: { type: "number", minimum: 1, maximum: 100 },
          question_number_y: { type: "number", minimum: 0, maximum: 100 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          review_reason: { type: "string" },
        },
      },
    },
  },
} as const;

const analysisSchema = {
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
          "question_no",
          "answer",
          "question_type",
          "subject",
          "unit",
          "topic",
          "difficulty",
          "confidence",
          "summary",
        ],
        properties: {
          question_no: { type: "integer", minimum: 1, maximum: 200 },
          answer: { type: "string" },
          question_type: { type: "string", enum: ["objective", "subjective", "unknown"] },
          subject: { type: "string" },
          unit: { type: "string" },
          topic: { type: "string" },
          difficulty: { type: "string", enum: ["하", "중", "상", "최상"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          summary: { type: "string" },
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

function parseJson<T>(payload: OpenAiPayload): T {
  const cleaned = outputText(payload)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

function clamp(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, safe));
}

/**
 * AI가 페이지에서 각 문항의 실제 bounding box를 직접 반환한다.
 * 별표, 홀짝, 고정 단폭, 다음 문항 추정값은 사용하지 않는다.
 */
function normalizeAiCrops(items: AiCropQuestion[]) {
  const byQuestion = new Map<number, AiCropQuestion>();

  for (const item of items) {
    const questionNo = Math.trunc(Number(item.question_no));
    if (!Number.isFinite(questionNo) || questionNo < 1) continue;

    const x = clamp(Number(item.crop_x), 0, 99);
    const rawY = clamp(Number(item.crop_y), 0, 99);
    const rawHeight = clamp(Number(item.crop_height), 1, 100 - rawY);
    const rawBottom = rawY + rawHeight;
    const numberAnchor = clamp(Number(item.question_number_y), rawY, rawBottom - 0.2);

    // AI가 문항 간 구간의 시작을 crop_y로 잡더라도 실제 인쇄된 문항번호 위치로
    // 시작점만 강제 이동한다. 기존 아래쪽 끝은 유지하므로 선택지·도형은 잘리지 않는다.
    // 페이지 높이의 0.28%만 안전 여백으로 남기며, 번호 위의 별표/장식은 포함하지 않는다.
    const y = clamp(numberAnchor - 0.28, 0, rawBottom - 0.2);
    const width = clamp(Number(item.crop_width), 1, 100 - x);
    const height = clamp(rawBottom - y, 0.2, 100 - y);

    byQuestion.set(questionNo, {
      question_no: questionNo,
      page_no: Math.max(1, Math.trunc(Number(item.page_no) || 1)),
      crop_x: x,
      crop_y: y,
      crop_width: width,
      crop_height: height,
      question_number_y: numberAnchor,
      confidence: clamp(Number(item.confidence), 0, 1),
      review_reason: String(item.review_reason ?? "").trim(),
    });
  }

  return [...byQuestion.values()].sort((a, b) => a.question_no - b.question_no);
}


function intersectionOverUnion(a: AiCropQuestion, b: AiCropQuestion) {
  if (a.page_no !== b.page_no) return 0;
  const left = Math.max(a.crop_x, b.crop_x);
  const top = Math.max(a.crop_y, b.crop_y);
  const right = Math.min(a.crop_x + a.crop_width, b.crop_x + b.crop_width);
  const bottom = Math.min(a.crop_y + a.crop_height, b.crop_y + b.crop_height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  if (intersection <= 0) return 0;
  const union = a.crop_width * a.crop_height + b.crop_width * b.crop_height - intersection;
  return union > 0 ? intersection / union : 0;
}

function findDuplicateCrops(items: AiCropQuestion[]) {
  const duplicates: Array<{ first: number; second: number; page: number; overlap: number }> = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a.page_no !== b.page_no) continue;
      const overlap = intersectionOverUnion(a, b);
      const nearlySame =
        Math.abs(a.crop_x - b.crop_x) < 0.7 &&
        Math.abs(a.crop_y - b.crop_y) < 0.7 &&
        Math.abs(a.crop_width - b.crop_width) < 0.7 &&
        Math.abs(a.crop_height - b.crop_height) < 0.7;
      if (overlap >= 0.86 || nearlySame) {
        duplicates.push({
          first: a.question_no,
          second: b.question_no,
          page: a.page_no,
          overlap: Math.round(overlap * 1000) / 1000,
        });
      }
    }
  }
  return duplicates;
}

function openAiError(status: number, body: string) {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    message = parsed.error?.message || body;
  } catch {
    // plain text response
  }

  if (status === 401) return "OpenAI API 키가 올바르지 않습니다.";
  if (status === 429) return `OpenAI 결제 또는 사용 한도를 확인해 주세요. ${message}`;
  if (status === 404) return `설정된 AI 모델을 사용할 수 없습니다. ${message}`;
  return `OpenAI 분석 실패 (${status}): ${message}`;
}

async function callOpenAi(args: {
  apiKey: string;
  model: string;
  prompt: string;
  files: string[];
  schemaName: string;
  schema: typeof cropSchema | typeof analysisSchema;
  maxOutputTokens: number;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: args.prompt },
            ...args.files.map((file_url) => ({ type: "input_file", file_url })),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: args.schemaName,
          strict: true,
          schema: args.schema,
        },
      },
      max_output_tokens: args.maxOutputTokens,
    }),
    signal: AbortSignal.timeout(280_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(openAiError(response.status, await response.text()));
  }

  return (await response.json()) as OpenAiPayload;
}

export async function POST(request: NextRequest) {
  const denied = await requireUser();
  if (denied) return denied;

  const supabase = createClient();
  let analysisId: string | null = null;
  let jobId: string | null = null;

  try {
    const { sourceFileId, mode = "crop-only" } = (await request.json()) as { sourceFileId?: string; mode?: "crop-only" | "full" };
    if (!sourceFileId) {
      return NextResponse.json(
        { success: false, message: "시험지를 선택해 주세요." },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const cropModel = process.env.OPENAI_CROP_MODEL || process.env.OPENAI_MODEL || "gpt-5";
    const analysisModel = process.env.OPENAI_ANALYSIS_MODEL || "gpt-5-mini";
    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: "OPENAI_API_KEY가 없습니다." },
        { status: 500 },
      );
    }

    const sourceResult = await supabase
      .from("source_files")
      .select("id,title,source,grade,subject,exam_pdf_path,solution_pdf_path")
      .eq("id", sourceFileId)
      .single();

    if (sourceResult.error || !sourceResult.data) {
      return NextResponse.json(
        { success: false, message: "시험지를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const source = sourceResult.data;
    if (!source.exam_pdf_path || (mode === "full" && !source.solution_pdf_path)) {
      return NextResponse.json(
        { success: false, message: mode === "full" ? "시험지 PDF와 해설지 PDF가 모두 필요합니다." : "시험지 PDF가 필요합니다." },
        { status: 400 },
      );
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

    const analysis = analysisResult.data;
    analysisId = analysis.id;

    const startedAt = new Date().toISOString();
    const baseLogs = [{ at: startedAt, message: `AI 직접 영역 판독 ${cropModel} · 빠른 분석 ${analysisModel}` }];

    const job = await supabase
      .from("analysis_jobs")
      .insert({
        analysis_id: analysis.id,
        job_type: "FULL_ANALYSIS",
        status: "RUNNING",
        progress: 5,
        started_at: startedAt,
        logs: baseLogs,
      })
      .select("*")
      .single();

    if (job.error) throw job.error;
    jobId = job.data.id;

    await supabase
      .from("source_analysis")
      .update({
        status: "RUNNING",
        progress: 5,
        current_step: "AI가 시험지를 직접 읽는 중",
        started_at: startedAt,
        finished_at: null,
        updated_at: startedAt,
      })
      .eq("id", analysis.id);

    const sign = async (path: string) => {
      const signed = await supabase.storage
        .from("exam-pdf")
        .createSignedUrl(path, 60 * 60);
      if (signed.error) throw signed.error;
      return signed.data.signedUrl;
    };

    const [examUrl, solutionUrl] = await Promise.all([
      sign(source.exam_pdf_path),
      sign(source.solution_pdf_path),
    ]);

    await supabase
      .from("source_analysis")
      .update({
        progress: 15,
        current_step: "AI가 문항별 실제 영역과 내용을 동시에 분석 중",
      })
      .eq("id", analysis.id);

    const cropPrompt = [
      "너는 한국 수학 시험지에서 각 실제 문항의 사각형 영역을 찾는 비전 판독기다.",
      "별표 유무와 관계없이 시험지에 인쇄된 실제 문항을 모두 찾는다.",
      "각 문항마다 page_no, question_no, crop_x, crop_y, crop_width, crop_height, question_number_y를 페이지 전체 기준 0~100 백분율로 직접 반환한다.",
      "question_number_y는 별표나 장식이 아니라 실제 인쇄된 해당 문항번호(예: 11., 12.) 글자의 맨 위 y좌표다.",
      "crop 사각형은 문항번호부터 본문, 모든 수식, 보기, 선택지, 표, 그래프, 도형의 마지막 요소까지 포함해야 한다.",
      "현재 문항 위의 이전 문항 선택지나 아래의 다음 문항 번호·본문은 절대로 포함하지 않는다.",
      "두 단 편집이면 각 문항이 속한 단 안에서만 가로 범위를 잡고, 다른 단의 문항이나 빈 공간을 포함하지 않는다.",
      "문항이 한 단 전체 너비를 쓰면 실제 내용 너비만 포함한다. 홀짝 번호로 단을 추측하지 않는다.",
      "crop_y도 실제 인쇄된 문항번호 행 부근으로 잡되, 최종 시작점은 question_number_y를 기준으로 코드가 보정한다.",
      "문항번호보다 위나 왼쪽에 있는 별표(★), 난이도 아이콘, 장식기호, 단원 표시는 question_number_y로 절대로 잡지 않는다.",
      "별표가 없는 문서에서도 question_number_y는 반드시 해당 문항번호 자체의 맨 위를 가리킨다.",
      "분수·지수·근호가 문항번호보다 위로 튀는 경우에만 그 수식이 잘리지 않을 최소 여백을 둔다.",
      "문항의 아래쪽은 선택지·도형이 끝난 직후까지만 두고 큰 빈 여백을 포함하지 않는다.",
      "페이지 머리말, 시험 제목, 이름란, 쪽번호, 출판사·저작권 문구는 포함하지 않는다.",
      "예제·설명·참고문항처럼 번호가 있더라도 실제 시험 문항이 아니면 제외한다.",
      "문항번호는 실제 인쇄된 번호를 사용하고 누락·중복하지 않는다.",
      "같은 페이지의 서로 다른 문항에 동일하거나 거의 동일한 사각형 좌표를 절대로 반환하지 않는다. 각 문항은 반드시 자기 문항번호가 보이는 고유 영역이어야 한다.",
      "반환 전 같은 페이지의 모든 사각형을 서로 비교하여, 한 문항 영역이 다른 문항 영역과 대부분 겹치면 좌표를 다시 찾는다.",
      "영역이 명확하면 confidence를 높게, 페이지 경계에 걸리거나 영역이 애매하면 낮게 주고 review_reason에 이유를 쓴다.",
      "확실하면 review_reason은 빈 문자열로 둔다.",
      `시험지 정보: ${source.title} / ${source.grade ?? ""} / ${source.subject ?? ""}`,
    ].join("\n");

    const analysisPrompt = [
      "너는 한국 중·고등 수학 문항 분석 전문가다.",
      "첫 번째 PDF는 시험지, 두 번째 PDF는 해설지다.",
      "문항 자르기나 좌표는 판단하지 않고 문항번호별 내용만 분석한다.",
      "시험지에 실제 존재하는 모든 문항을 번호순으로 분석한다.",
      "정답은 해설지의 정답표와 해당 해설을 교차 확인한다. 확인이 어려우면 빈 문자열로 둔다.",
      "객관식은 objective, 단답형·서술형은 subjective로 분류한다.",
      "unit은 교육과정 단원명으로 구체적으로 쓴다.",
      "topic은 핵심 개념·발상·유형이 드러나도록 12~30자로 쓴다.",
      "difficulty는 하·중·상·최상 중 하나다.",
      "summary는 25자 안팎의 매우 짧은 한 문장으로 작성한다.",
      "설명이나 풀이를 길게 쓰지 말고 분류 결과만 간결하게 반환한다.",
      "문항번호를 누락하거나 중복하지 않는다.",
      `시험지 정보: ${source.title} / ${source.source ?? ""} / ${source.grade ?? ""} / ${source.subject ?? ""}`,
    ].join("\n");

    const cropPromise = callOpenAi({
        apiKey,
        model: cropModel,
        prompt: cropPrompt,
        files: [examUrl],
        schemaName: "math_exam_visual_bounding_boxes_v1",
        schema: cropSchema,
        maxOutputTokens: 9000,
      });
    const analysisPromise = mode === "full" && solutionUrl ? callOpenAi({
        apiKey,
        model: analysisModel,
        prompt: analysisPrompt,
        files: [examUrl, solutionUrl],
        schemaName: "math_exam_content_analysis",
        schema: analysisSchema,
        maxOutputTokens: 6500,
      }) : Promise.resolve(null);
    const [cropRaw, analysisRaw] = await Promise.all([cropPromise, analysisPromise]);

    let cropPayload = parseJson<{ questions: AiCropQuestion[] }>(cropRaw);
    let crops = normalizeAiCrops(cropPayload.questions);
    if (!crops.length) {
      throw new Error("AI가 문항 영역을 찾지 못했습니다.");
    }

    // 같은 페이지의 여러 문항이 첫 문항 좌표를 공유하는 잘못된 결과는 저장하지 않는다.
    // 중복이 감지되면 시험지 비전을 한 번 더 호출해 좌표만 바로잡는다.
    let duplicateCrops = findDuplicateCrops(crops);
    if (duplicateCrops.length) {
      await supabase
        .from("source_analysis")
        .update({
          progress: 55,
          current_step: `중복 문항 영역 ${duplicateCrops.length}건 감지 · 좌표 재판독 중`,
        })
        .eq("id", analysis.id);

      const correctionPrompt = [
        cropPrompt,
        "",
        "이전 판독에서 아래 문항들이 같은 페이지의 동일한 첫 문항 영역을 공유하는 오류가 발생했다.",
        JSON.stringify(duplicateCrops),
        "시험지 전체를 다시 직접 보고 모든 문항의 사각형을 새로 산출하라.",
        "이전 좌표를 복사하거나 재사용하지 말고, 각 question_no가 실제로 보이는 서로 다른 고유 영역만 반환하라.",
        "문항 위/왼쪽의 별표(★)나 장식은 제외하고 실제 문항번호부터 시작하라.",
        "각 문항의 question_number_y를 실제 인쇄된 번호 글자의 맨 위로 다시 측정하라.",
      ].join("\n");

      const correctedRaw = await callOpenAi({
        apiKey,
        model: cropModel,
        prompt: correctionPrompt,
        files: [examUrl],
        schemaName: "math_exam_visual_bounding_boxes_corrected_v2",
        schema: cropSchema,
        maxOutputTokens: 9000,
      });
      cropPayload = parseJson<{ questions: AiCropQuestion[] }>(correctedRaw);
      crops = normalizeAiCrops(cropPayload.questions);
      duplicateCrops = findDuplicateCrops(crops);
    }

    if (duplicateCrops.length) {
      const sample = duplicateCrops
        .slice(0, 6)
        .map((item) => `${item.page}쪽 ${item.first}번/${item.second}번`)
        .join(", ");
      throw new Error(`AI 문항 좌표 중복을 자동으로 막았습니다: ${sample}. 다시 분석해 주세요.`);
    }

    const analysisPayload = analysisRaw ? parseJson<{ questions: AnalysisQuestion[] }>(analysisRaw) : { questions: [] as AnalysisQuestion[] };
    const analysisByNo = new Map(analysisPayload.questions.map((item) => [Number(item.question_no), item]));

    await supabase
      .from("source_analysis")
      .update({
        progress: 80,
        current_step: `AI 직접 자르기 완료 · ${crops.length}개 문항 저장 중`,
      })
      .eq("id", analysis.id);

    await supabase.from("analysis_questions").delete().eq("analysis_id", analysis.id);

    const rows = crops.map((crop) => {
      const meta = analysisByNo.get(crop.question_no);
      const combinedConfidence = Math.min(
        crop.confidence,
        Number(meta?.confidence ?? 0.55),
      );

      const cropNeedsReview =
        crop.confidence < 0.82 || Boolean(crop.review_reason.trim());

      return {
        analysis_id: analysis.id,
        question_no: crop.question_no,
        answer: meta?.answer?.trim() || null,
        status: meta ? "REVIEW" : "WAITING",
        confidence: combinedConfidence,
        page_no: crop.page_no,
        crop_x: crop.crop_x,
        crop_y: crop.crop_y,
        crop_width: crop.crop_width,
        crop_height: crop.crop_height,
        review_reason: cropNeedsReview
          ? crop.review_reason || "AI가 자른 문항 영역을 확인해 주세요."
          : null,
        ai_result: {
          question_type: meta?.question_type ?? "unknown",
          subject: meta?.subject || source.subject || null,
          unit: meta?.unit || null,
          topic: meta?.topic || null,
          difficulty: meta?.difficulty ?? "중",
          summary: meta?.summary || null,
          crop_engine: "AI_VISUAL_BOUNDING_BOX_V1",
          ai_crop: {
            confidence: crop.confidence,
            review_reason: crop.review_reason || null,
            bounding_box: {
              x: crop.crop_x,
              y: crop.crop_y,
              width: crop.crop_width,
              height: crop.crop_height,
              question_number_y: crop.question_number_y,
            },
          },
        },
      };
    });

    const inserted = await supabase
      .from("analysis_questions")
      .insert(rows)
      .select("id,question_no,answer,confidence,review_reason,ai_result");

    if (inserted.error) throw inserted.error;

    const insertedQuestions = inserted.data ?? [];
    const reviewIds = insertedQuestions
      .filter((question) => {
        const result = (question.ai_result ?? {}) as Record<string, unknown>;
        return (
          Boolean(question.review_reason) ||
          Number(question.confidence ?? 0) < 0.82 ||
          !String(question.answer ?? "").trim() ||
          !String(result.unit ?? "").trim() ||
          !String(result.topic ?? "").trim() ||
          String(result.question_type ?? "unknown") === "unknown"
        );
      })
      .map((question) => question.id);

    if (reviewIds.length) {
      const reviewUpdate = await supabase
        .from("analysis_questions")
        .update({ updated_at: new Date().toISOString() })
        .in("id", reviewIds);
      if (reviewUpdate.error) throw reviewUpdate.error;
    }

    const objectiveCount = analysisPayload.questions.filter(
      (question) => question.question_type === "objective",
    ).length;
    const subjectiveCount = analysisPayload.questions.filter(
      (question) => question.question_type === "subjective",
    ).length;

    const finishedAt = new Date().toISOString();
    const updated = await supabase
      .from("source_analysis")
      .update({
        status: mode === "full" ? "REVIEW" : "WAITING",
        progress: mode === "full" ? 100 : 45,
        current_step: mode === "full" ? `빠른 자르기·분석 완료 · ${rows.length}개 문항 · 재확인 권장 ${reviewIds.length}개` : `빠른 자르기 완료 · ${rows.length}개 문항 · 문항 분석 대기`,
        total_questions: rows.length,
        objective_count: objectiveCount,
        subjective_count: subjectiveCount,
        finished_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq("id", analysis.id)
      .select("*")
      .single();

    if (updated.error) throw updated.error;

    const totalTokens =
      Number(cropRaw.usage?.total_tokens ?? 0) +
      Number(analysisRaw?.usage?.total_tokens ?? 0);

    await supabase
      .from("analysis_jobs")
      .update({
        status: "DONE",
        progress: mode === "full" ? 100 : 45,
        finished_at: finishedAt,
        updated_at: finishedAt,
        logs: [
          ...baseLogs,
          {
            at: finishedAt,
            message: mode === "full" ? `${rows.length}개 빠른 자르기·분석 완료${
              totalTokens
                ? ` · ${totalTokens.toLocaleString("ko-KR")} tokens`
                : ""
            }` : `${rows.length}개 빠른 자르기 완료 · 문항 분석 대기`,
          },
        ],
      })
      .eq("id", jobId);

    return NextResponse.json({
      success: true,
      analysis: updated.data,
      questionCount: rows.length,
      reviewPending: reviewIds.length,
      cropValidCount: crops.filter((crop) => crop.confidence >= 0.82).length,
      cropInvalidCount: crops.filter((crop) => crop.confidence < 0.82).length,
      mode: mode === "full" ? "CROP_AND_ANALYSIS" : "FAST_CROP_ONLY",
      model: mode === "full" ? `${cropModel} + ${analysisModel}` : cropModel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 분석에 실패했습니다.";
    const failedAt = new Date().toISOString();

    if (analysisId) {
      await supabase
        .from("source_analysis")
        .update({
          status: "FAILED",
          progress: 0,
          current_step: message,
          updated_at: failedAt,
        })
        .eq("id", analysisId);
    }

    if (jobId) {
      await supabase
        .from("analysis_jobs")
        .update({
          status: "FAILED",
          error_message: message,
          finished_at: failedAt,
          updated_at: failedAt,
        })
        .eq("id", jobId);
    }

    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
