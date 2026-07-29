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
          "confidence",
          "review_reason",
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
 * AI가 반환한 최종 사각형을 저장 가능한 범위로만 제한한다.
 * 문항 경계 계산, 단 구분, 다음 문항 추정 같은 자르기 판단은 코드에서 하지 않는다.
 */
function normalizeAiCrops(items: AiCropQuestion[]) {
  const byQuestion = new Map<number, AiCropQuestion>();

  for (const item of items) {
    const questionNo = Math.trunc(Number(item.question_no));
    if (!Number.isFinite(questionNo) || questionNo < 1) continue;

    const x = clamp(Number(item.crop_x), 0, 99.5);
    const y = clamp(Number(item.crop_y), 0, 99.5);
    const width = clamp(Number(item.crop_width), 0.5, 100 - x);
    const height = clamp(Number(item.crop_height), 0.5, 100 - y);

    byQuestion.set(questionNo, {
      question_no: questionNo,
      page_no: Math.max(1, Math.trunc(Number(item.page_no) || 1)),
      crop_x: x,
      crop_y: y,
      crop_width: width,
      crop_height: height,
      confidence: clamp(Number(item.confidence), 0, 1),
      review_reason: String(item.review_reason ?? "").trim(),
    });
  }

  return [...byQuestion.values()].sort((a, b) => a.question_no - b.question_no);
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
    const { sourceFileId } = (await request.json()) as { sourceFileId?: string };
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
    if (!source.exam_pdf_path || !source.solution_pdf_path) {
      return NextResponse.json(
        { success: false, message: "시험지 PDF와 해설지 PDF가 모두 필요합니다." },
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
    const baseLogs = [{ at: startedAt, message: `AI 자르기 ${cropModel} · 빠른 분석 ${analysisModel}` }];

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
        current_step: "AI 직접 자르기와 문항 분석을 동시에 진행 중",
      })
      .eq("id", analysis.id);

    const cropPrompt = [
      "너는 한국 수학 시험지의 문항 끝점만 판정하는 비전 판독기다.",
      "첨부된 시험지 PDF에서 검은 별표 문자 ★가 붙은 항목만 실제 등록 문항이다.",
      "★가 없는 예제·유제·설명·참고문항은 절대로 문항으로 반환하지 않는다.",
      "각 ★는 해당 문항의 유일하고 확정된 시작 표식이다.",
      "문항 시작 위치를 문항번호만 보고 추측하지 말고 반드시 ★ 위치를 기준으로 삼는다.",
      "각 문항의 crop 위쪽은 ★의 윗부분이 잘리지 않도록 ★ 바로 위에 아주 작은 여백만 둔다.",
      "AI가 실질적으로 판단해야 할 핵심은 그 문항의 마지막 내용이 끝나는 bottom 위치다.",
      "다음 ★까지 무조건 자르지 않는다. 현재 문항의 본문·보기·선택지·표·그래프·도형이 실제로 끝나는 곳에서 끝낸다.",
      "같은 단 아래쪽에 다음 ★가 있더라도 현재 문항이 먼저 끝나면 현재 문항 끝 바로 아래에서 crop을 종료한다.",
      "반대로 현재 문항의 도형이나 선택지가 아래로 길게 이어지면 그것까지 모두 포함한다.",
      "각 문항에 대해 page_no와 crop_x, crop_y, crop_width, crop_height를 반환한다.",
      "좌표와 크기는 해당 PDF 페이지 전체를 기준으로 한 0~100 백분율이다.",
      "crop_x와 crop_width는 ★가 속한 편집 단 전체를 포함하되 옆 단의 내용은 포함하지 않도록 정한다.",
      "2단 편집에서는 왼쪽 문항은 왼쪽 단만, 오른쪽 문항은 오른쪽 단만 포함한다.",
      "문항번호, 본문, 모든 수식, 보기, 선택지, 표, 그래프, 도형을 빠짐없이 포함한다.",
      "분수의 분자, 근호, 지수처럼 위로 튀어나오는 수식이 잘리지 않도록 위쪽에 최소 안전 여백을 둔다.",
      "페이지 머리말, 시험 제목, 이름란, 쪽번호, 출판사 문구, 저작권 문구는 포함하지 않는다.",
      "한 페이지에 보이는 ★를 위에서 아래, 왼쪽 단 다음 오른쪽 단의 실제 문항번호 순으로 확인한다.",
      "실제 인쇄된 문항번호를 question_no로 사용하며 누락하거나 중복하지 않는다.",
      "★가 선명하고 끝점도 확실하면 confidence를 높게 준다.",
      "끝점이 애매하거나 문항이 다음 페이지로 이어지면 confidence를 낮추고 review_reason에 이유를 쓴다.",
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

    const [cropRaw, analysisRaw] = await Promise.all([
      callOpenAi({
        apiKey,
        model: cropModel,
        prompt: cropPrompt,
        files: [examUrl],
        schemaName: "math_exam_direct_crop",
        schema: cropSchema,
        maxOutputTokens: 9000,
      }),
      callOpenAi({
        apiKey,
        model: analysisModel,
        prompt: analysisPrompt,
        files: [examUrl, solutionUrl],
        schemaName: "math_exam_content_analysis",
        schema: analysisSchema,
        maxOutputTokens: 6500,
      }),
    ]);

    const cropPayload = parseJson<{ questions: AiCropQuestion[] }>(cropRaw);
    const crops = normalizeAiCrops(cropPayload.questions);
    if (!crops.length) {
      throw new Error("AI가 문항 영역을 찾지 못했습니다.");
    }

    const analysisPayload = parseJson<{ questions: AnalysisQuestion[] }>(analysisRaw);
    const analysisByNo = new Map(
      analysisPayload.questions.map((item) => [Number(item.question_no), item]),
    );

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
        status: "APPROVED",
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
          crop_engine: "STAR_START_AI_BOTTOM",
          ai_crop: {
            confidence: crop.confidence,
            review_reason: crop.review_reason || null,
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
        status: "REVIEW",
        progress: 100,
        current_step: `AI 직접 자르기 완료 · ${rows.length}개 문항 · 재확인 권장 ${reviewIds.length}개`,
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
      Number(analysisRaw.usage?.total_tokens ?? 0);

    await supabase
      .from("analysis_jobs")
      .update({
        status: "DONE",
        progress: 100,
        finished_at: finishedAt,
        updated_at: finishedAt,
        logs: [
          ...baseLogs,
          {
            at: finishedAt,
            message: `${rows.length}개 AI 직접 자르기·분석 완료${
              totalTokens
                ? ` · ${totalTokens.toLocaleString("ko-KR")} tokens`
                : ""
            }`,
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
      mode: "STAR_START_AI_BOTTOM",
      model: `${cropModel} + ${analysisModel}`,
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
