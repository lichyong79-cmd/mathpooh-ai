import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const dnaSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "question_type", "subject", "major_unit", "middle_unit", "minor_unit",
    "difficulty", "thinking_type", "required_skills", "core_concepts",
    "solution_strategy", "summary", "confidence", "answer",
  ],
  properties: {
    question_type: { type: "string", enum: ["objective", "subjective", "unknown"] },
    subject: { type: "string" },
    major_unit: { type: "string" },
    middle_unit: { type: "string" },
    minor_unit: { type: "string" },
    difficulty: { type: "string", enum: ["A", "B", "C", "D", "E"] },
    thinking_type: { type: "string" },
    required_skills: { type: "array", items: { type: "string" }, maxItems: 8 },
    core_concepts: { type: "array", items: { type: "string" }, maxItems: 8 },
    solution_strategy: { type: "string" },
    summary: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    answer: { type: "string" },
  },
} as const;

type OpenAiPayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
};

function outputText(payload: OpenAiPayload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output ?? []).flatMap(item => item.content ?? []).map(content => content.text ?? "").join("\n");
}

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-5";
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
    const sourceResult = await supabase.from("source_files").select("title,grade,subject,solution_pdf_path").eq("id", analysisResult.data.source_file_id).single();
    if (sourceResult.error) throw sourceResult.error;
    if (!question.question_image_path) {
      return NextResponse.json({ success: false, message: "문항 이미지가 없습니다. 먼저 전체 AI 분석을 실행해 주세요." }, { status: 400 });
    }

    const signed = await supabase.storage.from("question-images").createSignedUrl(question.question_image_path, 60 * 10);
    if (signed.error) throw signed.error;
    const source = sourceResult.data;
    let solutionUrl = "";
    if (source?.solution_pdf_path) {
      const solutionSigned = await supabase.storage.from("exam-pdf").createSignedUrl(source.solution_pdf_path, 60 * 10);
      if (!solutionSigned.error) solutionUrl = solutionSigned.data.signedUrl;
    }

    const prompt = `당신은 한국 중고등 수학 문항을 분류하는 MathPooh MPAI 분석기입니다.
첨부된 한 문항 이미지만 분석하여 Problem DNA를 생성하세요.
시험지 정보: ${source?.grade ?? "학년 미상"} / ${source?.subject ?? "과목 미상"} / ${source?.title ?? "제목 미상"}
문항 번호: ${question.question_no}

분류 원칙:
- 난이도는 A(기초)~E(최상) 중 하나입니다.
- 대단원/중단원/소단원은 한국 수학 교육과정에서 자연스럽고 구체적으로 작성합니다.
- 사고유형은 계산, 개념이해, 조건해석, 식변형, 그래프해석, 추론, 경우분류, 증명 등에서 가장 핵심인 것을 작성합니다.
- 요구능력과 핵심개념은 중복 없이 짧은 배열로 작성합니다.
- 풀이전략은 정답 자체보다 해결 접근을 1~3문장으로 적습니다.
- 핵심 한줄(summary)은 이 문항이 무엇을 평가하는지 한 문장으로 적습니다.
- 해설지 PDF가 함께 제공되면 문항번호에 맞는 정답과 해설을 확인하여 answer를 채웁니다.
- 해설지에서 확인할 수 없으면 answer는 빈 문자열로 둡니다.
- 보이지 않는 내용을 추측하지 말고 confidence에 반영합니다.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: signed.data.signedUrl, detail: "high" },
          ...(solutionUrl ? [{ type: "input_file", file_url: solutionUrl }] : []),
        ] }],
        text: { format: { type: "json_schema", name: "problem_dna", strict: true, schema: dnaSchema } },
        max_output_tokens: 1800,
      }),
      signal: AbortSignal.timeout(110_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI 문항 분석 실패 (${response.status}): ${body}`);
    }
    const payload = await response.json() as OpenAiPayload;
    const dna = JSON.parse(outputText(payload).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    const reviewResult = {
      ...(question.ai_result ?? {}),
      ...(question.review_result ?? {}),
      question_type: dna.question_type,
      subject: dna.subject || null,
      unit: dna.middle_unit || dna.major_unit || null,
      topic: dna.minor_unit || null,
      major_unit: dna.major_unit || null,
      middle_unit: dna.middle_unit || null,
      minor_unit: dna.minor_unit || null,
      difficulty: dna.difficulty,
      thinking_type: dna.thinking_type || null,
      required_skills: dna.required_skills ?? [],
      core_concepts: dna.core_concepts ?? [],
      solution_strategy: dna.solution_strategy || null,
      summary: dna.summary || null,
    };

    const patch: Record<string, unknown> = {
      review_result: reviewResult,
      confidence: Number(dna.confidence),
      status: "REVIEW",
      updated_at: new Date().toISOString(),
    };
    if (typeof dna.answer === "string" && dna.answer.trim()) patch.answer = dna.answer.trim();

    const updated = await supabase.from("analysis_questions").update(patch).eq("id", id).select("*").single();
    if (updated.error) throw updated.error;

    const allQuestions = await supabase
      .from("analysis_questions")
      .select("id,status,review_result")
      .eq("analysis_id", question.analysis_id);
    if (!allQuestions.error) {
      const rows = allQuestions.data ?? [];
      const completed = rows.filter((row: any) => row.review_result && Object.keys(row.review_result).length > 0).length;
      const total = rows.length;
      const progress = total > 0 ? 35 + Math.round((completed / total) * 65) : 100;
      await supabase.from("source_analysis").update({
        status: completed >= total && total > 0 ? "REVIEW" : "RUNNING",
        progress,
        current_step: completed >= total && total > 0
          ? `문항 자르기·분석 완료 · ${total}개`
          : `3단계 · 문항별 AI 분석 ${completed}/${total}`,
        ...(completed >= total && total > 0 ? { finished_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", question.analysis_id);
    }

    return NextResponse.json({ success: true, question: updated.data, dna });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "문항 AI 분석에 실패했습니다." }, { status: 500 });
  }
}
