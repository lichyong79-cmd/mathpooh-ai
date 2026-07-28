import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type LayoutQuestion = {
  question_no: number;
  page_no: number;
  column: "left" | "right" | "full";
  start_y: number;
  content_bottom_y: number;
  confidence: number;
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

const layoutSchema = {
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
        required: ["question_no", "page_no", "column", "start_y", "content_bottom_y", "confidence"],
        properties: {
          question_no: { type: "integer", minimum: 1, maximum: 200 },
          page_no: { type: "integer", minimum: 1, maximum: 500 },
          column: { type: "string", enum: ["left", "right", "full"] },
          start_y: { type: "number", minimum: 0, maximum: 100 },
          content_bottom_y: { type: "number", minimum: 0, maximum: 100 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
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
          "question_no", "answer", "question_type", "subject", "unit", "topic",
          "difficulty", "confidence", "summary",
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
  return (payload.output ?? []).flatMap(item => item.content ?? []).map(content => content.text ?? "").join("\n");
}

function parseJson<T>(payload: OpenAiPayload): T {
  const cleaned = outputText(payload).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function columnRect(column: LayoutQuestion["column"]) {
  if (column === "left") return { x: 3.5, width: 46.5 };
  if (column === "right") return { x: 50, width: 46.5 };
  return { x: 3.5, width: 93 };
}

/**
 * OCR은 문항의 시작점과 실제 콘텐츠 끝점만 찾는다.
 * 최종 crop 끝점은 같은 페이지·같은 단의 다음 문항 시작점과 비교해 코드가 결정한다.
 */
function buildCrops(layouts: LayoutQuestion[]) {
  const normalized = layouts
    .map(item => ({
      ...item,
      question_no: Number(item.question_no),
      page_no: Math.max(1, Number(item.page_no) || 1),
      start_y: clamp(Number(item.start_y), 0, 99),
      content_bottom_y: clamp(Number(item.content_bottom_y), 0.5, 100),
      confidence: clamp(Number(item.confidence), 0, 1),
    }))
    .filter(item => Number.isFinite(item.question_no))
    .sort((a, b) => a.page_no - b.page_no || a.start_y - b.start_y || a.question_no - b.question_no);

  return normalized.map(current => {
    const next = normalized.find(candidate =>
      candidate.page_no === current.page_no
      && candidate.column === current.column
      && candidate.start_y > current.start_y + 0.5,
    );

    const top = clamp(current.start_y - 0.8, 0, 99);
    const contentBottom = clamp(current.content_bottom_y + 1.2, top + 4, 99.2);
    const nextBoundary = next ? clamp(next.start_y - 1.1, top + 4, 99.2) : 99.2;

    // OCR이 실제 콘텐츠 끝을 잘 찾으면 불필요한 대형 여백을 제거한다.
    // 단, 다음 문항을 침범하지 않도록 다음 시작점 직전에서 강제로 막는다.
    const bottom = Math.min(Math.max(contentBottom, top + 5), nextBoundary);
    const col = columnRect(current.column);

    return {
      ...current,
      crop_x: col.x,
      crop_y: top,
      crop_width: col.width,
      crop_height: clamp(bottom - top, 4, 100 - top),
      crop_valid: bottom > top + 3 && current.content_bottom_y >= current.start_y,
    };
  });
}

function openAiError(status: number, body: string) {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    message = parsed.error?.message || body;
  } catch { /* plain text */ }
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
  schema: typeof layoutSchema | typeof analysisSchema;
  maxOutputTokens: number;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: args.model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: args.prompt },
          ...args.files.map(file_url => ({ type: "input_file", file_url })),
        ],
      }],
      text: { format: { type: "json_schema", name: args.schemaName, strict: true, schema: args.schema } },
      max_output_tokens: args.maxOutputTokens,
    }),
    signal: AbortSignal.timeout(280_000),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(openAiError(response.status, await response.text()));
  return await response.json() as OpenAiPayload;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  let analysisId: string | null = null;
  let jobId: string | null = null;

  try {
    const { sourceFileId } = await request.json() as { sourceFileId?: string };
    if (!sourceFileId) return NextResponse.json({ success: false, message: "시험지를 선택해 주세요." }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-5";
    if (!apiKey) return NextResponse.json({ success: false, message: "OPENAI_API_KEY가 없습니다." }, { status: 500 });

    const sourceResult = await supabase
      .from("source_files")
      .select("id,title,source,grade,subject,exam_pdf_path,solution_pdf_path")
      .eq("id", sourceFileId)
      .single();
    if (sourceResult.error || !sourceResult.data) return NextResponse.json({ success: false, message: "시험지를 찾을 수 없습니다." }, { status: 404 });
    const source = sourceResult.data;
    if (!source.exam_pdf_path || !source.solution_pdf_path) return NextResponse.json({ success: false, message: "시험지 PDF와 해설지 PDF가 모두 필요합니다." }, { status: 400 });

    let analysisResult = await supabase.from("source_analysis").select("*").eq("source_file_id", sourceFileId).maybeSingle();
    if (analysisResult.error) throw analysisResult.error;
    if (!analysisResult.data) {
      analysisResult = await supabase.from("source_analysis").insert({ source_file_id: sourceFileId }).select("*").single();
      if (analysisResult.error) throw analysisResult.error;
    }
    const analysis = analysisResult.data;
    analysisId = analysis.id;

    const startedAt = new Date().toISOString();
    const baseLogs = [{ at: startedAt, message: `OCR 우선 분석 시작 · ${model}` }];
    const job = await supabase.from("analysis_jobs").insert({
      analysis_id: analysis.id,
      job_type: "FULL_ANALYSIS",
      status: "RUNNING",
      progress: 5,
      started_at: startedAt,
      logs: baseLogs,
    }).select("*").single();
    if (job.error) throw job.error;
    jobId = job.data.id;

    await supabase.from("source_analysis").update({
      status: "RUNNING", progress: 5, current_step: "시험지 OCR 준비 중", started_at: startedAt,
      finished_at: null, updated_at: startedAt,
    }).eq("id", analysis.id);

    const sign = async (path: string) => {
      const signed = await supabase.storage.from("exam-pdf").createSignedUrl(path, 60 * 60);
      if (signed.error) throw signed.error;
      return signed.data.signedUrl;
    };
    const [examUrl, solutionUrl] = await Promise.all([sign(source.exam_pdf_path), sign(source.solution_pdf_path)]);

    await supabase.from("source_analysis").update({ progress: 15, current_step: "1차 OCR · 문항번호와 실제 영역 탐색 중" }).eq("id", analysis.id);

    const layoutPrompt = [
      "너는 한국 수학 시험지 OCR·레이아웃 판독기다.",
      "첨부된 파일은 시험지 PDF 한 개다. 정답·난이도·단원은 분석하지 않는다.",
      "시험지에 실제 인쇄된 문항 번호를 모두 찾는다. 머리말의 연도, 쪽수, 예제 번호, 해설 참조번호는 문항으로 세지 않는다.",
      "각 문항에 대해 page_no, column, start_y, content_bottom_y만 정확히 반환한다.",
      "column은 왼쪽 단 left, 오른쪽 단 right, 페이지 전체 폭 문항 full 중 하나다.",
      "start_y는 문항 번호와 첫 문장이 시작하는 가장 위 위치다.",
      "content_bottom_y는 해당 문항의 선택지·보기·표·그래프·도형까지 포함한 실제 인쇄 콘텐츠의 가장 아래 위치다.",
      "start_y와 content_bottom_y는 페이지 높이 기준 0~100 백분율이다. 0~1 비율값은 사용하지 않는다.",
      "큰 여백은 콘텐츠로 보지 않는다. 다음 문항 직전까지 무조건 늘리지 말고 실제 글자·수식·그림이 끝나는 곳을 찾는다.",
      "도형이 본문보다 아래에 있으면 반드시 도형 아래까지 content_bottom_y를 내려 잡는다.",
      "문항이 다음 페이지로 이어지는 특수한 경우에는 본문이 시작된 페이지를 기준으로 잡고 confidence를 낮춘다.",
      "번호 누락·중복 없이 실제 문항 순서대로 반환한다.",
      `시험지 정보: ${source.title} / ${source.grade ?? ""} / ${source.subject ?? ""}`,
    ].join("\n");

    const layoutRaw = await callOpenAi({
      apiKey, model, prompt: layoutPrompt, files: [examUrl],
      schemaName: "math_exam_ocr_layout", schema: layoutSchema, maxOutputTokens: 10000,
    });
    const layoutPayload = parseJson<{ questions: LayoutQuestion[] }>(layoutRaw);
    const crops = buildCrops(layoutPayload.questions);
    if (!crops.length) throw new Error("OCR이 문항 번호를 찾지 못했습니다.");

    await supabase.from("source_analysis").update({ progress: 55, current_step: `1차 OCR 완료 · ${crops.length}개 문항 · 2차 내용 분석 중` }).eq("id", analysis.id);

    const analysisPrompt = [
      "너는 한국 중·고등 수학 문항 분석 전문가다.",
      "첫 번째 PDF는 시험지, 두 번째 PDF는 해설지다.",
      "좌표나 문항 영역은 절대 판단하지 않는다. 문항번호별 내용 분석만 한다.",
      "시험지에 실제 존재하는 모든 문항을 번호순으로 분석한다.",
      "정답은 해설지의 정답표와 해당 해설을 교차 확인한다. 확인이 어려우면 빈 문자열로 둔다.",
      "객관식은 objective, 단답형·서술형은 subjective로 분류한다.",
      "unit은 선택 과목의 교육과정 단원명으로 구체적으로 쓴다.",
      "topic은 핵심 개념·발상·유형이 드러나도록 12~30자로 쓴다.",
      "difficulty는 하·중·상·최상 중 하나다.",
      "summary는 문제의 핵심 요구를 한 문장으로 요약한다.",
      "문항번호 누락·중복을 만들지 않는다.",
      `시험지 정보: ${source.title} / ${source.source ?? ""} / ${source.grade ?? ""} / ${source.subject ?? ""}`,
    ].join("\n");

    const analysisRaw = await callOpenAi({
      apiKey, model, prompt: analysisPrompt, files: [examUrl, solutionUrl],
      schemaName: "math_exam_content_analysis", schema: analysisSchema, maxOutputTokens: 16000,
    });
    const analysisPayload = parseJson<{ questions: AnalysisQuestion[] }>(analysisRaw);
    const analysisByNo = new Map(analysisPayload.questions.map(item => [Number(item.question_no), item]));

    await supabase.from("source_analysis").update({ progress: 80, current_step: "OCR 좌표와 문항 분석 결과 결합 중" }).eq("id", analysis.id);
    await supabase.from("analysis_questions").delete().eq("analysis_id", analysis.id);

    const rows = crops.map(crop => {
      const meta = analysisByNo.get(crop.question_no);
      const combinedConfidence = Math.min(crop.confidence, Number(meta?.confidence ?? 0.55));
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
        review_reason: crop.crop_valid ? null : "OCR 문항 영역을 확인해 주세요.",
        ai_result: {
          question_type: meta?.question_type ?? "unknown",
          subject: meta?.subject || source.subject || null,
          unit: meta?.unit || null,
          topic: meta?.topic || null,
          difficulty: meta?.difficulty ?? "중",
          summary: meta?.summary || null,
          ocr_layout: {
            column: crop.column,
            start_y: crop.start_y,
            content_bottom_y: crop.content_bottom_y,
          },
        },
      };
    });

    const inserted = await supabase.from("analysis_questions").insert(rows).select("id,question_no,answer,confidence,ai_result");
    if (inserted.error) throw inserted.error;

    const insertedQuestions = inserted.data ?? [];
    const reviewIds = insertedQuestions.filter(question => {
      const result = (question.ai_result ?? {}) as Record<string, unknown>;
      return Number(question.confidence ?? 0) < 0.82
        || !String(question.answer ?? "").trim()
        || !String(result.unit ?? "").trim()
        || !String(result.topic ?? "").trim()
        || String(result.question_type ?? "unknown") === "unknown";
    }).map(question => question.id);

    if (reviewIds.length) {
      const reviewUpdate = await supabase.from("analysis_questions").update({
        review_reason: "OCR 또는 AI 판단이 불확실합니다. 틀린 부분만 수정하세요.",
        updated_at: new Date().toISOString(),
      }).in("id", reviewIds);
      if (reviewUpdate.error) throw reviewUpdate.error;
    }

    const objectiveCount = analysisPayload.questions.filter(q => q.question_type === "objective").length;
    const subjectiveCount = analysisPayload.questions.filter(q => q.question_type === "subjective").length;
    const finishedAt = new Date().toISOString();
    const updated = await supabase.from("source_analysis").update({
      status: "REVIEW", progress: 100,
      current_step: `OCR 우선 분석 완료 · ${rows.length}개 문항 · 재확인 권장 ${reviewIds.length}개`,
      total_questions: rows.length, objective_count: objectiveCount, subjective_count: subjectiveCount,
      finished_at: finishedAt, updated_at: finishedAt,
    }).eq("id", analysis.id).select("*").single();
    if (updated.error) throw updated.error;

    const totalTokens = Number(layoutRaw.usage?.total_tokens ?? 0) + Number(analysisRaw.usage?.total_tokens ?? 0);
    await supabase.from("analysis_jobs").update({
      status: "DONE", progress: 100, finished_at: finishedAt, updated_at: finishedAt,
      logs: [...baseLogs, { at: finishedAt, message: `${rows.length}개 OCR·분석 완료${totalTokens ? ` · ${totalTokens.toLocaleString("ko-KR")} tokens` : ""}` }],
    }).eq("id", jobId);

    return NextResponse.json({
      success: true,
      analysis: updated.data,
      questionCount: rows.length,
      reviewPending: reviewIds.length,
      cropValidCount: crops.filter(crop => crop.crop_valid).length,
      cropInvalidCount: crops.filter(crop => !crop.crop_valid).length,
      mode: "OCR_FIRST_TWO_PASS",
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 분석에 실패했습니다.";
    const failedAt = new Date().toISOString();
    if (analysisId) await supabase.from("source_analysis").update({ status: "FAILED", progress: 0, current_step: message, updated_at: failedAt }).eq("id", analysisId);
    if (jobId) await supabase.from("analysis_jobs").update({ status: "FAILED", error_message: message, finished_at: failedAt, updated_at: failedAt }).eq("id", jobId);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
