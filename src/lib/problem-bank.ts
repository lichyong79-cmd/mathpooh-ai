import type { SupabaseClient } from "@supabase/supabase-js";
import { PROBLEM_DNA_VERSION, collectProblemDnaTags, problemDnaEmbeddingText, type ProblemDNA } from "@/lib/problem-dna";

type AnalysisQuestion = {
  id: string;
  question_no: number;
  answer: string | null;
  confidence: number | null;
  ai_result: Record<string, unknown> | null;
  review_result: Record<string, unknown> | null;
  page_no?: number | null;
  crop_x?: number | null;
  crop_y?: number | null;
  crop_width?: number | null;
  crop_height?: number | null;
  question_image_path?: string | null;
};

type SourceFile = {
  id: string;
  title: string;
  source: string | null;
  grade: string | null;
  subject: string | null;
  exam_pdf_path: string | null;
  solution_pdf_path: string | null;
  content_role?: string | null;
  training_course?: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDuplicateText(value: unknown) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[“”‘’'"`´]/g, "")
    .replace(/[·•]/g, "")
    .replace(/[，]/g, ",")
    .replace(/[＝]/g, "=")
    .replace(/[−–—]/g, "-");
}

function duplicateKeyFromParts(parts: unknown[]) {
  return parts.map(normalizeDuplicateText).join("|");
}

function duplicateKeyFromQuestion(question: AnalysisQuestion, source: SourceFile) {
  const result = finalResult(question);
  const dna = problemDna(result);
  if (dna?.schema_version === PROBLEM_DNA_VERSION) {
    return duplicateKeyFromParts([
      dna.basic?.subject || source.subject,
      dna.basic?.grade || source.grade,
      dna.basic?.major_unit,
      dna.basic?.middle_unit,
      dna.basic?.minor_unit,
      dna.basic?.detailed_topic,
      dna.basic?.question_format,
      dna.summary?.one_line,
      question.answer,
    ]);
  }
  return duplicateKeyFromParts([
    result.subject || source.subject,
    source.grade,
    result.unit,
    result.topic,
    result.question_type,
    result.summary,
    question.answer,
  ]);
}

function duplicateKeyFromBankRow(row: any) {
  const dna = row.problem_dna && typeof row.problem_dna === "object" ? row.problem_dna as ProblemDNA : null;
  if (dna?.schema_version === PROBLEM_DNA_VERSION) {
    return duplicateKeyFromParts([
      dna.basic?.subject || row.subject,
      dna.basic?.grade || row.grade,
      dna.basic?.major_unit,
      dna.basic?.middle_unit,
      dna.basic?.minor_unit,
      dna.basic?.detailed_topic,
      dna.basic?.question_format,
      dna.summary?.one_line,
      row.answer,
    ]);
  }
  return duplicateKeyFromParts([
    row.subject,
    row.grade,
    row.unit,
    row.topic,
    row.question_type,
    row.summary,
    row.answer,
  ]);
}

function finalResult(question: AnalysisQuestion) {
  const ai = question.ai_result ?? {};
  const review = question.review_result ?? {};
  return { ...ai, ...review };
}

function problemDna(result: Record<string, unknown>) {
  const value = result.problem_dna;
  return value && typeof value === "object" ? value as ProblemDNA : null;
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

  if (!response.ok) {
    throw new Error(`Embedding 생성 실패 (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json() as {
    data?: Array<{ index: number; embedding: number[] }>;
  };

  return (payload.data ?? [])
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export async function registerQuestions(
  supabase: SupabaseClient,
  source: SourceFile,
  questions: AnalysisQuestion[],
) {
  if (questions.length === 0) return { registered: 0, embedded: 0, registeredQuestionIds: [] as string[], duplicateQuestionIds: [] as string[], duplicates: [] as Array<{ questionId: string; existingProblemId: string; existingTitle: string }> };

  // v172: 추가 AI 호출 없이 이미 저장된 DNA/문항요약/정답을 이용해 동일문항을 걸러낸다.
  // 같은 source_file_id + question_no 재등록은 기존 upsert 갱신으로 허용한다.
  const existingQuery = await supabase
    .from("problem_bank_questions")
    .select("id,source_file_id,question_no,title,grade,subject,unit,topic,question_type,answer,summary,problem_dna,status");
  if (existingQuery.error) throw new Error(`문제은행 중복검사 실패: ${existingQuery.error.message}`);

  const existingByKey = new Map<string, any>();
  for (const row of existingQuery.data ?? []) {
    if (row.status === "DUPLICATE") continue;
    const key = duplicateKeyFromBankRow(row);
    if (key && !existingByKey.has(key)) existingByKey.set(key, row);
  }

  const batchByKey = new Map<string, AnalysisQuestion>();
  const duplicates: Array<{ questionId: string; existingProblemId: string; existingTitle: string }> = [];
  const uniqueQuestions: AnalysisQuestion[] = [];

  for (const question of questions) {
    const key = duplicateKeyFromQuestion(question, source);
    const existing = key ? existingByKey.get(key) : null;
    const sameExistingRow = existing && String(existing.source_file_id) === String(source.id) && Number(existing.question_no) === Number(question.question_no);
    const batchExisting = key ? batchByKey.get(key) : null;

    if (existing && !sameExistingRow) {
      duplicates.push({
        questionId: question.id,
        existingProblemId: String(existing.id),
        existingTitle: text(existing.title) || `기존 ${existing.question_no}번`,
      });
      continue;
    }
    if (batchExisting) {
      duplicates.push({
        questionId: question.id,
        existingProblemId: batchExisting.id,
        existingTitle: `${source.title} ${batchExisting.question_no}번`,
      });
      continue;
    }

    if (key) batchByKey.set(key, question);
    uniqueQuestions.push(question);
  }

  if (uniqueQuestions.length === 0) {
    return {
      registered: 0,
      embedded: 0,
      registeredQuestionIds: [] as string[],
      duplicateQuestionIds: duplicates.map((item) => item.questionId),
      duplicates,
    };
  }

  const embeddingTexts = uniqueQuestions.map((question) => {
    const result = finalResult(question);
    const dna = problemDna(result);
    if (dna?.schema_version === PROBLEM_DNA_VERSION) return problemDnaEmbeddingText(dna);
    return [
      `과목: ${text(result.subject) || text(source.subject)}`,
      `단원: ${text(result.unit)}`,
      `유형: ${text(result.topic)}`,
      `난이도: ${text(result.difficulty)}`,
      `문항 요약: ${text(result.summary)}`,
      `정답 형식: ${text(result.question_type)}`,
    ].join("\n");
  });

  const embeddings = await createEmbeddings(embeddingTexts);
  const now = new Date().toISOString();
  const rows = uniqueQuestions.map((question, index) => {
    const result = finalResult(question);
    const dna = problemDna(result);
    return {
      source_file_id: source.id,
      analysis_question_id: question.id,
      question_no: question.question_no,
      problem_code: `${source.id}-${String(question.question_no).padStart(3, "0")}`,
      title: `${source.title} ${question.question_no}번`,
      grade: text(source.grade),
      subject: text(result.subject) || text(source.subject),
      unit: text(result.unit),
      topic: text(result.topic),
      difficulty: text(result.difficulty) || "2",
      question_type: text(result.question_type) || "unknown",
      answer: question.answer ?? "",
      summary: text(result.summary),
      source_name: text(source.source),
      content_role: text(source.content_role) || "TRAINING",
      training_course: text(source.training_course) || "대표유형",
      exam_pdf_path: source.exam_pdf_path,
      solution_pdf_path: source.solution_pdf_path,
      confidence: question.confidence,
      page_no: question.page_no ?? null,
      crop_x: question.crop_x ?? null,
      crop_y: question.crop_y ?? null,
      crop_width: question.crop_width ?? null,
      crop_height: question.crop_height ?? null,
      question_image_path: question.question_image_path ?? null,
      problem_dna: dna,
      analysis_version: dna?.schema_version ?? "legacy-v1",
      dna_tags: dna ? collectProblemDnaTags(dna) : [],
      embedding_text: embeddingTexts[index],
      embedding: embeddings[index] ?? null,
      status: "ACTIVE",
      reviewed_at: now,
      updated_at: now,
    };
  });

  const upsert = await supabase
    .from("problem_bank_questions")
    .upsert(rows, { onConflict: "source_file_id,question_no" });
  if (upsert.error) {
    const err = new Error(`problem_bank_questions 저장 실패: ${upsert.error.message}`) as Error & { code?: string; details?: string; hint?: string };
    err.code = upsert.error.code;
    err.details = upsert.error.details;
    err.hint = upsert.error.hint;
    throw err;
  }

  return {
    registered: rows.length,
    embedded: embeddings.length,
    registeredQuestionIds: uniqueQuestions.map((item) => item.id),
    duplicateQuestionIds: duplicates.map((item) => item.questionId),
    duplicates,
  };
}
