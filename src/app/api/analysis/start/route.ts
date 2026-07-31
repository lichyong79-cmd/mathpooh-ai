import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { PROBLEM_DNA_VERSION, legacyFieldsFromDNA, problemDnaBatchSchema, validateProblemDNA, type ProblemDNA } from "@/lib/problem-dna";

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
  question_number_y: number;
  confidence: number;
  review_reason: string;
};

type AnalysisQuestion = ProblemDNA;

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
      minItems: 1,
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
          "question_number_y",
          "confidence",
          "review_reason",
        ],
        properties: {
          question_no: { type: "integer", minimum: 1, maximum: 200 },
          page_no: { type: "integer", minimum: 1, maximum: 500 },
          crop_x: { type: "number", minimum: 0, maximum: 100 },
          crop_y: { type: "number", minimum: 0, maximum: 100 },
          crop_width: { type: "number", minimum: 1, maximum: 100 },
          crop_height: { type: "number", minimum: 1, maximum: 100 },
          question_number_y: { type: "number", minimum: 0, maximum: 100 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          review_reason: { type: "string" },
        },
      },
    },
  },
} as const;

const analysisSchema = problemDnaBatchSchema;

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

/**
 * AI가 페이지에서 각 문항의 실제 bounding box를 직접 반환한다.
 * 별표, 홀짝, 고정 단폭, 다음 문항 추정값은 사용하지 않는다.
 */
function normalizeAiCrops(items: AiCropQuestion[]) {
  const byQuestion = new Map<number, AiCropQuestion>();

  for (const item of items) {
    const questionNo = Math.trunc(Number(item.question_no));
    if (!Number.isFinite(questionNo) || questionNo < 1) continue;

    const x = clamp(Number(item.crop_x), 0, 99);
    const rawY = clamp(Number(item.crop_y), 0, 99);
    const rawHeight = clamp(Number(item.crop_height), 1, 100 - rawY);
    const rawBottom = rawY + rawHeight;
    const numberAnchor = clamp(Number(item.question_number_y), rawY, rawBottom - 0.2);

    // AI가 문항 간 구간의 시작을 crop_y로 잡더라도 실제 인쇄된 문항번호 위치로
    // 시작점만 강제 이동한다. 기존 아래쪽 끝은 유지하므로 선택지·도형은 잘리지 않는다.
    // 페이지 높이의 0.28%만 안전 여백으로 남기며, 번호 위의 별표/장식은 포함하지 않는다.
    const y = clamp(numberAnchor - 0.28, 0, rawBottom - 0.2);
    const width = clamp(Number(item.crop_width), 1, 100 - x);
    const height = clamp(rawBottom - y, 0.2, 100 - y);

    byQuestion.set(questionNo, {
      question_no: questionNo,
      page_no: Math.max(1, Math.trunc(Number(item.page_no) || 1)),
      crop_x: x,
      crop_y: y,
      crop_width: width,
      crop_height: height,
      question_number_y: numberAnchor,
      confidence: clamp(Number(item.confidence), 0, 1),
      review_reason: String(item.review_reason ?? "").trim(),
    });
  }

  return [...byQuestion.values()].sort((a, b) => a.question_no - b.question_no);
}


function constrainCropsByNextQuestion(items: AiCropQuestion[]) {
  const output = items.map((item) => ({ ...item }));
  const groups = new Map<string, AiCropQuestion[]>();

  for (const item of output) {
    const centerX = item.crop_x + item.crop_width / 2;
    const column = centerX < 50 ? "L" : "R";
    const key = `${item.page_no}:${column}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => a.question_number_y - b.question_number_y);
    for (let index = 0; index < group.length - 1; index += 1) {
      const current = group[index];
      const next = group[index + 1];
      const currentBottom = current.crop_y + current.crop_height;
      const safeBottom = next.question_number_y - 0.55;
      if (safeBottom > current.crop_y + 2 && currentBottom > safeBottom) {
        current.crop_height = clamp(safeBottom - current.crop_y, 2, 100 - current.crop_y);
      }
    }
  }

  return output.sort((a, b) => a.question_no - b.question_no);
}

function intersectionOverUnion(a: AiCropQuestion, b: AiCropQuestion) {
  if (a.page_no !== b.page_no) return 0;
  const left = Math.max(a.crop_x, b.crop_x);
  const top = Math.max(a.crop_y, b.crop_y);
  const right = Math.min(a.crop_x + a.crop_width, b.crop_x + b.crop_width);
  const bottom = Math.min(a.crop_y + a.crop_height, b.crop_y + b.crop_height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  if (intersection <= 0) return 0;
  const union = a.crop_width * a.crop_height + b.crop_width * b.crop_height - intersection;
  return union > 0 ? intersection / union : 0;
}

function findDuplicateCrops(items: AiCropQuestion[]) {
  const duplicates: Array<{ first: number; second: number; page: number; overlap: number }> = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a.page_no !== b.page_no) continue;
      const overlap = intersectionOverUnion(a, b);
      const nearlySame =
        Math.abs(a.crop_x - b.crop_x) < 0.7 &&
        Math.abs(a.crop_y - b.crop_y) < 0.7 &&
        Math.abs(a.crop_width - b.crop_width) < 0.7 &&
        Math.abs(a.crop_height - b.crop_height) < 0.7;
      if (overlap >= 0.86 || nearlySame) {
        duplicates.push({
          first: a.question_no,
          second: b.question_no,
          page: a.page_no,
          overlap: Math.round(overlap * 1000) / 1000,
        });
      }
    }
  }
  return duplicates;
}


function findSuspiciousCrops(items: AiCropQuestion[]) {
  const issues: Array<{ question: number; page: number; reason: string }> = [];
  const sorted = [...items].sort((a, b) => a.question_no - b.question_no);
  const seenPages = new Map<number, AiCropQuestion[]>();

  for (const item of sorted) {
    const list = seenPages.get(item.page_no) ?? [];
    list.push(item);
    seenPages.set(item.page_no, list);

    if (item.crop_height < 9) issues.push({ question: item.question_no, page: item.page_no, reason: `높이가 너무 짧음(${item.crop_height.toFixed(1)}%)` });
    if (item.crop_width < 18) issues.push({ question: item.question_no, page: item.page_no, reason: `너비가 너무 좁음(${item.crop_width.toFixed(1)}%)` });
    if (item.crop_y > 86 && item.crop_height < 12) issues.push({ question: item.question_no, page: item.page_no, reason: "페이지 하단 문구/꼬리말 가능성" });
    if (Math.abs(item.question_number_y - item.crop_y) > 3.5) issues.push({ question: item.question_no, page: item.page_no, reason: "문항번호 기준점과 자르기 시작점 불일치" });
  }

  for (const [page, pageItems] of seenPages) {
    const byColumn = [...pageItems].sort((a, b) => a.crop_x - b.crop_x || a.question_number_y - b.question_number_y);
    for (let i = 1; i < byColumn.length; i += 1) {
      const prev = byColumn[i - 1];
      const cur = byColumn[i];
      const sameColumn = Math.abs((prev.crop_x + prev.crop_width / 2) - (cur.crop_x + cur.crop_width / 2)) < 18;
      if (sameColumn && cur.question_number_y < prev.question_number_y - 0.5) {
        issues.push({ question: cur.question_no, page, reason: "같은 단에서 문항번호 순서가 위아래 배치와 맞지 않음" });
      }
    }
  }

  const numbers = sorted.map((x) => x.question_no);
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] === numbers[i - 1]) issues.push({ question: numbers[i], page: sorted[i].page_no, reason: "문항번호 중복" });
  }
  return issues;
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
  schema: object;
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
    const { sourceFileId, mode = "crop-only" } = (await request.json()) as { sourceFileId?: string; mode?: "crop-only" | "full" };
    if (!sourceFileId) {
      return NextResponse.json(
        { success: false, message: "시험지를 선택해 주세요." },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const cropModel = process.env.OPENAI_CROP_MODEL || process.env.OPENAI_MODEL || "gpt-5";
    const analysisModel = process.env.OPENAI_ANALYSIS_MODEL || "gpt-5-mini";
    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: "OPENAI_API_KEY가 없습니다." },
        { status: 500 },
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
    if (!source.exam_pdf_path || (mode === "full" && !source.solution_pdf_path)) {
      return NextResponse.json(
        { success: false, message: mode === "full" ? "시험지 PDF와 해설지 PDF가 모두 필요합니다." : "시험지 PDF가 필요합니다." },
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

    const startedAt = new Date().toISOString();
    const baseLogs = [{ at: startedAt, message: `AI 직접 영역 판독 ${cropModel} · 빠른 분석 ${analysisModel}` }];

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
        current_step: "AI가 시험지를 직접 읽는 중",
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

    const [examUrl, solutionUrl] = await Promise.all([
      sign(source.exam_pdf_path),
      sign(source.solution_pdf_path),
    ]);

    await supabase
      .from("source_analysis")
      .update({
        progress: 15,
        current_step: "AI가 문항별 실제 영역과 내용을 동시에 분석 중",
      })
      .eq("id", analysis.id);

    const cropPrompt = [
      "너는 한국 수학 시험지에서 각 실제 문항의 사각형 영역을 찾는 비전 판독기다.",
      "별표 유무와 관계없이 시험지에 인쇄된 실제 문항을 모두 찾는다.",
      "각 문항마다 page_no, question_no, crop_x, crop_y, crop_width, crop_height, question_number_y를 페이지 전체 기준 0~100 백분율로 직접 반환한다.",
      "question_number_y는 별표나 장식이 아니라 실제 인쇄된 해당 문항번호(예: 11., 12.) 글자의 맨 위 y좌표다.",
      "crop 사각형은 문항번호부터 본문, 모든 수식, 보기, 선택지, 표, 그래프, 도형의 마지막 요소까지 포함해야 한다.",
      "현재 문항 위의 이전 문항 선택지나 아래의 다음 문항 번호·본문은 절대로 포함하지 않는다.",
      "두 단 편집이면 각 문항이 속한 단 안에서만 가로 범위를 잡고, 다른 단의 문항이나 빈 공간을 포함하지 않는다.",
      "문항이 한 단 전체 너비를 쓰면 실제 내용 너비만 포함한다. 홀짝 번호로 단을 추측하지 않는다.",
      "crop_y도 실제 인쇄된 문항번호 행 부근으로 잡되, 최종 시작점은 question_number_y를 기준으로 코드가 보정한다.",
      "문항번호보다 위나 왼쪽에 있는 별표(★), 난이도 아이콘, 장식기호, 단원 표시는 question_number_y로 절대로 잡지 않는다.",
      "별표가 없는 문서에서도 question_number_y는 반드시 해당 문항번호 자체의 맨 위를 가리킨다.",
      "분수·지수·근호가 문항번호보다 위로 튀는 경우에만 그 수식이 잘리지 않을 최소 여백을 둔다.",
      "문항의 아래쪽은 선택지·도형이 끝난 직후까지만 두고 큰 빈 여백을 포함하지 않는다.",
      "페이지 머리말, 시험 제목, 이름란, 쪽번호, 출판사·저작권 문구는 포함하지 않는다.",
      "예제·설명·참고문항처럼 번호가 있더라도 실제 시험 문항이 아니면 제외한다.",
      "문항번호는 절대로 1,2,3처럼 순서대로 임의 부여하지 말고, 사각형 안에서 실제로 읽히는 인쇄 번호만 사용한다.",
      "반환하는 각 사각형의 왼쪽 위 부근에는 question_no와 동일한 인쇄 문항번호가 실제로 보여야 한다. 번호가 보이지 않는 본문 조각, 수식 조각, 선택지 조각, 페이지 꼬리말은 문항이 아니다.",
      "한 문항을 위·아래 조각으로 나누지 않는다. 문제 본문이 여러 줄이면 마지막 선택지나 도형까지 하나의 사각형으로 묶는다.",
      "페이지 하단의 출판사 문구, 슬로건, 가로선, 쪽번호를 문항으로 세지 않는다.",
      "문항번호는 실제 인쇄된 번호를 사용하고 누락·중복하지 않는다.",
      "같은 페이지의 서로 다른 문항에 동일하거나 거의 동일한 사각형 좌표를 절대로 반환하지 않는다. 각 문항은 반드시 자기 문항번호가 보이는 고유 영역이어야 한다.",
      "반환 전 같은 페이지의 모든 사각형을 서로 비교하여, 한 문항 영역이 다른 문항 영역과 대부분 겹치면 좌표를 다시 찾는다.",
      "영역이 명확하면 confidence를 높게, 페이지 경계에 걸리거나 영역이 애매하면 낮게 주고 review_reason에 이유를 쓴다.",
      "확실하면 review_reason은 빈 문자열로 둔다.",
      `시험지 정보: ${source.title} / ${source.grade ?? ""} / ${source.subject ?? ""}`,
    ].join("\n");

    const analysisPrompt = [
      "너는 한국 중·고등 수학 문항을 교육적으로 분석하는 Problem DNA 엔진이다.",
      "첫 번째 PDF는 시험지, 두 번째 PDF는 해설지다. 문항 좌표는 판단하지 않고 실제 문항별 DNA만 만든다.",
      `모든 문항의 schema_version은 반드시 ${PROBLEM_DNA_VERSION}로 쓴다.`,
      "정답은 정답표와 해설을 교차 확인하고, 확인되지 않으면 빈 문자열로 둔다.",
      "basic은 과목·학년·교육과정·대/중/소단원·세부주제·문항형식을 객관적으로 분류한다.",
      "concept는 핵심/보조/선수/연결 개념, 공식·정리, 개념 적용 순서와 직접·변형·역방향·유도·결합 적용을 기록한다.",
      "thinking은 첫 진입점, 풀이 단계, 요구 사고, 표현 전환, 핵심 발상, 결정적 단계, 검산 방법을 기록한다.",
      "difficulty.final_grade는 반드시 정수 1~5 중 하나다. 1=개념 확인, 2=기본 유형, 3=응용 유형, 4=준킬러, 5=최상위·킬러다.",
      "개념·조건해석·발상·계산·풀이길이·함정·시간부담·개념결합수·사고단계수를 각각 먼저 평가한 뒤 최종 단계를 정한다. 중간 단계로 일괄 판정하지 않는다.",
      "calculation과 difficulty의 세부 점수는 0~100이다. estimated_minutes는 숙련된 해당 학년 학생 기준이다.",
      "expected_errors는 개념결손·개념혼동·조건누락·조건오독·식설정·부호·계산·경우누락·범위누락·그래프해석·도형오개념·성급한일반화·검증부족·시간압박 중 실제 가능성이 있는 것만 쓴다.",
      "traps는 불필요조건·숨은조건·정의역/치역·중근·부호변화·경계값·예외값·오해도형·익숙한유형착각·공식기계대입·계산으로핵심은폐 중 실제 근거가 있는 것만 쓴다.",
      "모든 EvidenceTag의 evidence는 문제 또는 해설에서 그렇게 판단한 구체적 근거를 한 문장으로 쓴다.",
      "educational_value는 대표성·교육가치·변형가능성·재출제가능성·내신/모의고사/수능 적합도와 훈련목표, 선수·후속·유사문항 특징, 변형지점을 기록한다.",
      "summary는 교사가 바로 이해할 수 있도록 짧고 구체적으로 작성한다. 불확실한 필드가 있으면 review_required=true와 이유를 남긴다.",
      "빈 배열은 허용하지만 근거 없는 태그를 억지로 채우지 않는다. 문항번호를 누락하거나 중복하지 않는다.",
      `시험지 정보: ${source.title} / ${source.source ?? ""} / ${source.grade ?? ""} / ${source.subject ?? ""}`,
    ].join("\n");

    const cropPromise = callOpenAi({
        apiKey,
        model: cropModel,
        prompt: cropPrompt,
        files: [examUrl],
        schemaName: "math_exam_visual_bounding_boxes_v1",
        schema: cropSchema,
        maxOutputTokens: 9000,
      });
    const analysisPromise = mode === "full" && solutionUrl ? callOpenAi({
        apiKey,
        model: analysisModel,
        prompt: analysisPrompt,
        files: [examUrl, solutionUrl],
        schemaName: "math_problem_dna_v2",
        schema: analysisSchema,
        maxOutputTokens: 24000,
      }) : Promise.resolve(null);
    const [cropRaw, analysisRaw] = await Promise.all([cropPromise, analysisPromise]);

    let cropPayload = parseJson<{ questions: AiCropQuestion[] }>(cropRaw);
    let crops = constrainCropsByNextQuestion(normalizeAiCrops(cropPayload.questions));
    if (!crops.length) {
      throw new Error("AI가 문항 영역을 찾지 못했습니다.");
    }

    // 같은 페이지의 여러 문항이 첫 문항 좌표를 공유하는 잘못된 결과는 저장하지 않는다.
    // 중복이 감지되면 시험지 비전을 한 번 더 호출해 좌표만 바로잡는다.
    let duplicateCrops = findDuplicateCrops(crops);
    let suspiciousCrops = findSuspiciousCrops(crops);
    if (duplicateCrops.length || suspiciousCrops.length) {
      await supabase
        .from("source_analysis")
        .update({
          progress: 55,
          current_step: `잘못된 문항 영역 ${duplicateCrops.length + suspiciousCrops.length}건 감지 · 좌표 재판독 중`,
        })
        .eq("id", analysis.id);

      const correctionPrompt = [
        cropPrompt,
        "",
        "이전 판독에 아래와 같은 중복 또는 비정상 문항 영역 오류가 발생했다.",
        JSON.stringify({ duplicates: duplicateCrops, suspicious: suspiciousCrops }),
        "시험지 전체를 다시 직접 보고 모든 문항의 사각형을 새로 산출하라.",
        "이전 좌표를 복사하거나 재사용하지 말고, 각 question_no가 실제로 보이는 서로 다른 고유 영역만 반환하라.",
        "문항 위/왼쪽의 별표(★)나 장식은 제외하고 실제 문항번호부터 시작하라.",
        "각 문항의 question_number_y를 실제 인쇄된 번호 글자의 맨 위로 다시 측정하라.",
        "반환 직전 각 사각형을 눈으로 다시 확인하여 왼쪽 위에 해당 question_no가 실제로 보이는지 검증하라.",
        "번호가 보이지 않는 수식 일부, 본문 일부, 선택지 일부, 하단 슬로건/가로선은 삭제하라.",
      ].join("\n");

      const correctedRaw = await callOpenAi({
        apiKey,
        model: cropModel,
        prompt: correctionPrompt,
        files: [examUrl],
        schemaName: "math_exam_visual_bounding_boxes_corrected_v2",
        schema: cropSchema,
        maxOutputTokens: 9000,
      });
      cropPayload = parseJson<{ questions: AiCropQuestion[] }>(correctedRaw);
      crops = constrainCropsByNextQuestion(normalizeAiCrops(cropPayload.questions));
      duplicateCrops = findDuplicateCrops(crops);
      suspiciousCrops = findSuspiciousCrops(crops);
    }

    if (duplicateCrops.length || suspiciousCrops.length) {
      const sample = duplicateCrops
        .slice(0, 6)
        .map((item) => `${item.page}쪽 ${item.first}번/${item.second}번`)
        .join(", ");
      const suspiciousSample = suspiciousCrops.slice(0, 6).map((item) => `${item.page}쪽 ${item.question}번(${item.reason})`).join(", ");
      throw new Error(`AI 문항 좌표 오류를 자동으로 막았습니다: ${[sample, suspiciousSample].filter(Boolean).join(" / ")}. 다시 분석해 주세요.`);
    }

    const analysisPayload = analysisRaw ? parseJson<{ questions: AnalysisQuestion[] }>(analysisRaw) : { questions: [] as AnalysisQuestion[] };
    const validatedAnalysis = analysisPayload.questions.map((item) => ({ item, validation: validateProblemDNA(item) }));
    const analysisByNo = new Map(validatedAnalysis.map(({ item, validation }) => [Number(item.question_no), { item, validation }]));

    await supabase
      .from("source_analysis")
      .update({
        progress: 80,
        current_step: `AI 직접 자르기 완료 · ${crops.length}개 문항 저장 중`,
      })
      .eq("id", analysis.id);

    await supabase.from("analysis_questions").delete().eq("analysis_id", analysis.id);

    const rows = crops.map((crop) => {
      const analyzed = analysisByNo.get(crop.question_no);
      const meta = analyzed?.item;
      const validation = analyzed?.validation;
      const legacy = meta ? legacyFieldsFromDNA(meta) : null;
      const combinedConfidence = Math.min(crop.confidence, Number(meta?.summary.ai_confidence ?? 0.55));

      const cropNeedsReview =
        crop.confidence < 0.82 || Boolean(crop.review_reason.trim());

      return {
        analysis_id: analysis.id,
        question_no: crop.question_no,
        answer: meta?.answer?.trim() || null,
        status: meta && validation?.valid && !meta.summary.review_required ? "AUTO_REGISTERED" : meta ? "REVIEW" : "WAITING",
        confidence: combinedConfidence,
        page_no: crop.page_no,
        crop_x: crop.crop_x,
        crop_y: crop.crop_y,
        crop_width: crop.crop_width,
        crop_height: crop.crop_height,
        review_reason: cropNeedsReview
          ? crop.review_reason || "AI가 자른 문항 영역을 확인해 주세요."
          : null,
        ai_result: {
          question_type: legacy?.question_type ?? "unknown",
          subject: legacy?.subject || source.subject || null,
          unit: legacy?.unit || null,
          topic: legacy?.topic || null,
          difficulty: legacy?.difficulty ?? "중",
          summary: legacy?.summary || null,
          problem_dna: meta ?? null,
          analysis_version: meta ? PROBLEM_DNA_VERSION : "legacy-v1",
          crop_engine: "AI_VISUAL_BOUNDING_BOX_V1",
          ai_crop: {
            confidence: crop.confidence,
            review_reason: crop.review_reason || null,
            bounding_box: {
              x: crop.crop_x,
              y: crop.crop_y,
              width: crop.crop_width,
              height: crop.crop_height,
              question_number_y: crop.question_number_y,
            },
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
        const result = (question.ai_result ?? {}) as Record<string, unknown>;
        return (
          Boolean(question.review_reason) ||
          Number(question.confidence ?? 0) < 0.82 ||
          !String(question.answer ?? "").trim() ||
          !String(result.unit ?? "").trim() ||
          !String(result.topic ?? "").trim() ||
          String(result.question_type ?? "unknown") === "unknown" ||
          !Boolean((result.problem_dna as Record<string, unknown> | undefined)?.schema_version)
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

    const objectiveCount = analysisPayload.questions.filter((question) => question.basic.question_format === "objective").length;
    const subjectiveCount = analysisPayload.questions.filter((question) => question.basic.question_format === "short_answer" || question.basic.question_format === "essay").length;

    const finishedAt = new Date().toISOString();
    const updated = await supabase
      .from("source_analysis")
      .update({
        status: mode === "full" ? "REVIEW" : "WAITING",
        progress: mode === "full" ? 100 : 45,
        current_step: mode === "full" ? `빠른 자르기·분석 완료 · ${rows.length}개 문항 · 재확인 권장 ${reviewIds.length}개` : `빠른 자르기 완료 · ${rows.length}개 문항 · 문항 분석 대기`,
        total_questions: rows.length,
        objective_count: objectiveCount,
        subjective_count: subjectiveCount,
        finished_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq("id", analysis.id)
      .select("*")
      .single();

    if (updated.error) throw updated.error;

    const totalTokens =
      Number(cropRaw.usage?.total_tokens ?? 0) +
      Number(analysisRaw?.usage?.total_tokens ?? 0);

    await supabase
      .from("analysis_jobs")
      .update({
        status: "DONE",
        progress: mode === "full" ? 100 : 45,
        finished_at: finishedAt,
        updated_at: finishedAt,
        logs: [
          ...baseLogs,
          {
            at: finishedAt,
            message: mode === "full" ? `${rows.length}개 빠른 자르기·분석 완료${
              totalTokens
                ? ` · ${totalTokens.toLocaleString("ko-KR")} tokens`
                : ""
            }` : `${rows.length}개 빠른 자르기 완료 · 문항 분석 대기`,
          },
        ],
      })
      .eq("id", jobId);

    return NextResponse.json({
      success: true,
      analysis: updated.data,
      questionCount: rows.length,
      reviewPending: reviewIds.length,
      cropValidCount: crops.filter((crop) => crop.confidence >= 0.82).length,
      cropInvalidCount: crops.filter((crop) => crop.confidence < 0.82).length,
      mode: mode === "full" ? "CROP_AND_ANALYSIS" : "FAST_CROP_ONLY",
      model: mode === "full" ? `${cropModel} + ${analysisModel}` : cropModel,
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
