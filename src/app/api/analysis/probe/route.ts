import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ProbeResult = {
  page_count_estimate: number;
  total_questions: number;
  objective_count: number;
  subjective_count: number;
  first_question: {
    question_no: number;
    question_type: "objective" | "subjective" | "unknown";
    subject: string;
    unit: string;
    topic: string;
    difficulty: "하" | "중" | "상" | "최상";
    answer: string;
    confidence: number;
    summary: string;
  };
  notes: string;
};

type OpenAiResponse = {
  id?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

const probeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["page_count_estimate", "total_questions", "objective_count", "subjective_count", "first_question", "notes"],
  properties: {
    page_count_estimate: { type: "integer", minimum: 1, maximum: 500 },
    total_questions: { type: "integer", minimum: 1, maximum: 200 },
    objective_count: { type: "integer", minimum: 0, maximum: 200 },
    subjective_count: { type: "integer", minimum: 0, maximum: 200 },
    first_question: {
      type: "object",
      additionalProperties: false,
      required: ["question_no", "question_type", "subject", "unit", "topic", "difficulty", "answer", "confidence", "summary"],
      properties: {
        question_no: { type: "integer", minimum: 1, maximum: 200 },
        question_type: { type: "string", enum: ["objective", "subjective", "unknown"] },
        subject: { type: "string" },
        unit: { type: "string" },
        topic: { type: "string" },
        difficulty: { type: "string", enum: ["하", "중", "상", "최상"] },
        answer: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        summary: { type: "string" },
      },
    },
    notes: { type: "string" },
  },
} as const;

function outputText(payload: OpenAiResponse) {
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output ?? []).flatMap((item) => item.content ?? []).map((content) => content.text ?? "").join("\n");
}

function friendlyError(status: number, body: string) {
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    detail = parsed.error?.message || body;
  } catch {}
  if (status === 401) return "OpenAI API 키가 올바르지 않습니다.";
  if (status === 429) return `OpenAI 크레딧 또는 사용 한도를 확인해 주세요. ${detail}`;
  if (status === 404) return `설정된 모델을 사용할 수 없습니다. ${detail}`;
  return `OpenAI PDF 판독 실패 (${status}): ${detail}`;
}

export async function POST(request: NextRequest) {
  try {
    const { sourceFileId } = (await request.json()) as { sourceFileId?: string };
    if (!sourceFileId) return NextResponse.json({ success: false, message: "시험지를 선택해 주세요." }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-5";
    if (!apiKey) return NextResponse.json({ success: false, message: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 500 });

    const supabase = createClient();
    const { data: source, error } = await supabase
      .from("source_files")
      .select("id,title,source,grade,subject,exam_pdf_path,solution_pdf_path")
      .eq("id", sourceFileId)
      .single();

    if (error || !source) return NextResponse.json({ success: false, message: "등록된 시험지를 찾을 수 없습니다." }, { status: 404 });
    if (!source.exam_pdf_path || !source.solution_pdf_path) {
      return NextResponse.json({ success: false, message: "시험지 PDF와 해설지 PDF가 모두 필요합니다." }, { status: 400 });
    }

    const sign = async (path: string) => {
      const result = await supabase.storage.from("exam-pdf").createSignedUrl(path, 60 * 60);
      if (result.error) throw result.error;
      return result.data.signedUrl;
    };
    const [examUrl, solutionUrl] = await Promise.all([sign(source.exam_pdf_path), sign(source.solution_pdf_path)]);

    const prompt = [
      "너는 한국 중·고등 수학 시험지 판독 전문가다.",
      "첫 번째 PDF는 시험지, 두 번째 PDF는 해설지다.",
      "이번 요청은 전체 문제은행 등록 전의 1차 판독 테스트다.",
      "시험지의 페이지 수를 추정하고 전체 문항 수, 객관식 수, 단답형·서술형 수를 센다.",
      "그 다음 1번 문항만 자세히 분석한다.",
      "정답은 반드시 해설지에서 확인한다. 확실하지 않으면 빈 문자열과 낮은 confidence를 반환한다.",
      "summary에는 풀이를 쓰지 말고 문제에서 요구하는 핵심만 한 문장으로 쓴다.",
      `시험지 정보: ${source.title} / ${source.source ?? ""} / ${source.grade ?? ""} / ${source.subject ?? ""}`,
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: [
          { type: "input_text", text: prompt },
          { type: "input_file", file_url: examUrl },
          { type: "input_file", file_url: solutionUrl },
        ] }],
        text: { format: { type: "json_schema", name: "math_exam_probe", strict: true, schema: probeSchema } },
        max_output_tokens: 3500,
      }),
      signal: AbortSignal.timeout(280_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ success: false, message: friendlyError(response.status, detail) }, { status: response.status });
    }

    const raw = (await response.json()) as OpenAiResponse;
    const text = outputText(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const result = JSON.parse(text) as ProbeResult;
    return NextResponse.json({ success: true, model, result, responseId: raw.id ?? null, usage: raw.usage ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF 1차 판독에 실패했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
