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
      "unit은 교육과정상의 단원명, topic은 해당 문항의 핵심 유형을 짧게 쓴다.",
      "difficulty는 하·중·상·최상 중 하나다.",
      "confidence는 정답 및 분류 전체에 대한 신뢰도를 0~1로 표시한다.",
      "summary는 문제의 핵심 요구를 한 문장으로 요약하되 풀이 전체를 쓰지 않는다.",
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
              { type: "input_file", file_url: examUrl, filename: "exam.pdf" },
              { type: "input_file", file_url: solutionUrl, filename: "solution.pdf" },
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
    const rows = questions.map((question) => ({
      analysis_id: analysis.id,
      question_no: Number(question.question_no),
      answer: question.answer.trim() || null,
      status: "REVIEW",
      confidence: Math.max(0, Math.min(1, Number(question.confidence))),
      ai_result: {
        question_type: question.question_type,
        subject: question.subject || source.subject || null,
        unit: question.unit || null,
        topic: question.topic || null,
        difficulty: question.difficulty,
        summary: question.summary || null,
      },
    }));

    const inserted = await supabase.from("analysis_questions").insert(rows);
    if (inserted.error) throw inserted.error;

    const objectiveCount = questions.filter((question) => question.question_type === "objective").length;
    const subjectiveCount = questions.filter((question) => question.question_type === "subjective").length;
    const finishedAt = new Date().toISOString();
    const updated = await supabase
      .from("source_analysis")
      .update({
        status: "REVIEW",
        progress: 100,
        current_step: "AI 분석 완료 · 검수 필요",
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
