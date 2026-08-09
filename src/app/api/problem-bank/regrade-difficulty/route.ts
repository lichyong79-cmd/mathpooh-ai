import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type DifficultyResult = {
  final_grade: "1" | "2" | "3" | "4" | "5";
  csat_point_equivalent: 2 | 3 | 4;
  csat_difficulty_band:
    | "two_point"
    | "three_point"
    | "four_easy"
    | "four_medium"
    | "four_hard"
    | "semi_killer_easy"
    | "semi_killer_hard"
    | "killer";
  reason: string;
  confidence: number;
};

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  return (payload?.output ?? [])
    .flatMap((item: any) => item?.content ?? [])
    .map((content: any) => content?.text ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseJson(text: string): DifficultyResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as DifficultyResult;
  if (!["1", "2", "3", "4", "5"].includes(String(parsed.final_grade))) {
    throw new Error("AI 난이도 결과가 1~5단계가 아닙니다.");
  }
  return parsed;
}

function difficultyPrompt(existingDna: any) {
  const basic = existingDna?.basic ?? {};
  const thinking = existingDna?.thinking ?? {};
  const solution = existingDna?.solution ?? {};
  const concept = existingDna?.concept ?? {};

  return `
당신은 한국 고등수학 문항 난이도 판정 전문가입니다.
이번 작업은 "난이도만 재판정"하는 작업입니다.
기존 문항의 단원, 유형, 개념, 사고과정, 풀이, 정답 등 다른 DNA는 수정하지 마세요.

[절대 기준]
1단계 = 수능 2점급 또는 매우 쉬운 3점급. 개념 1개를 거의 직접 적용하고 계산이 짧다.
2단계 = 일반적인 수능 3점급. 대표유형이며 익숙한 풀이가 가능하다.
3단계 = 쉬운~보통 4점급. 개념 결합, 식 변형, 그래프/조건 해석 등 한 번 이상의 의미 있는 사고가 필요하다.
4단계 = 어려운 4점~쉬운 준킬러급. 여러 조건 결합, 경우분류, 복합 추론, 긴 계산, 비정형 변형 중 하나 이상이 분명하다.
5단계 = 어려운 준킬러~킬러급. 발상 자체가 어렵거나 여러 단계의 비정형 추론이 필요하고 상위권 변별력이 높다.

[판정 원칙]
- 1~2단계에 보수적으로 몰지 마세요.
- 반대로 단순히 사고단계 수가 많다는 이유만으로 4~5단계로 올리지 마세요.
- 최종 단계는 "해당 과목을 정상적으로 학습한 수능 응시생 기준의 체감 난도"로 판단하세요.
- 출처(EBS/교재/내신)나 문제번호는 난이도 근거로 사용하지 마세요.
- 기존 final_grade는 참고하지 말고 새로 판정하세요.
- 문제 이미지가 최우선 근거이며, 아래 기존 DNA는 보조 근거입니다.

[기존 DNA 요약]
과목: ${basic.subject ?? ""}
대단원: ${basic.major_unit ?? ""}
중단원: ${basic.middle_unit ?? ""}
소단원: ${basic.minor_unit ?? ""}
세부주제: ${basic.detailed_topic ?? ""}
핵심개념: ${JSON.stringify(concept.core_concepts ?? [])}
사고과정: ${JSON.stringify(thinking.process ?? [])}
핵심발상: ${String(thinking.key_insight ?? "")}
대표풀이: ${JSON.stringify(solution.representative_solution ?? [])}

아래 JSON 객체 하나만 출력하세요.
{
  "final_grade": "1|2|3|4|5",
  "csat_point_equivalent": 2|3|4,
  "csat_difficulty_band": "two_point|three_point|four_easy|four_medium|four_hard|semi_killer_easy|semi_killer_hard|killer",
  "reason": "핵심 난이도 근거 1~2문장",
  "confidence": 0.0~1.0
}
`.trim();
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const problemId = String(body?.problemId ?? "").trim();
    if (!problemId) {
      return NextResponse.json({ success: false, message: "problemId가 필요합니다." }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: problem, error } = await supabase
      .from("problem_bank_questions")
      .select("id,analysis_question_id,question_image_path,problem_dna,difficulty")
      .eq("id", problemId)
      .single();

    if (error || !problem) {
      return NextResponse.json({ success: false, message: error?.message || "문항을 찾지 못했습니다." }, { status: 404 });
    }

    if (!problem.question_image_path) {
      return NextResponse.json({ success: false, message: "문항 이미지가 없어 난이도를 재판정할 수 없습니다." }, { status: 400 });
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from("analysis-question-images")
      .createSignedUrl(problem.question_image_path, 600);

    if (signedError || !signed?.signedUrl) {
      return NextResponse.json({ success: false, message: signedError?.message || "문항 이미지 URL 생성 실패" }, { status: 500 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, message: "OPENAI_API_KEY가 없습니다." }, { status: 500 });
    }

    const model = process.env.OPENAI_DIFFICULTY_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: difficultyPrompt(problem.problem_dna) },
            { type: "input_image", image_url: signed.signedUrl },
          ],
        }],
        max_output_tokens: 500,
      }),
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: `AI 난이도 재판정 실패 (${response.status}): ${await response.text()}` },
        { status: 500 },
      );
    }

    const payload = await response.json();
    const difficulty = parseJson(extractOutputText(payload));

    const dna = problem.problem_dna && typeof problem.problem_dna === "object"
      ? { ...(problem.problem_dna as Record<string, any>) }
      : {};

    dna.difficulty = {
      ...(dna.difficulty ?? {}),
      final_grade: difficulty.final_grade,
      csat_point_equivalent: difficulty.csat_point_equivalent,
      csat_difficulty_band: difficulty.csat_difficulty_band,
      reasons: [difficulty.reason],
      ai_regraded_at: new Date().toISOString(),
      ai_regrade_confidence: difficulty.confidence,
      ai_regrade_version: "difficulty-v177",
    };

    const { error: updateError } = await supabase
      .from("problem_bank_questions")
      .update({
        difficulty: difficulty.final_grade,
        problem_dna: dna,
        updated_at: new Date().toISOString(),
      })
      .eq("id", problemId);

    if (updateError) {
      return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      problemId,
      difficulty: difficulty.final_grade,
      reason: difficulty.reason,
      confidence: difficulty.confidence,
      version: "difficulty-v177",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "난이도 재판정 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
