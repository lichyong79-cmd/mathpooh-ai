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
      minItems: 0,
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


async function getPdfPageCount(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`시험지 PDF 페이지 수 확인 실패 (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes });
  const pdf = await task.promise;
  try {
    return Math.max(1, Number(pdf.numPages) || 1);
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}

function pageRanges(pageCount: number, batchSize = 2) {
  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = 1; start <= pageCount; start += batchSize) {
    ranges.push({ start, end: Math.min(pageCount, start + batchSize - 1) });
  }
  return ranges;
}

function missingQuestionNumbers(items: AiCropQuestion[]) {
  const numbers = [...new Set(items.map((item) => Math.trunc(Number(item.question_no))).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  if (!numbers.length) return [];
  const missing: number[] = [];
  for (let n = 1; n <= numbers[numbers.length - 1]; n++) {
    if (!numbers.includes(n)) missing.push(n);
  }
  return missing;
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
  schema: typeof cropSchema;
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
    const body = (await request.json()) as {
      sourceFileId?: string;
      force?: boolean;
      mode?: "recognition-only";
    };
    const sourceFileId = String(body.sourceFileId ?? "").trim();
    const force = body.force === true;

    if (!sourceFileId) {
      return NextResponse.json(
        { success: false, message: "시험지를 선택해 주세요." },
        { status: 400 },
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
    if (!source.exam_pdf_path) {
      return NextResponse.json(
        { success: false, message: "문제인식에는 시험지 PDF가 필요합니다." },
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

    // API 비용 절감 가드:
    // 이미 정상 분석된 문항이 있으면 사용자가 명시적으로 force=true를 보내지 않는 한
    // OpenAI를 다시 호출하지 않고 저장된 분석을 그대로 재사용합니다.
    if (!force && ["REVIEW", "DONE", "completed", "APPROVED"].includes(String(analysis.status ?? ""))) {
      const existingQuestions = await supabase
        .from("analysis_questions")
        .select("id,question_no,status,confidence,review_reason,ai_result", { count: "exact" })
        .eq("analysis_id", analysis.id)
        .order("question_no");

      if (existingQuestions.error) throw existingQuestions.error;

      const savedQuestions = existingQuestions.data ?? [];
      if (savedQuestions.length > 0) {
        const reviewPending = savedQuestions.filter((question) => {
          const result = (question.ai_result ?? {}) as Record<string, unknown>;
          return (
            Boolean(question.review_reason) ||
            Number(question.confidence ?? 0) < 0.82 ||
            !String(result.unit ?? "").trim() ||
            !String(result.topic ?? "").trim() ||
            String(result.question_type ?? "unknown") === "unknown"
          );
        }).length;

        return NextResponse.json({
          success: true,
          reused: true,
          apiCalled: false,
          analysisId: analysis.id,
          questionCount: savedQuestions.length,
          reviewPending,
          message: `기존 AI 분석 ${savedQuestions.length}문항을 재사용했습니다. API 호출 0회`,
        });
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-5";
    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: "OPENAI_API_KEY가 없습니다." },
        { status: 500 },
      );
    }

    const startedAt = new Date().toISOString();
    const baseLogs = [{ at: startedAt, message: `1단계 AI 문제인식 시작 · ${model}` }];

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
        current_step: "1단계 · AI 문제인식 진행 중",
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

    const examUrl = await sign(source.exam_pdf_path);

    await supabase
      .from("source_analysis")
      .update({
        progress: 15,
        current_step: "1단계 · 문항번호와 위치 인식 중",
      })
      .eq("id", analysis.id);

    const cropPrompt = [
      "너는 한국 수학 시험지의 문항번호와 대략적인 문항 위치를 찾는 비전 판독기다.",
      "첨부된 시험지 PDF를 페이지 이미지처럼 보고, 실제 문항마다 번호·페이지·검수용 영역을 찾는다.",
      "이 단계에서는 정답, 단원, 유형, 난이도, 풀이, 문제 DNA를 분석하지 않는다.",
      "반환 좌표는 관리자가 문항 존재와 위치를 확인하기 위한 1단계 인식 좌표이며 최종 이미지 자르기는 다음 단계에서 별도로 처리한다.",
      "PDF 텍스트 좌표, 고정 단 너비, 다음 문항 위치 공식 같은 규칙을 사용하지 말고 보이는 인쇄물 자체를 판단한다.",
      "각 문항에 대해 page_no와 인식 영역 crop_x, crop_y, crop_width, crop_height를 반환한다.",
      "좌표와 크기는 해당 PDF 페이지 전체를 기준으로 한 0~100 백분율이다.",
      "crop_x와 crop_y는 사각형의 왼쪽 위, crop_width와 crop_height는 그 지점부터의 폭과 높이다.",
      "문항번호, 본문, 모든 수식, 보기, 선택지, 표, 그래프, 도형을 빠짐없이 포함한다.",
      "분수의 분자, 근호, 지수처럼 문항번호보다 위로 올라간 수식도 절대 잘리지 않게 포함한다.",
      "해당 문항과 연결된 도형이 옆이나 아래에 있으면 같은 사각형 안에 포함한다.",
      "다른 문항의 번호나 본문은 포함하지 않는다.",
      "페이지 머리말, 시험 제목, 이름란, 쪽번호, 출판사 문구, 저작권 문구, 바닥 장식은 포함하지 않는다.",
      "1단, 2단, 전체 폭 문항을 화면에 보이는 실제 배치대로 각각 판단한다.",
      "문항 사이 여백은 조금 포함해도 되지만, 다음 문항이 들어올 정도로 크게 잡지 않는다.",
      "문항이 한 페이지를 넘어가면 시작 페이지의 영역을 잡고 confidence를 낮추며 review_reason에 이유를 쓴다.",
      "확실하면 review_reason은 빈 문자열로 둔다.",
      "실제 문항번호를 누락하거나 중복하지 말고 번호순으로 반환한다.",
      `시험지 정보: ${source.title} / ${source.grade ?? ""} / ${source.subject ?? ""}`,
    ].join("\n");

    // SOS287: PDF 전체 1회 인식은 후반 페이지를 통째로 누락할 수 있었다.
    // 실제 페이지 수를 먼저 확인하고 2페이지씩 명시적으로 끝까지 훑은 뒤 결과를 합친다.
    const pdfPageCount = await getPdfPageCount(examUrl);
    const ranges = pageRanges(pdfPageCount, 2);
    const recognized: AiCropQuestion[] = [];
    const recognitionWarnings: string[] = [];
    let totalTokens = 0;

    for (let index = 0; index < ranges.length; index++) {
      const range = ranges[index];
      await supabase
        .from("source_analysis")
        .update({
          progress: Math.min(75, 15 + Math.round(((index + 1) / ranges.length) * 55)),
          current_step: `1단계 · PDF ${range.start}~${range.end}/${pdfPageCount}페이지 문항 인식 중`,
        })
        .eq("id", analysis.id);

      const rangePrompt = [
        cropPrompt,
        "",
        `[이번 호출의 필수 검사 범위] PDF ${range.start}페이지부터 ${range.end}페이지까지만 검사한다.`,
        "첨부 PDF 전체가 보이더라도 위 페이지 범위를 첫 줄부터 마지막 줄까지 끝까지 확인한다.",
        "범위 안에 보이는 모든 실제 문항번호를 빠짐없이 반환한다. 범위 밖 페이지의 문항은 반환하지 않는다.",
        "page_no는 첨부 PDF의 원래 페이지 번호를 그대로 사용한다.",
        "이 호출에서 문항이 전혀 없는 페이지가 있으면 그 페이지는 억지로 만들지 않아도 된다.",
      ].join("\n");

      const raw = await callOpenAi({
        apiKey,
        model,
        prompt: rangePrompt,
        files: [examUrl],
        schemaName: `math_exam_recognition_p${range.start}_${range.end}`,
        schema: cropSchema,
        maxOutputTokens: 10000,
      });
      totalTokens += Number(raw.usage?.total_tokens ?? 0);

      const payload = parseJson<{ questions: AiCropQuestion[] }>(raw);
      const inRange = (payload.questions ?? []).filter((item) => {
        const page = Math.trunc(Number(item.page_no));
        return page >= range.start && page <= range.end;
      });
      if (!inRange.length) {
        recognitionWarnings.push(`${range.start}~${range.end}페이지에서 문항이 인식되지 않음`);
      }
      recognized.push(...inRange);
    }

    let crops = normalizeAiCrops(recognized);
    if (!crops.length) throw new Error("AI가 문항 영역을 찾지 못했습니다.");

    // 번호 중간 누락은 한 번 더 전체 PDF에서 해당 번호만 표적 복구한다.
    let missingNumbers = missingQuestionNumbers(crops);
    if (missingNumbers.length) {
      const recoveryPrompt = [
        cropPrompt,
        "",
        `[누락 번호 복구] 1차 페이지별 인식에서 다음 문항번호가 빠졌다: ${missingNumbers.join(", ")}.`,
        "첨부 PDF 전체에서 위 번호가 실제로 존재하는지 찾아라.",
        "실제로 보이는 누락 번호만 반환하고, 추측해서 문항을 만들지 마라.",
        "찾은 경우 원래 PDF page_no와 정확한 영역을 반환한다.",
      ].join("\n");
      const recoveryRaw = await callOpenAi({
        apiKey,
        model,
        prompt: recoveryPrompt,
        files: [examUrl],
        schemaName: "math_exam_recognition_gap_recovery",
        schema: cropSchema,
        maxOutputTokens: 8000,
      });
      totalTokens += Number(recoveryRaw.usage?.total_tokens ?? 0);
      const recovery = parseJson<{ questions: AiCropQuestion[] }>(recoveryRaw);
      crops = normalizeAiCrops([...crops, ...(recovery.questions ?? [])]);
      missingNumbers = missingQuestionNumbers(crops);
    }

    const recognizedPages = new Set(crops.map((crop) => crop.page_no));
    const lastPageHasQuestion = recognizedPages.has(pdfPageCount);
    if (!lastPageHasQuestion) {
      recognitionWarnings.push(`마지막 ${pdfPageCount}페이지에서 문항이 확인되지 않음 — 빈 페이지인지 사람 확인 필요`);
    }
    if (missingNumbers.length) {
      recognitionWarnings.push(`문항번호 연속성 확인 실패: ${missingNumbers.join(", ")}번 누락`);
    }
    const recognitionNeedsReview = recognitionWarnings.length > 0;

    await supabase
      .from("source_analysis")
      .update({
        progress: 80,
        current_step: `1단계 · ${crops.length}개 문항 인식 결과 저장 중`,
      })
      .eq("id", analysis.id);

    await supabase.from("analysis_questions").delete().eq("analysis_id", analysis.id);

    const rows = crops.map((crop) => {
      const cropNeedsReview =
        crop.confidence < 0.82 || Boolean(crop.review_reason.trim());

      return {
        analysis_id: analysis.id,
        question_no: crop.question_no,
        answer: null,
        status: "WAITING",
        confidence: crop.confidence,
        page_no: crop.page_no,
        crop_x: crop.crop_x,
        crop_y: crop.crop_y,
        crop_width: crop.crop_width,
        crop_height: crop.crop_height,
        review_reason: cropNeedsReview
          ? crop.review_reason || "AI가 자른 문항 영역을 확인해 주세요."
          : null,
        ai_result: {
          recognition_engine: "AI_PAGE_BATCH_V2",
          recognition_pdf_pages: pdfPageCount,
          recognition_needs_review: recognitionNeedsReview,
          recognition_warnings: recognitionWarnings,
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
        return (
          Boolean(question.review_reason) ||
          Number(question.confidence ?? 0) < 0.82
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

    const finishedAt = new Date().toISOString();
    const updated = await supabase
      .from("source_analysis")
      .update({
        status: recognitionNeedsReview ? "REVIEW" : "WAITING",
        progress: 100,
        current_step: recognitionNeedsReview
          ? `1단계 · 문제인식 검토필요 · ${rows.length}개 문항 · ${recognitionWarnings.join(" / ")}`
          : `1단계 · AI 문제인식 완료 · ${rows.length}개 문항 · PDF ${pdfPageCount}페이지 전수확인 · 위치 재확인 ${reviewIds.length}개`,
        total_questions: rows.length,
        objective_count: 0,
        subjective_count: 0,
        finished_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq("id", analysis.id)
      .select("*")
      .single();

    if (updated.error) throw updated.error;

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
            message: `${rows.length}개 1단계 문제인식 완료 · PDF ${pdfPageCount}페이지 전수확인${
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
      reused: false,
      apiCalled: true,
      analysis: updated.data,
      questionCount: rows.length,
      reviewPending: reviewIds.length,
      cropValidCount: crops.filter((crop) => crop.confidence >= 0.82).length,
      cropInvalidCount: crops.filter((crop) => crop.confidence < 0.82).length,
      mode: "AI_PAGE_BATCH_V2",
      pdfPageCount,
      recognitionComplete: !recognitionNeedsReview,
      recognitionWarnings,
      missingQuestionNumbers: missingNumbers,
      model,
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
