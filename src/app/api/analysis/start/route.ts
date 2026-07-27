import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type AiQuestion = {
  question_no: number;
  answer: string;
  question_type: "objective" | "subjective" | "unknown";
  subject: string;
  unit: string;
  topic: string;
  difficulty: "하" | "중" | "상" | "최상";
  confidence: number;
  summary: string;
  page_no: number;
  crop_x: number;
  crop_y: number;
  crop_width: number;
  crop_height: number;
};

type AiPayload = {
  total_questions: number;
  questions: AiQuestion[];
};

type OpenAiPayload = {
  id?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["total_questions", "questions"],
  properties: {
    total_questions: { type: "integer", minimum: 1, maximum: 200 },
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
          "page_no",
          "crop_x",
          "crop_y",
          "crop_width",
          "crop_height",
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
          page_no: { type: "integer", minimum: 1, maximum: 500 },
          crop_x: { type: "number", minimum: 0, maximum: 100 },
          crop_y: { type: "number", minimum: 0, maximum: 100 },
          crop_width: { type: "number", exclusiveMinimum: 0, maximum: 100 },
          crop_height: { type: "number", exclusiveMinimum: 0, maximum: 100 },
        },
      },
    },
  },
} as const;

function getOutputText(payload: OpenAiPayload): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function parseJson(text: string): AiPayload {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as AiPayload;
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error("AI가 문항 목록을 반환하지 않았습니다.");
  }
  return parsed;
}


function clampPercent(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeCrop(question: AiQuestion) {
  let x = Number(question.crop_x);
  let y = Number(question.crop_y);
  let width = Number(question.crop_width);
  let height = Number(question.crop_height);

  // GPT가 백분율(0~100) 대신 비율(0~1) 좌표를 반환하는 경우가 있다.
  // 이 값을 그대로 CSS %로 쓰면 모든 박스가 좌측 상단에 아주 작게 몰린다.
  const looksLikeRatio =
    x >= 0 && y >= 0 && width > 0 && height > 0
    && x <= 1.2 && y <= 1.2 && width <= 1.2 && height <= 1.2;

  if (looksLikeRatio) {
    x *= 100;
    y *= 100;
    width *= 100;
    height *= 100;
  }

  x = clampPercent(x);
  y = clampPercent(y);
  width = clampPercent(width, 0.1);
  height = clampPercent(height, 0.1);

  // 페이지 밖으로 넘친 부분만 잘라낸다.
  width = Math.min(width, 100 - x);
  height = Math.min(height, 100 - y);

  const valid = width >= 8 && height >= 4 && x < 99 && y < 99;
  return { x, y, width, height, valid };
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

export async function POST(request: NextRequest) {
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
      return NextResponse.json(
        { success: false, message: "OPENAI_API_KEY가 없습니다. Vercel 환경변수를 저장한 뒤 재배포해 주세요." },
        { status: 500 },
      );
    }

    const { data: source, error: sourceError } = await supabase
      .from("source_files")
      .select("id,title,source,grade,subject,exam_pdf_path,solution_pdf_path")
      .eq("id", sourceFileId)
      .single();

    if (sourceError || !source) {
      return NextResponse.json({ success: false, message: "시험지를 찾을 수 없습니다." }, { status: 404 });
    }
    if (!source.exam_pdf_path || !source.solution_pdf_path) {
      return NextResponse.json({ success: false, message: "시험지 PDF와 해설지 PDF가 모두 필요합니다." }, { status: 400 });
    }

    let { data: analysis, error: analysisError } = await supabase
      .from("source_analysis")
      .select("*")
      .eq("source_file_id", sourceFileId)
      .maybeSingle();
    if (analysisError) throw analysisError;

    if (!analysis) {
      const created = await supabase
        .from("source_analysis")
        .insert({ source_file_id: sourceFileId })
        .select("*")
        .single();
      if (created.error) throw created.error;
      analysis = created.data;
    }
    analysisId = analysis.id;

    const startedAt = new Date().toISOString();
    const baseLogs = [{ at: startedAt, message: `AI 분석 시작 · ${model}` }];
    const createdJob = await supabase
      .from("analysis_jobs")
      .insert({
        analysis_id: analysis.id,
        job_type: "FULL_ANALYSIS",
        status: "RUNNING",
        progress: 10,
        started_at: startedAt,
        logs: baseLogs,
      })
      .select("*")
      .single();
    if (createdJob.error) throw createdJob.error;
    jobId = createdJob.data.id;

    await supabase
      .from("source_analysis")
      .update({
        status: "RUNNING",
        progress: 10,
        current_step: "시험지·해설지 PDF 준비 중",
        started_at: startedAt,
        finished_at: null,
        updated_at: startedAt,
      })
      .eq("id", analysis.id);

    const sign = async (path: string) => {
      const result = await supabase.storage.from("exam-pdf").createSignedUrl(path, 60 * 60);
      if (result.error) throw result.error;
      return result.data.signedUrl;
    };
    const [examUrl, solutionUrl] = await Promise.all([
      sign(source.exam_pdf_path),
      sign(source.solution_pdf_path),
    ]);

    await supabase
      .from("source_analysis")
      .update({ progress: 25, current_step: "GPT가 PDF를 읽고 문항을 분석하는 중", updated_at: new Date().toISOString() })
      .eq("id", analysis.id);

    const prompt = [
      "너는 한국 중·고등 수학 시험지 분석 전문가다.",
      "첫 번째 PDF는 시험지이고 두 번째 PDF는 해설지다.",
      "시험지에 실제 존재하는 모든 문항을 번호순으로 분석한다.",
      "정답은 반드시 해설지에서 확인하고, 확인이 어려우면 빈 문자열로 둔다.",
      "객관식은 objective, 단답형·서술형은 subjective로 분류한다.",
      "unit은 반드시 현재 선택된 과목의 교육과정 단원명으로 쓴다. 막연한 표현(수학, 계산, 함수 등)은 금지한다.",
      "topic은 학생이 실제로 사용해야 하는 핵심 개념·발상·문제 유형이 드러나도록 12~30자 안에서 구체적으로 쓴다.",
      "difficulty는 계산량, 개념 결합 수, 낯선 조건 해석, 풀이 단계 수를 함께 판단해 하·중·상·최상 중 하나로 분류한다.",
      "정답은 해설지의 정답표와 해당 해설을 교차 확인한다. 객관식은 ①~⑤ 중 하나, 주관식은 최종값만 쓴다.",
      "문항번호가 시험지와 해설지에서 일치하는지 반드시 확인하며, 중복 번호나 누락 번호를 만들지 않는다.",
      "confidence는 문항 위치, 문항번호, 정답, 단원, 유형, 난이도 판단을 종합한 신뢰도다. 하나라도 불확실하면 0.85 미만으로 낮춘다.",
      "summary는 문제의 핵심 요구를 한 문장으로 요약하되 풀이 전체를 쓰지 않는다.",
      "각 문항이 있는 시험지 페이지 번호와 문항 전체 영역을 페이지 기준 백분율 좌표로 반환한다.",
      "좌표는 반드시 0~100 숫자로 쓴다. 0~1 비율값은 절대 사용하지 않는다. 예: 페이지 왼쪽 8%, 위 12%, 폭 40%, 높이 18%이면 crop_x=8, crop_y=12, crop_width=40, crop_height=18이다.",
      "crop_x, crop_y는 왼쪽·위쪽 시작점이고 crop_width, crop_height는 선택지까지 포함한 전체 문항 크기다.",
      "문항 번호 바로 위에서 시작하고 다음 문항 번호 직전에서 끝나도록 하며, 선택지·보기·그래프·도형·표를 모두 포함한다.",
      "2단 편집 시험지는 각 단의 경계를 넘지 않게 자르고, 한 문항이 다음 페이지로 이어지면 실제 본문이 가장 많이 있는 페이지를 기준으로 잡는다.",
      "박스는 지나치게 넓거나 높게 잡지 말고 문항 콘텐츠 바깥 여백은 각 방향 1~2% 정도만 둔다.",
      `시험지 정보: ${source.title} / ${source.source ?? ""} / ${source.grade ?? ""} / ${source.subject ?? ""}`,
    ].join("\n");

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_file", file_url: examUrl },
              { type: "input_file", file_url: solutionUrl },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "math_exam_analysis",
            strict: true,
            schema: analysisSchema,
          },
        },
        max_output_tokens: 16000,
      }),
      signal: AbortSignal.timeout(280_000),
      cache: "no-store",
    });

    if (!openAiResponse.ok) {
      const detail = await openAiResponse.text();
      throw new Error(openAiError(openAiResponse.status, detail));
    }

    const aiRaw = await openAiResponse.json() as OpenAiPayload;
    const parsed = parseJson(getOutputText(aiRaw));
    const questions = parsed.questions
      .filter((question) => Number.isFinite(Number(question.question_no)))
      .sort((a, b) => Number(a.question_no) - Number(b.question_no));

    await supabase
      .from("source_analysis")
      .update({ progress: 75, current_step: "문항별 분석 결과 저장 중", updated_at: new Date().toISOString() })
      .eq("id", analysis.id);

    await supabase.from("analysis_questions").delete().eq("analysis_id", analysis.id);
    const normalizedQuestions = questions.map((question) => ({
      question,
      crop: normalizeCrop(question),
    }));

    const rows = normalizedQuestions.map(({ question, crop }) => ({
      analysis_id: analysis.id,
      question_no: Number(question.question_no),
      answer: question.answer.trim() || null,
      status: "APPROVED",
      confidence: Math.max(0, Math.min(1, Number(question.confidence))),
      page_no: Math.max(1, Number(question.page_no) || 1),
      crop_x: crop.x,
      crop_y: crop.y,
      crop_width: crop.width,
      crop_height: crop.height,
      review_reason: crop.valid ? null : "AI 문항 위치가 비정상입니다. 자르기 박스를 확인해 주세요.",
      ai_result: {
        question_type: question.question_type,
        subject: question.subject || source.subject || null,
        unit: question.unit || null,
        topic: question.topic || null,
        difficulty: question.difficulty,
        summary: question.summary || null,
      },
    }));

    const inserted = await supabase
      .from("analysis_questions")
      .insert(rows)
      .select("id,question_no,answer,status,confidence,ai_result,review_result");
    if (inserted.error) throw inserted.error;

    const insertedQuestions = (inserted.data ?? []) as Array<{ id:string; question_no:number; answer:string|null; confidence:number|null; ai_result:Record<string,unknown>|null }>;
    const invalidCropQuestionNos = new Set(
      normalizedQuestions
        .filter(({ crop }) => !crop.valid)
        .map(({ question }) => Number(question.question_no)),
    );

    const reviewQuestions = insertedQuestions.filter((question) => {
      const result = (question.ai_result ?? {}) as Record<string, unknown>;
      const questionNo = Number((question as { question_no?: number }).question_no);
      return invalidCropQuestionNos.has(questionNo)
        || Number(question.confidence ?? 0) < 0.85
        || !String(question.answer ?? "").trim()
        || !String(result.unit ?? "").trim()
        || !String(result.topic ?? "").trim()
        || String(result.question_type ?? "unknown") === "unknown";
    });

    if (reviewQuestions.length > 0) {
      const reviewIds = reviewQuestions.map((question) => question.id);
      const reviewUpdate = await supabase
        .from("analysis_questions")
        .update({
          review_reason: "AI 판단이 불확실한 항목이 있습니다. 틀린 부분만 수정하세요.",
          updated_at: new Date().toISOString(),
        })
        .in("id", reviewIds);
      if (reviewUpdate.error) throw reviewUpdate.error;
    }

    // 모든 문항은 기본 승인 상태다. 사용자는 잘못된 박스·정답·분류만 수정한다.
    // 실제 문항 이미지는 분석 직후 브라우저 작업장에서 자동 생성하고,
    // 문제은행 등록 직전에도 다시 생성해 수정된 박스를 반영한다.

    const objectiveCount = questions.filter((question) => question.question_type === "objective").length;
    const subjectiveCount = questions.filter((question) => question.question_type === "subjective").length;
    const finishedAt = new Date().toISOString();
    const updated = await supabase
      .from("source_analysis")
      .update({
        status: "REVIEW",
        progress: 100,
        current_step: reviewQuestions.length > 0
          ? `AI 분석 완료 · 전체 ${questions.length}개 기본확정 · 재확인 권장 ${reviewQuestions.length}개`
          : `AI 분석 완료 · 전체 ${questions.length}개 기본확정`,
        total_questions: questions.length,
        objective_count: objectiveCount,
        subjective_count: subjectiveCount,
        finished_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq("id", analysis.id)
      .select("*")
      .single();
    if (updated.error) throw updated.error;

    const usageText = aiRaw.usage?.total_tokens
      ? ` · ${aiRaw.usage.total_tokens.toLocaleString("ko-KR")} tokens`
      : "";
    await supabase
      .from("analysis_jobs")
      .update({
        status: "DONE",
        progress: 100,
        finished_at: finishedAt,
        updated_at: finishedAt,
        logs: [
          ...baseLogs,
          { at: finishedAt, message: `${questions.length}개 문항 분석 완료${usageText}` },
        ],
      })
      .eq("id", jobId);

    return NextResponse.json({
      success: true,
      analysis: updated.data,
      questionCount: questions.length,
      autoRegistered: 0,
      reviewPending: reviewQuestions.length,
      cropValidCount: normalizedQuestions.filter(({ crop }) => crop.valid).length,
      cropInvalidCount: normalizedQuestions.filter(({ crop }) => !crop.valid).length,
      model,
      responseId: aiRaw.id ?? null,
      usage: aiRaw.usage ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 분석에 실패했습니다.";
    const failedAt = new Date().toISOString();
    if (analysisId) {
      await supabase
        .from("source_analysis")
        .update({ status: "FAILED", progress: 0, current_step: message, updated_at: failedAt })
        .eq("id", analysisId);
    }
    if (jobId) {
      await supabase
        .from("analysis_jobs")
        .update({ status: "FAILED", error_message: message, finished_at: failedAt, updated_at: failedAt })
        .eq("id", jobId);
    }
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
