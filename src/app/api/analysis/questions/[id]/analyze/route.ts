import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { PROBLEM_DNA_VERSION, legacyFieldsFromDNA, problemDnaQuestionSchema, validateProblemDNA, type ProblemDNA } from "@/lib/problem-dna";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const dnaSchema = problemDnaQuestionSchema;

type OpenAiPayload = {
  id?: string;
  status?: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output_text?: string;
  output?: Array<{
    type?: string;
    status?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
};

function extractOutputText(payload: OpenAiPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => {
      if (typeof content.text === "string") return content.text;
      if (typeof content.refusal === "string") return content.refusal;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function responseDiagnostic(payload: OpenAiPayload): string {
  const outputTypes = (payload.output ?? []).map((item) => item.type ?? "unknown").join(",") || "none";
  const reason = payload.incomplete_details?.reason;
  const apiError = payload.error?.message;
  return [
    `status=${payload.status ?? "unknown"}`,
    reason ? `incomplete=${reason}` : "",
    apiError ? `error=${apiError}` : "",
    `output=${outputTypes}`,
    payload.id ? `response_id=${payload.id}` : "",
  ].filter(Boolean).join(" · ");
}

function parseJsonObject(text: string): Record<string, any> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!cleaned) throw new Error("AI 분석 결과가 비어 있습니다.");

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error(`AI 분석 결과에서 JSON을 찾을 수 없습니다. 응답 앞부분: ${cleaned.slice(0, 240)}`);
  }
}

async function requestDna(args: {
  apiKey: string;
  model: string;
  prompt: string;
  questionImageUrl: string;
  structured: boolean;
}) {
  const content: Array<Record<string, unknown>> = [
    { type: "input_text", text: args.prompt },
    { type: "input_image", image_url: args.questionImageUrl, detail: "high" },
  ];

  const body: Record<string, unknown> = {
    model: args.model,
    input: [{ role: "user", content }],
    reasoning: { effort: "low" },
    max_output_tokens: 12000,
    store: false,
  };

  body.text = args.structured
    ? { format: { type: "json_schema", name: "problem_dna_v2", strict: true, schema: dnaSchema } }
    : { format: { type: "json_object" } };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(100_000),
    cache: "no-store",
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI 문항 분석 실패 (${response.status}): ${raw.slice(0, 1200)}`);
  }

  let payload: OpenAiPayload;
  try {
    payload = JSON.parse(raw) as OpenAiPayload;
  } catch {
    throw new Error(`OpenAI 응답 본문이 완전한 JSON이 아닙니다: ${raw.slice(0, 400)}`);
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error(`AI 분석 결과가 비어 있습니다. ${responseDiagnostic(payload)}`);
  }

  return parseJsonObject(outputText);
}

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_ANALYSIS_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";
    if (!apiKey) return NextResponse.json({ success: false, message: "OPENAI_API_KEY가 없습니다." }, { status: 500 });

    const supabase = createClient();
    const questionResult = await supabase
      .from("analysis_questions")
      .select("id,analysis_id,question_no,answer,question_image_path,ai_result,review_result")
      .eq("id", id)
      .single();
    if (questionResult.error || !questionResult.data) throw questionResult.error ?? new Error("문항을 찾을 수 없습니다.");

    const question = questionResult.data as any;
    const analysisResult = await supabase.from("source_analysis").select("source_file_id").eq("id", question.analysis_id).single();
    if (analysisResult.error || !analysisResult.data) throw analysisResult.error ?? new Error("분석 정보를 찾을 수 없습니다.");
    const sourceResult = await supabase
      .from("source_files")
      .select("title,grade,subject")
      .eq("id", analysisResult.data.source_file_id)
      .single();
    if (sourceResult.error) throw sourceResult.error;
    if (!question.question_image_path) {
      return NextResponse.json({ success: false, message: "문항 이미지가 없습니다. 먼저 문항 자르기를 저장해 주세요." }, { status: 400 });
    }

    const signed = await supabase.storage.from("question-images").createSignedUrl(question.question_image_path, 60 * 10);
    if (signed.error) throw signed.error;

    const source = sourceResult.data;
    const prompt = `당신은 한국 중고등 수학 문항을 교육적으로 분석하는 MathPooh Problem DNA 엔진입니다.
첨부된 한 문항 이미지만 분석하여 ${PROBLEM_DNA_VERSION} JSON을 생성하세요.
시험지 정보: ${source?.grade ?? "학년 미상"} / ${source?.subject ?? "과목 미상"} / ${source?.title ?? "제목 미상"}
문항 번호: ${question.question_no}

원칙:
- schema_version은 반드시 ${PROBLEM_DNA_VERSION}, question_no는 ${question.question_no}입니다.
- basic은 과목·학년·교육과정·대/중/소단원·세부주제·문항형식을 분류합니다.
- concept는 핵심/보조/선수/연결개념, 공식·정리, 개념순서, 직접·변형·역방향·유도·결합 적용을 기록합니다.
- thinking은 첫 진입점, 풀이단계, 요구사고, 표현전환, 핵심발상, 결정적 단계, 검산법을 기록합니다.
- calculation과 difficulty의 점수는 0~100이며, estimated_minutes는 숙련된 해당 학년 학생 기준입니다.
- expected_errors와 traps는 실제 문항 근거가 있는 항목만 기록합니다.
- 모든 EvidenceTag는 tag, 구체적 evidence, confidence를 포함합니다.
- educational_value에는 대표성, 교육가치, 변형가능성, 재출제가능성, 내신/모의/수능 적합도와 훈련목표를 기록합니다.
- 이미지에 정답이 없으면 answer는 빈 문자열입니다. 보이지 않는 내용을 추측하지 않습니다.
- 불확실하면 summary.review_required=true로 두고 review_reasons를 씁니다.
- 설명이나 코드블록 없이 JSON 객체 하나만 출력합니다.`;

    let dna: ProblemDNA;
    try {
      dna = await requestDna({
        apiKey, model, prompt, questionImageUrl: signed.data.signedUrl, structured: true,
      }) as unknown as ProblemDNA;
    } catch (firstError) {
      dna = await requestDna({
        apiKey, model,
        prompt: `${prompt}
이전 응답 생성에 실패했습니다. 모든 필드를 포함한 JSON 객체 하나만 출력하세요.`,
        questionImageUrl: signed.data.signedUrl, structured: false,
      }).then((value) => value as unknown as ProblemDNA).catch((secondError) => {
        const first = firstError instanceof Error ? firstError.message : String(firstError);
        const second = secondError instanceof Error ? secondError.message : String(secondError);
        throw new Error(`문항 분석 2회 실패: 1차 ${first} / 2차 ${second}`);
      });
    }

    const validation = validateProblemDNA(dna);
    const legacy = validation.valid && validation.dna ? legacyFieldsFromDNA(validation.dna) : {
      question_type: "unknown", subject: source?.subject ?? "", unit: "", topic: "", difficulty: "중", summary: "",
    };
    const aiResult = {
      ...(question.ai_result ?? {}),
      ...legacy,
      problem_dna: dna,
      analysis_version: PROBLEM_DNA_VERSION,
      analysis_model: model,
      analyzed_at: new Date().toISOString(),
    };

    const confidence = Number(dna.summary?.ai_confidence);
    const normalizedConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
    const finalAnswer = typeof dna.answer === "string" ? dna.answer.trim() : String(question.answer ?? "").trim();
    const autoPass =
      normalizedConfidence >= 0.86 &&
      Boolean(finalAnswer) &&
      validation.valid &&
      !dna.summary.review_required &&
      Boolean(String(legacy.unit ?? "").trim()) &&
      Boolean(String(legacy.topic ?? "").trim()) &&
      String(legacy.question_type ?? "unknown") !== "unknown";

    const patch: Record<string, unknown> = {
      ai_result: aiResult,
      analysis_version: PROBLEM_DNA_VERSION,
      dna_valid: validation.valid,
      dna_validation_errors: validation.errors,
      confidence: normalizedConfidence,
      status: autoPass ? "AUTO_REGISTERED" : "REVIEW",
      review_reason: autoPass ? null : (dna.summary?.review_reasons?.join(" · ") || validation.errors.join(" · ") || "자동 판정 기준을 통과하지 못해 검토대상으로 보류되었습니다."),
      updated_at: new Date().toISOString(),
    };
    if (finalAnswer) patch.answer = finalAnswer;

    const updated = await supabase.from("analysis_questions").update(patch).eq("id", id).select("*").single();
    if (updated.error) throw updated.error;

    return NextResponse.json({ success: true, question: updated.data, dna });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "문항 AI 분석에 실패했습니다." }, { status: 500 });
  }
}
