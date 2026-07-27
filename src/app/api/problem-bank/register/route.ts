import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type AnalysisQuestion = {
  id: string;
  question_no: number;
  answer: string | null;
  status: string;
  confidence: number | null;
  ai_result: Record<string, unknown> | null;
  review_result: Record<string, unknown> | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finalResult(question: AnalysisQuestion) {
  return question.review_result && Object.keys(question.review_result).length > 0
    ? question.review_result
    : question.ai_result ?? {};
}

async function createEmbeddings(inputs: string[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || inputs.length === 0) return [] as number[][];
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: inputs, encoding_format: "float" }),
    signal: AbortSignal.timeout(180_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Embedding 생성 실패 (${response.status}): ${await response.text()}`);
  const payload = await response.json() as { data?: Array<{ index: number; embedding: number[] }> };
  return (payload.data ?? []).sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

export async function POST(request: NextRequest) {
  try {
    const { analysisId } = await request.json() as { analysisId?: string };
    if (!analysisId) return NextResponse.json({ success: false, message: "분석 ID가 없습니다." }, { status: 400 });

    const supabase = createClient();
    const analysisQuery = await supabase.from("source_analysis").select("*").eq("id", analysisId).single();
    if (analysisQuery.error || !analysisQuery.data) throw analysisQuery.error ?? new Error("분석 정보를 찾을 수 없습니다.");

    const sourceQuery = await supabase.from("source_files").select("*").eq("id", analysisQuery.data.source_file_id).single();
    if (sourceQuery.error || !sourceQuery.data) throw sourceQuery.error ?? new Error("원본 시험지를 찾을 수 없습니다.");

    const questionQuery = await supabase.from("analysis_questions").select("*").eq("analysis_id", analysisId).order("question_no");
    if (questionQuery.error) throw questionQuery.error;
    const questions = (questionQuery.data ?? []) as AnalysisQuestion[];
    if (questions.length === 0) return NextResponse.json({ success: false, message: "등록할 문항이 없습니다." }, { status: 400 });

    const unapproved = questions.filter((item) => item.status !== "APPROVED");
    if (unapproved.length > 0) {
      return NextResponse.json({ success: false, message: `검수 확정되지 않은 문항이 ${unapproved.length}개 있습니다.` }, { status: 409 });
    }

    const embeddingTexts = questions.map((question) => {
      const result = finalResult(question);
      return [
        `과목: ${text(result.subject) || text(sourceQuery.data.subject)}`,
        `단원: ${text(result.unit)}`,
        `유형: ${text(result.topic)}`,
        `난이도: ${text(result.difficulty)}`,
        `문항 요약: ${text(result.summary)}`,
        `정답 형식: ${text(result.question_type)}`,
      ].join("\n");
    });

    const embeddings = await createEmbeddings(embeddingTexts);
    const now = new Date().toISOString();
    const rows = questions.map((question, index) => {
      const result = finalResult(question);
      return {
        source_file_id: sourceQuery.data.id,
        analysis_question_id: question.id,
        question_no: question.question_no,
        problem_code: `${sourceQuery.data.id}-${String(question.question_no).padStart(3, "0")}`,
        title: `${sourceQuery.data.title} ${question.question_no}번`,
        grade: text(sourceQuery.data.grade),
        subject: text(result.subject) || text(sourceQuery.data.subject),
        unit: text(result.unit),
        topic: text(result.topic),
        difficulty: text(result.difficulty) || "중",
        question_type: text(result.question_type) || "unknown",
        answer: question.answer ?? "",
        summary: text(result.summary),
        source_name: text(sourceQuery.data.source),
        exam_pdf_path: sourceQuery.data.exam_pdf_path,
        solution_pdf_path: sourceQuery.data.solution_pdf_path,
        confidence: question.confidence,
        embedding_text: embeddingTexts[index],
        embedding: embeddings[index] ?? null,
        status: "ACTIVE",
        reviewed_at: now,
        updated_at: now,
      };
    });

    const upsert = await supabase.from("problem_bank_questions").upsert(rows, { onConflict: "source_file_id,question_no" }).select("id");
    if (upsert.error) throw upsert.error;

    const analysisUpdate = await supabase.from("source_analysis").update({
      status: "DONE",
      progress: 100,
      current_step: "문제은행 등록 완료",
      finished_at: now,
      updated_at: now,
    }).eq("id", analysisId);
    if (analysisUpdate.error) throw analysisUpdate.error;

    return NextResponse.json({
      success: true,
      registered: rows.length,
      embedded: embeddings.length,
      message: `${rows.length}개 문항을 문제은행에 등록했습니다.`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "문제은행 등록에 실패했습니다." }, { status: 500 });
  }
}
