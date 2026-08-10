import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Grade = "1" | "2" | "3" | "4" | "5";

type DifficultyResult = {
  final_grade: Grade;
  csat_point_equivalent: 2 | 3 | 4;
  csat_difficulty_band:
    | "two_point" | "three_point" | "four_easy" | "four_medium"
    | "four_hard" | "semi_killer_easy" | "semi_killer_hard" | "killer";
  reason: string;
  confidence: number;
};

function outputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  return (payload?.output ?? [])
    .flatMap((item: any) => item?.content ?? [])
    .map((item: any) => item?.text ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeGrade(value: unknown): Grade | "" {
  const raw = String(value ?? "").trim();
  return /^[1-5]$/.test(raw) ? (raw as Grade) : "";
}

function allowedFromCurrent(current: Grade | ""): Grade[] {
  if (current === "1") return ["1", "2", "3"];
  if (current === "2") return ["2", "3", "4"];
  if (current === "3") return ["3", "4", "5"];
  if (current === "4") return ["4", "5"];
  if (current === "5") return ["5"];
  return ["1", "2", "3", "4", "5"];
}

function schema(allowed: Grade[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["final_grade", "csat_point_equivalent", "csat_difficulty_band", "reason", "confidence"],
    properties: {
      final_grade: { type: "string", enum: allowed },
      csat_point_equivalent: { type: "integer", enum: [2, 3, 4] },
      csat_difficulty_band: {
        type: "string",
        enum: ["two_point", "three_point", "four_easy", "four_medium", "four_hard",
          "semi_killer_easy", "semi_killer_hard", "killer"],
      },
      reason: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
  } as const;
}

function prompt(dna: any, current: Grade | "", allowed: Grade[]) {
  const basic = dna?.basic ?? {};
  const thinking = dna?.thinking ?? {};
  const solution = dna?.solution ?? {};
  const concept = dna?.concept ?? {};

  return `
당신은 한국 고등수학 수능 문항 난이도 판정 전문가입니다.
이번 작업은 MATHPOOH SOS의 기존 난이도 보정 재판정입니다.
난이도 외 단원·유형·개념·풀이·정답 등 다른 DNA는 수정하지 마세요.

[최종 기준]
1단계 = 수능 2점급.
정의·공식·성질 하나를 거의 직접 적용하면 끝나는 매우 쉬운 문항이다.
조건 해석이나 풀이 전략 선택이 사실상 필요 없고 계산도 짧다.
대표유형이라는 이유만으로 1을 주지 마라.

2단계 = 수능 3점급.
대표유형을 인식하고 정형적인 풀이를 적용한다.
약간의 조건 해석·식 정리·계산은 있지만 수능 4점 수준의 실질적 사고는 아니다.

3단계 = 평범한 수능 4점급.
일반적인 4점 문항의 기준점이다.
개념 결합, 조건의 수학적 번역, 의미 있는 식 변형, 관계 발견, 그래프·도형 해석,
풀이 방향 선택 중 하나 이상이 실질적으로 요구되면 3을 적극 검토한다.
풀이가 익숙하거나 계산이 짧다는 이유로 평범한 4점을 2로 낮추지 마라.

4단계 = 어려운 수능 4점 또는 쉬운 준킬러급.
여러 조건 동시 통제, 경우분류, 구조변환, 복합추론, 까다로운 그래프·도형 해석,
상당한 계산 부담 또는 비정형 핵심 발상 중 하나 이상이 본질적이다.

5단계 = 상위 준킬러 또는 킬러급.
핵심 발상 자체가 어렵거나 여러 단계의 비정형 추론이 필요하고 상위권 변별력이 뚜렷하다.
단순히 계산이 길다는 이유만으로 5를 주지 마라.

[이번 보정 허용 범위]
현재 저장 난이도: ${current || "미분류"}
이번 문항은 반드시 ${allowed.join(", ")} 중 하나로만 판정한다.

고정 규칙:
현재 1 → 새 1/2/3
현재 2 → 새 2/3/4
현재 3 → 새 3/4/5
현재 4 → 새 4/5
현재 5 → 5 유지

[경계]
1 vs 2: 공식·정의의 거의 직접 적용이 아니면 1을 쉽게 주지 마라.
2 vs 3: 평범한 수능 4점으로 출제할 만한 실질적 사고가 있으면 3이다.
3 vs 4: 단순 개념 결합은 3. 상위권에게도 분명한 부담이 있는 어려운 4점/준킬러부터 4.
4 vs 5: 어려운 4점/쉬운 준킬러는 4. 상위 준킬러/킬러만 5.

[보조 DNA]
과목: ${basic.subject ?? ""}
대단원: ${basic.major_unit ?? ""}
중단원: ${basic.middle_unit ?? ""}
소단원: ${basic.minor_unit ?? ""}
세부주제: ${basic.detailed_topic ?? ""}
핵심개념: ${JSON.stringify(concept.core_concepts ?? [])}
사고과정: ${JSON.stringify(thinking.process ?? [])}
핵심발상: ${String(thinking.key_insight ?? "")}
대표풀이: ${JSON.stringify(solution.representative_solution ?? [])}

각 문항을 독립적으로 판정하고 전체 분포를 맞추려 하지 마세요.
JSON 객체 하나만 출력하세요.
`.trim();
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const problemId = String(body?.problemId ?? "").trim();
    if (!problemId) return NextResponse.json({ success: false, message: "problemId가 필요합니다." }, { status: 400 });

    const supabase = await createClient();
    const { data: problem, error } = await supabase
      .from("problem_bank_questions")
      .select("id,question_image_path,problem_dna,difficulty")
      .eq("id", problemId)
      .single();

    if (error || !problem) {
      return NextResponse.json({ success: false, message: error?.message || "문항을 찾지 못했습니다." }, { status: 404 });
    }

    const current = normalizeGrade(problem.difficulty);
    const allowed = allowedFromCurrent(current);

    if (current === "5") {
      return NextResponse.json({
        success: true, problemId, difficulty: "5", previousDifficulty: "5",
        allowedGrades: ["5"], skipped: true, reason: "기존 5단계 유지", confidence: 1, version: "difficulty-v179"
      });
    }

    if (!problem.question_image_path) {
      return NextResponse.json({ success: false, message: "문항 이미지가 없습니다." }, { status: 400 });
    }

    const downloaded = await supabase.storage.from("question-images").download(problem.question_image_path);
    if (downloaded.error || !downloaded.data) {
      return NextResponse.json({ success: false, message: downloaded.error?.message || "문항 이미지 다운로드 실패" }, { status: 500 });
    }

    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const mime = downloaded.data.type || "image/webp";
    const imageDataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: false, message: "OPENAI_API_KEY가 없습니다." }, { status: 500 });

    const model = process.env.OPENAI_DIFFICULTY_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt(problem.problem_dna, current, allowed) },
            { type: "input_image", image_url: imageDataUrl, detail: "high" },
          ],
        }],
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "mathpooh_difficulty_v179", strict: true, schema: schema(allowed) } },
        max_output_tokens: 1200,
        store: false,
      }),
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
    });

    const raw = await response.text();
    if (!response.ok) {
      let errorCode = "";
      try { errorCode = String(JSON.parse(raw)?.error?.code ?? ""); } catch {}
      return NextResponse.json({
        success: false,
        message: `AI 난이도 재판정 실패 (${response.status}): ${raw.slice(0, 800)}`,
        errorCode,
        httpStatus: response.status,
      }, { status: response.status === 429 ? 429 : 500 });
    }

    const payload = JSON.parse(raw);
    const text = outputText(payload);
    if (!text) throw new Error("AI 난이도 응답이 비어 있습니다.");

    const result = JSON.parse(text) as DifficultyResult;
    if (!allowed.includes(result.final_grade)) {
      throw new Error(`허용 범위 ${allowed.join("/")}를 벗어난 판정입니다.`);
    }

    const dna = problem.problem_dna && typeof problem.problem_dna === "object"
      ? { ...(problem.problem_dna as Record<string, any>) }
      : {};

    dna.difficulty = {
      ...(dna.difficulty ?? {}),
      final_grade: result.final_grade,
      csat_point_equivalent: result.csat_point_equivalent,
      csat_difficulty_band: result.csat_difficulty_band,
      reasons: [result.reason],
      ai_regraded_at: new Date().toISOString(),
      ai_regrade_confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
      ai_regrade_version: "difficulty-v179",
      previous_final_grade: current || null,
      allowed_regrade_grades: allowed,
    };

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("problem_bank_questions")
      .update({ difficulty: result.final_grade, problem_dna: dna, updated_at: now })
      .eq("id", problemId);

    if (updateError) return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      problemId,
      difficulty: result.final_grade,
      previousDifficulty: current || null,
      allowedGrades: allowed,
      reason: result.reason,
      confidence: result.confidence,
      version: "difficulty-v179",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "난이도 재판정 중 오류가 발생했습니다.",
    }, { status: 500 });
  }
}
