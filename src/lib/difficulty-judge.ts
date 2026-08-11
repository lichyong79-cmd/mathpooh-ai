/**
 * SOS 8단계 난이도 판정 엔진 (SOS164)
 *
 * 기존에는 난이도 기준이 두 갈래였다.
 *  - 신규 등록 문항: Problem DNA 안의 csat_difficulty_band 하나에 의존 → 대부분 "3점"으로 쏠림
 *  - 난이도 탭 재판정: 이 파일과 같은 전용 프롬프트 + 관리자 확정 기준표
 *
 * 이제 두 경로가 이 파일 하나만 사용한다.
 * 즉, 관리자가 8단계로 직접 확정해 둔 기준 문항이 신규 문항 판정에도 그대로 적용된다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DIFFICULTY_SCALE, DIFFICULTY_SCALE_VERSION, normalizeDifficulty, type DifficultyValue } from "@/lib/difficulty-scale";
import { canonicalSubject } from "@/lib/subject";

export const DIFFICULTY_JUDGE_VERSION = "difficulty-v164-8scale" as const;

export type DifficultyBandName =
  | "two_point" | "three_point" | "three_hard" | "four_easy"
  | "four_medium" | "four_hard" | "semi_killer" | "killer";

export type DifficultyJudgement = {
  final_grade: DifficultyValue;
  csat_point_equivalent: 2 | 3 | 4;
  csat_difficulty_band: DifficultyBandName;
  reason: string;
  confidence: number;
};

const allowedGrades = DIFFICULTY_SCALE.map((x) => x.value) as DifficultyValue[];

export const difficultyJudgeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["final_grade", "csat_point_equivalent", "csat_difficulty_band", "reason", "confidence"],
  properties: {
    final_grade: { type: "string", enum: allowedGrades },
    csat_point_equivalent: { type: "integer", enum: [2, 3, 4] },
    csat_difficulty_band: {
      type: "string",
      enum: ["two_point", "three_point", "three_hard", "four_easy", "four_medium", "four_hard", "semi_killer", "killer"],
    },
    reason: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

export function buildDifficultyJudgePrompt(dna: any, references = "") {
  const basic = dna?.basic ?? {};
  const thinking = dna?.thinking ?? {};
  const solution = dna?.solution ?? {};
  const concept = dna?.concept ?? {};
  return `당신은 한국 수능 고등수학 문항 난이도 판정 전문가입니다. MATHPOOH SOS는 기존 1~5 난이도를 완전히 폐지하고 아래 8단계만 사용합니다.

[공식 8단계]
1=2점: 정의·공식·성질의 거의 직접 적용, 매우 짧고 전략 선택 부담이 거의 없음.
2=3점: 정형 대표유형, 약간의 조건 해석·식 정리·계산이 있으나 4점급 사고는 아님.
3=어3: 3점 중 상단. 3점 형식이지만 조건 해석/계산/연결이 까다로워 쉬운 4점 직전 수준.
4=쉬4: 4점 입문. 실질적 사고가 필요하지만 구조가 비교적 잘 보이고 풀이 진입이 쉬움.
5=적4: 표준적인 수능 4점의 중심. 개념 결합·조건 번역·관계 발견·풀이 방향 선택이 의미 있게 요구됨.
6=어4: 상위권에게도 부담이 분명한 어려운 4점. 복합추론·경우분류·구조변환·상당한 계산/해석 부담.
7=준킬러: 비정형 핵심 발상 또는 여러 단계 추론이 필요하며 상위권 변별력이 뚜렷함.
8=킬러: 최상위 난도. 핵심 발상 자체가 매우 어렵고 복합적 비정형 추론이 필수.

[판정 원칙]
- 3점↔어3, 어3↔쉬4, 쉬4↔적4, 적4↔어4 경계를 특히 세밀하게 구분하세요.
- 배점 표기보다 실제 수능 체감 난도를 우선합니다.
- 단순히 계산이 길다는 이유만으로 등급을 올리지 마세요.
- 애매하다고 해서 2(3점)나 5(적4) 같은 중간값으로 도피하지 마세요. 문항 근거로 한 등급을 확정합니다.
- 전체 분포를 억지로 맞추지 말고 문항을 독립 판정하세요.

과목:${basic.subject ?? ""} / 단원:${[basic.major_unit, basic.middle_unit, basic.minor_unit].filter(Boolean).join(" > ")} / 주제:${basic.detailed_topic ?? ""}
핵심개념:${JSON.stringify(concept.core_concepts ?? [])}
사고과정:${JSON.stringify(thinking.process ?? [])}
핵심발상:${String(thinking.key_insight ?? "")}
대표풀이:${JSON.stringify(solution.representative_solution ?? [])}${references ? `

[관리자 확정 기준 예시]
아래 사례는 관리자가 새 SOS 8단계로 직접 확정한 기준 문항입니다. 대상 문항을 이 사례와 상대 비교해 같은 잣대로 판정하되, 분포를 억지로 맞추지 마세요.
${references}` : ""}
JSON 객체 하나만 출력하세요.`;
}

function outputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  return (payload?.output ?? [])
    .flatMap((x: any) => x?.content ?? [])
    .map((x: any) => x?.text ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * 문항 이미지 1장 + DNA 요약으로 8단계 난이도를 판정한다.
 * imageUrl에는 signed URL과 data URL 모두 사용할 수 있다.
 */
export async function judgeDifficulty(args: {
  apiKey: string;
  model: string;
  imageUrl: string;
  dna: any;
  references?: string;
  timeoutMs?: number;
}): Promise<DifficultyJudgement> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: args.model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: buildDifficultyJudgePrompt(args.dna, args.references ?? "") },
          { type: "input_image", image_url: args.imageUrl, detail: "high" },
        ],
      }],
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "mathpooh_difficulty_8scale", strict: true, schema: difficultyJudgeSchema } },
      max_output_tokens: 1200,
      store: false,
    }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 120_000),
    cache: "no-store",
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(`AI 난이도 판정 실패 (${response.status}): ${raw.slice(0, 800)}`);
  const result = JSON.parse(outputText(JSON.parse(raw))) as DifficultyJudgement;
  if (!allowedGrades.includes(result.final_grade)) throw new Error("8단계 범위를 벗어난 판정입니다.");
  return result;
}

/** 판정 결과를 Problem DNA의 difficulty 영역에 반영한다. */
export function applyJudgedDifficulty(dna: any, result: DifficultyJudgement, previousGrade: string | null = null) {
  const next = dna && typeof dna === "object" ? { ...dna } : {};
  next.difficulty = {
    ...(next.difficulty ?? {}),
    final_grade: Number(result.final_grade),
    csat_point_equivalent: result.csat_point_equivalent,
    csat_difficulty_band: result.csat_difficulty_band,
    csat_basis: result.reason,
    reasons: [{ tag: "난이도 판정", evidence: result.reason, confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)) }],
    scale_version: DIFFICULTY_SCALE_VERSION,
    ai_regraded_at: new Date().toISOString(),
    ai_regrade_confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
    ai_regrade_version: DIFFICULTY_JUDGE_VERSION,
    previous_final_grade: previousGrade,
    band_conflict: false,
  };
  return next;
}

type ReferenceRow = {
  id: string;
  subject: string | null;
  unit: string | null;
  topic: string | null;
  difficulty: string | number | null;
  problem_dna: any;
};

let referenceCache: { at: number; rows: ReferenceRow[] } | null = null;
const REFERENCE_TTL_MS = 5 * 60 * 1000;

/**
 * 관리자가 8단계로 직접 확정한 기준 문항을 읽어 온다.
 * 800문항을 연속 등록해도 5분에 한 번만 조회하도록 캐시한다.
 */
export async function loadAdminFixedReferences(supabase: SupabaseClient): Promise<ReferenceRow[]> {
  if (referenceCache && Date.now() - referenceCache.at < REFERENCE_TTL_MS) return referenceCache.rows;
  try {
    const result = await supabase
      .from("problem_bank_questions")
      .select("id,subject,unit,topic,difficulty,problem_dna")
      .eq("problem_dna->difficulty->>admin_fixed", "true")
      .eq("problem_dna->difficulty->>scale_version", DIFFICULTY_SCALE_VERSION)
      .limit(400);
    if (result.error) throw result.error;
    const rows = (result.data ?? []) as ReferenceRow[];
    referenceCache = { at: Date.now(), rows };
    return rows;
  } catch {
    // 기준 문항 조회에 실패해도 판정 자체는 계속 진행한다.
    referenceCache = { at: Date.now(), rows: [] };
    return [];
  }
}

/** 8단계마다 최대 perGrade개, 같은 과목을 우선해 기준표 텍스트를 만든다. */
export function formatDifficultyReferences(rows: ReferenceRow[], subject?: unknown, perGrade = 2) {
  if (!rows.length) return "";
  const wanted = canonicalSubject(subject);
  const sorted = [...rows].sort((a, b) => {
    const aMatch = canonicalSubject(a.subject) === wanted ? 0 : 1;
    const bMatch = canonicalSubject(b.subject) === wanted ? 0 : 1;
    return aMatch - bMatch;
  });

  const lines: string[] = [];
  for (const scale of DIFFICULTY_SCALE) {
    const picked = sorted.filter((row) => normalizeDifficulty(row.difficulty) === scale.value).slice(0, perGrade);
    for (const row of picked) {
      const dna = row.problem_dna ?? {};
      const basic = dna.basic ?? {};
      const thinking = dna.thinking ?? {};
      lines.push(
        `- ${scale.label} | ${canonicalSubject(row.subject, basic.subject)} | ${row.unit ?? basic.major_unit ?? ""} | ${row.topic ?? basic.detailed_topic ?? ""} | 핵심발상: ${String(thinking.key_insight ?? "")} | 사고단계수: ${(thinking.process ?? []).length}`,
      );
    }
  }
  return lines.join("\n");
}

/** 신규 문항 분석에서 바로 쓸 수 있는 기준표 텍스트. */
export async function difficultyReferenceText(supabase: SupabaseClient, subject?: unknown) {
  return formatDifficultyReferences(await loadAdminFixedReferences(supabase), subject);
}
