import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { PROBLEM_DNA_VERSION } from "@/lib/problem-dna";
import { DIFFICULTY_PROMPT_GUIDE } from "@/lib/difficulty-scale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const questionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "question_no",
    "major_unit",
    "middle_unit",
    "minor_unit",
    "detailed_topic",
    "question_type",
    "problem_types",
    "difficulty",
    "confidence",
    "answer",
    "summary",
    "test_page_no",
    "solution_page_no",
    "test_bbox",
    "solution_bbox",
  ],
  properties: {
    question_no: { type: "integer", minimum: 1, maximum: 100 },
    major_unit: { type: "string" },
    middle_unit: { type: "string" },
    minor_unit: { type: "string" },
    detailed_topic: { type: "string" },
    question_type: {
      type: "string",
      enum: ["objective", "short_answer", "essay", "unknown"],
    },
    problem_types: { type: "array", items: { type: "string" }, maxItems: 8 },
    difficulty: { type: "integer", minimum: 1, maximum: 8 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    answer: { type: "string" },
    summary: { type: "string" },
    test_page_no: { type: "integer", minimum: 1, maximum: 200 },
    solution_page_no: { type: "integer", minimum: 0, maximum: 200 },
    test_bbox: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: { type: "number", minimum: 0, maximum: 1 },
    },
    solution_bbox: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: { type: "number", minimum: 0, maximum: 1 },
    },
  },
} as const;

async function adminContext() {
  const user = await getSessionUser();
  if (!user)
    return {
      error: NextResponse.json(
        { message: "로그인이 필요합니다." },
        { status: 401 },
      ),
    };
  if (
    user.user_metadata?.role === "student" ||
    user.user_metadata?.role === "parent"
  )
    return {
      error: NextResponse.json(
        { message: "관리자 권한이 필요합니다." },
        { status: 403 },
      ),
    };
  return { supabase: createServerSupabase() };
}

function outputText(payload: any) {
  if (typeof payload.output_text === "string" && payload.output_text.trim())
    return payload.output_text;
  return (payload.output ?? [])
    .flatMap((item: any) => item.content ?? [])
    .map((item: any) => item.text ?? "")
    .filter(Boolean)
    .join("");
}

export async function GET(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const examId = new URL(request.url).searchParams.get("examId");
  let query = ctx.supabase
    .from("exam_question_analysis")
    .select(
      "exam_id,question_no,major_unit,middle_unit,minor_unit,detailed_topic,question_type,problem_types,difficulty,confidence,analysis_version,analysis_data,updated_at",
    )
    .order("question_no");
  if (examId) query = query.eq("exam_id", examId);
  const { data, error } = await query;
  if (error)
    return NextResponse.json({ message: error.message }, { status: 400 });
  const counts = (data ?? []).reduce<Record<string, number>>((acc, item) => {
    acc[item.exam_id] = (acc[item.exam_id] ?? 0) + 1;
    return acc;
  }, {});
  let files: { testUrl?: string; solutionUrl?: string } = {};
  if (examId) {
    const examResult = await ctx.supabase
      .from("exams")
      .select("test_file_path,solution_file_path")
      .eq("id", examId)
      .maybeSingle();
    if (examResult.data?.test_file_path) {
      const signed = await ctx.supabase.storage
        .from("exam-files")
        .createSignedUrl(examResult.data.test_file_path, 60 * 30);
      if (!signed.error) files.testUrl = signed.data.signedUrl;
    }
    if (examResult.data?.solution_file_path) {
      const signed = await ctx.supabase.storage
        .from("exam-files")
        .createSignedUrl(examResult.data.solution_file_path, 60 * 30);
      if (!signed.error) files.solutionUrl = signed.data.signedUrl;
    }
  }
  return NextResponse.json({ items: data ?? [], counts, files });
}

export async function POST(request: Request) {
  const ctx = await adminContext();
  if (ctx.error) return ctx.error;
  const { examId, questionNo } = await request.json();
  if (!examId)
    return NextResponse.json(
      { message: "분석할 시험을 선택해 주세요." },
      { status: 400 },
    );
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      { message: "OPENAI_API_KEY가 없습니다." },
      { status: 500 },
    );
  const { data: exam, error } = await ctx.supabase
    .from("exams")
    .select(
      "id,title,grade,subject,exam_range,question_count,test_file_path,solution_file_path",
    )
    .eq("id", examId)
    .single();
  if (error || !exam)
    return NextResponse.json(
      { message: error?.message || "시험을 찾지 못했습니다." },
      { status: 404 },
    );
  if (!exam.test_file_path)
    return NextResponse.json(
      { message: "먼저 PDF 시험지를 등록해 주세요." },
      { status: 400 },
    );

  const test = await ctx.supabase.storage
    .from("exam-files")
    .createSignedUrl(exam.test_file_path, 600);
  if (test.error)
    return NextResponse.json({ message: test.error.message }, { status: 400 });
  const files = [test.data.signedUrl];
  if (exam.solution_file_path) {
    const solution = await ctx.supabase.storage
      .from("exam-files")
      .createSignedUrl(exam.solution_file_path, 600);
    if (!solution.error) files.push(solution.data.signedUrl);
  }

  const count = Number(exam.question_count);
  const requestedQuestionNo = Number(questionNo || 0);
  if (requestedQuestionNo && (requestedQuestionNo < 1 || requestedQuestionNo > count))
    return NextResponse.json(
      { message: `문항 번호는 1~${count} 사이여야 합니다.` },
      { status: 400 },
    );
  const targetNumbers = requestedQuestionNo
    ? [requestedQuestionNo]
    : Array.from({ length: count }, (_, index) => index + 1);
  const targetDescription = requestedQuestionNo
    ? `${requestedQuestionNo}번 문항 하나만`
    : `1번부터 ${count}번까지 모든 문항을`;
  const prompt = `실전모의고사 PDF에서 ${targetDescription} 번호별로 분석하라. 시험명=${exam.title}, 과목=${exam.subject}, 범위=${exam.exam_range}. 문제은행 등록이 아니라 시험 결과 진단용 메타데이터다. 지정한 문항을 빠짐없이 한 번씩 반환한다. 단원은 교육과정 기준 대/중/소단원과 세부주제를 구분한다. problem_types는 계산형, 조건해석형, 추론형, 그래프해석형, 도형구조형 등 실제 성격을 기록한다. test_page_no에는 시험지 PDF에서 문항이 시작되는 실제 페이지 번호를 기록한다. test_bbox에는 그 페이지에서 해당 문항 하나만 포함하는 영역을 [x,y,width,height] 형식의 0~1 정규화 좌표로 기록한다. 좌표 원점은 페이지 왼쪽 위이며 문항 번호, 본문, 보기, 그래프·도형을 모두 포함하되 앞뒤 다른 문항은 포함하지 않는다. 해설지 PDF가 함께 제공되면 solution_page_no에는 해당 공식 해설이 시작되는 실제 페이지 번호, solution_bbox에는 같은 방식으로 해당 번호의 공식 해설 하나만 포함하는 영역을 기록하고, answer에는 해당 문항의 공식 정답만, summary에는 핵심 풀이와 발상을 2문장 이내로 기록한다. 해설지가 없으면 solution_page_no는 0, solution_bbox는 [0,0,1,1]로 기록한다. ${DIFFICULTY_PROMPT_GUIDE}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_ANALYSIS_MODEL || "gpt-5-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...files.map((file_url) => ({ type: "input_file", file_url })),
          ],
        },
      ],
      reasoning: { effort: "medium" },
      text: {
        format: {
          type: "json_schema",
          name: "exam_question_classification",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["questions"],
            properties: {
              questions: {
                type: "array",
                minItems: targetNumbers.length,
                maxItems: targetNumbers.length,
                items: questionSchema,
              },
            },
          },
        },
      },
      max_output_tokens: 16000,
      store: false,
    }),
    signal: AbortSignal.timeout(280_000),
    cache: "no-store",
  });
  const raw = await response.text();
  if (!response.ok)
    return NextResponse.json(
      {
        message: `AI 문항분석 실패 (${response.status}): ${raw.slice(0, 600)}`,
      },
      { status: 502 },
    );
  let questions: any[] = [];
  try {
    const parsed = JSON.parse(outputText(JSON.parse(raw)));
    questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  } catch {
    return NextResponse.json(
      { message: "AI 문항분석 결과를 읽지 못했습니다." },
      { status: 502 },
    );
  }
  const unique = new Map<number, any>(
    questions.map((item) => [Number(item.question_no), item]),
  );
  if (
    unique.size !== targetNumbers.length ||
    targetNumbers.some((no) => !unique.has(no))
  )
    return NextResponse.json(
      {
        message: `AI가 지정 문항을 모두 반환하지 못했습니다. ${unique.size}/${targetNumbers.length}문항 인식`,
      },
      { status: 422 },
    );
  const now = new Date().toISOString();
  const rows = Array.from(unique.values()).map((item) => ({
    exam_id: exam.id,
    question_no: Number(item.question_no),
    major_unit: item.major_unit,
    middle_unit: item.middle_unit,
    minor_unit: item.minor_unit,
    detailed_topic: item.detailed_topic,
    question_type: item.question_type,
    problem_types: item.problem_types,
    difficulty: Number(item.difficulty),
    confidence: Number(item.confidence),
    analysis_version: PROBLEM_DNA_VERSION,
    analysis_data: item,
    updated_at: now,
  }));
  const saved = await ctx.supabase
    .from("exam_question_analysis")
    .upsert(rows, { onConflict: "exam_id,question_no" })
    .select("question_no");
  if (saved.error)
    return NextResponse.json({ message: saved.error.message }, { status: 400 });
  return NextResponse.json({
    success: true,
    count: saved.data?.length ?? rows.length,
  });
}
