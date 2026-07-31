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

function normalizeAnswer(value: unknown, format: unknown) {
  const raw = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (!raw) return "";
  if (format === "objective") {
    const circled: Record<string, string> = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5" };
    if (circled[raw]) return circled[raw];
    const match = raw.match(/(?:정답|답|선지)?\s*[:：]?\s*([1-5])/);
    return match?.[1] ?? raw;
  }
  return raw.replace(/^(?:정답|답)\s*[:：]\s*/i, "");
}

function missingDnaClassification(dna: ProblemDNA) {
  const fields: Array<[string, unknown]> = [
    ["과목", dna.basic?.subject],
    ["학년", dna.basic?.grade],
    ["교육과정", dna.basic?.curriculum],
    ["대단원", dna.basic?.major_unit],
    ["중단원", dna.basic?.middle_unit],
    ["소단원", dna.basic?.minor_unit],
    ["세부주제", dna.basic?.detailed_topic],
    ["문항형식", dna.basic?.question_format],
    ["난이도", dna.difficulty?.overall_level],
    ["문항요약", dna.summary?.one_line],
  ];
  const missing = fields
    .filter(([, value]) => !String(value ?? "").trim() || value === "unknown")
    .map(([label]) => label);
  if (!Array.isArray(dna.basic?.problem_types) || dna.basic.problem_types.length === 0) missing.push("문항유형");
  if (!Array.isArray(dna.concept?.core_concepts) || dna.concept.core_concepts.length === 0) missing.push("핵심개념");
  return missing;
}

async function requestDna(args: {
  apiKey: string;
  model: string;
  prompt: string;
  questionImageUrl: string;
  solutionPdfUrl?: string | null;
  structured: boolean;
}) {
  const content: Array<Record<string, unknown>> = [
    { type: "input_text", text: args.prompt },
    { type: "input_image", image_url: args.questionImageUrl, detail: "high" },
  ];
  if (args.solutionPdfUrl) {
    content.push({ type: "input_file", file_url: args.solutionPdfUrl });
  }

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
      .select("title,grade,subject,solution_pdf_path")
      .eq("id", analysisResult.data.source_file_id)
      .single();
    if (sourceResult.error) throw sourceResult.error;
    if (!question.question_image_path) {
      return NextResponse.json({ success: false, message: "문항 이미지가 없습니다. 먼저 문항 자르기를 저장해 주세요." }, { status: 400 });
    }

    const signed = await supabase.storage.from("question-images").createSignedUrl(question.question_image_path, 60 * 10);
    if (signed.error) throw signed.error;

    const source = sourceResult.data;
    let solutionPdfUrl: string | null = null;
    if (source?.solution_pdf_path) {
      const solutionSigned = await supabase.storage.from("exam-pdf").createSignedUrl(source.solution_pdf_path, 60 * 10);
      if (solutionSigned.error) throw solutionSigned.error;
      solutionPdfUrl = solutionSigned.data.signedUrl;
    }
    const prompt = `당신은 한국 중고등 수학 문항을 직접 풀고 교육적으로 분류하는 MathPooh Problem DNA 엔진입니다.
첫 번째 첨부는 분석할 한 문항 이미지입니다.${solutionPdfUrl ? " 두 번째 첨부는 이 시험지의 공식 해설 PDF입니다." : " 공식 해설 PDF는 첨부되지 않았습니다."}
문항 이미지와 공식 해설을 함께 확인하여 ${PROBLEM_DNA_VERSION} JSON을 생성하세요.
시험지 정보: ${source?.grade ?? "학년 미상"} / ${source?.subject ?? "과목 미상"} / ${source?.title ?? "제목 미상"}
문항 번호: ${question.question_no}

원칙:
- schema_version은 반드시 ${PROBLEM_DNA_VERSION}, question_no는 ${question.question_no}입니다.
- 먼저 문항을 끝까지 직접 풀어 정답을 산출한 뒤 나머지 분석을 수행합니다.
- 공식 해설 PDF가 있으면 반드시 그 안에서 ${question.question_no}번의 정답과 풀이를 찾아 직접 푼 결과와 교차 검증합니다. 다른 문항의 해설을 사용하면 안 됩니다.
- thinking.solution_steps와 intention.expected_solution_path에는 공식 해설의 핵심 풀이 흐름을 짧게 재구성해 기록합니다. 원문을 길게 복사하지 않습니다.
- 공식 해설에서 ${question.question_no}번을 찾지 못하거나 직접 푼 정답과 공식 정답이 충돌하면 summary.review_required=true로 하고 review_reasons에 그 사실을 기록합니다.
- 객관식 answer는 선지 번호 1~5 중 하나만, 단답형은 최종 답만 간결하게 기록합니다.
- 문항 일부가 잘렸거나 글자가 불명확해서 정답을 확정할 수 없을 때만 answer를 빈 문자열로 두고 review_required=true로 설정합니다.
- 풀이가 가능하지만 단순히 정답표가 이미지에 없다는 이유로 answer를 비우지 않습니다.
- basic은 과목·학년·교육과정·대/중/소단원·세부주제·문항형식을 분류합니다.
- concept는 핵심/보조/선수/연결개념, 공식·정리, 개념순서, 직접·변형·역방향·유도·결합 적용을 기록합니다.
- thinking은 첫 진입점, 풀이단계, 요구사고, 표현전환, 핵심발상, 결정적 단계, 검산법을 기록합니다.
- calculation과 difficulty의 점수는 0~100이며, estimated_minutes는 숙련된 해당 학년 학생 기준입니다.
- expected_errors와 traps는 실제 문항 근거가 있는 항목만 기록합니다.
- 모든 EvidenceTag는 tag, 구체적 evidence, confidence를 포함합니다.
- educational_value에는 대표성, 교육가치, 변형가능성, 재출제가능성, 내신/모의/수능 적합도와 훈련목표를 기록합니다.
- ai_confidence는 정답 산출과 분류 결과를 함께 고려합니다. 정답이 불확실하면 0.82 미만으로 설정합니다.
- 잘림, 판독 불가, 복수정답 가능성, 정답 확신 부족, 단원 분류 불확실 중 하나라도 있으면 summary.review_required=true로 두고 review_reasons에 구체적으로 씁니다.
- 설명이나 코드블록 없이 JSON 객체 하나만 출력합니다.`;

    let dna: ProblemDNA;
    try {
      dna = await requestDna({
        apiKey, model, prompt, questionImageUrl: signed.data.signedUrl, solutionPdfUrl, structured: true,
      }) as unknown as ProblemDNA;
    } catch (firstError) {
      dna = await requestDna({
        apiKey, model,
        prompt: `${prompt}
이전 응답 생성에 실패했습니다. 모든 필드를 포함한 JSON 객체 하나만 출력하세요.`,
        questionImageUrl: signed.data.signedUrl, solutionPdfUrl, structured: false,
      }).then((value) => value as unknown as ProblemDNA).catch((secondError) => {
        const first = firstError instanceof Error ? firstError.message : String(firstError);
        const second = secondError instanceof Error ? secondError.message : String(secondError);
        throw new Error(`문항 분석 2회 실패: 1차 ${first} / 2차 ${second}`);
      });
    }

    const validation = validateProblemDNA(dna);
    const officialSolutionIssues = (Array.isArray(dna.summary?.review_reasons) ? dna.summary.review_reasons : [])
      .map((value) => String(value).trim())
      .filter((value) => /공식|해설|정답.*(?:불일치|충돌)|(?:불일치|충돌).*정답/.test(value));
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
      official_solution: {
        connected: Boolean(solutionPdfUrl),
        source_path: source?.solution_pdf_path ?? null,
        question_no: question.question_no,
        verification: !solutionPdfUrl
          ? "official_pdf_missing"
          : officialSolutionIssues.length
            ? "official_pdf_review_required"
            : "official_pdf_cross_checked",
        issues: officialSolutionIssues,
      },
    };

    const confidence = Number(dna.summary?.ai_confidence);
    const normalizedConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
    const finalAnswer = normalizeAnswer(dna.answer, dna.basic?.question_format) || String(question.answer ?? "").trim();
    const missingClassification = missingDnaClassification(dna);
    const classificationMissing = missingClassification.length > 0;
    const reviewReasons = [
      ...validation.errors,
      ...(Array.isArray(dna.summary?.review_reasons) ? dna.summary.review_reasons : []),
      ...(!finalAnswer ? ["AI가 정답을 확정하지 못했습니다."] : []),
      ...(normalizedConfidence < 0.82 ? [`AI 신뢰도 ${Math.round(normalizedConfidence * 100)}%로 자동 통과 기준 82% 미만입니다.`] : []),
      ...(classificationMissing ? [`필수 문항분류가 비어 있습니다: ${missingClassification.join(", ")}`] : []),
      ...(!solutionPdfUrl ? ["공식 해설 PDF가 연결되지 않아 정답·풀이 교차 검증이 필요합니다."] : []),
    ].map((value) => String(value).trim()).filter(Boolean);
    const uniqueReviewReasons = [...new Set(reviewReasons)];
    const autoPass =
      normalizedConfidence >= 0.82 &&
      Boolean(finalAnswer) &&
      validation.valid &&
      !dna.summary.review_required &&
      !classificationMissing &&
      Boolean(solutionPdfUrl);

    const patch: Record<string, unknown> = {
      ai_result: aiResult,
      confidence: normalizedConfidence,
      status: autoPass ? "AUTO_REGISTERED" : "REVIEW",
      review_reason: autoPass ? null : (uniqueReviewReasons.join(" · ") || "자동 판정 기준을 통과하지 못해 검토대상으로 보류되었습니다."),
      analysis_version: PROBLEM_DNA_VERSION,
      dna_valid: validation.valid,
      dna_validation_errors: validation.errors,
      updated_at: new Date().toISOString(),
    };
    if (finalAnswer) patch.answer = finalAnswer;

    let updated = await supabase.from("analysis_questions").update(patch).eq("id", id).select("*").single();
    if (updated.error && /analysis_version|dna_valid|dna_validation_errors|schema cache/i.test(updated.error.message)) {
      // Problem DNA 확장 SQL을 아직 적용하지 않은 기존 DB에서도 기본 분석은 중단하지 않는다.
      const { analysis_version: _version, dna_valid: _valid, dna_validation_errors: _errors, ...compatiblePatch } = patch;
      updated = await supabase.from("analysis_questions").update(compatiblePatch).eq("id", id).select("*").single();
    }
    if (updated.error) throw updated.error;

    return NextResponse.json({ success: true, question: updated.data, dna });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "문항 AI 분석에 실패했습니다." }, { status: 500 });
  }
}
