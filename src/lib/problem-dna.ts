export const PROBLEM_DNA_VERSION = "problem-dna-v3.4" as const;

export type EvidenceTag = { tag: string; evidence: string; confidence: number };
export type ThinkingStep = { stage: string; action: string; evidence: string };

export type ProblemDNA = {
  schema_version: typeof PROBLEM_DNA_VERSION;
  question_no: number;
  answer: string;
  official_solution: {
    available: boolean;
    matched_question: boolean;
    official_answer: string;
    answer_matches: boolean;
    evidence_summary: string;
    review_reason: string;
  };
  basic: {
    subject: string; grade: string; curriculum: string;
    major_unit: string; middle_unit: string; minor_unit: string; detailed_topic: string;
    question_format: "objective" | "short_answer" | "essay" | "unknown";
    problem_types: string[];
    concept_composition: "single" | "multi" | "unknown";
    presentation_types: string[];
  };
  concept: {
    core_concepts: EvidenceTag[]; supporting_concepts: EvidenceTag[];
    prerequisite_concepts: EvidenceTag[]; linked_concepts: EvidenceTag[];
    formulas: string[]; theorems: string[]; concept_sequence: string[];
    application_methods: EvidenceTag[];
  };
  thinking: {
    process: ThinkingStep[];
    thinking_types: EvidenceTag[];
    entry_point: string; key_insight: string; decisive_step: string; verification_method: string;
  };
  solution: {
    representative_solution: string[]; shortest_solution: string[]; standard_solution: string[];
    alternative_solutions: string[]; approach_types: string[]; strategies: EvidenceTag[];
  };
  abilities: EvidenceTag[];
  difficulty: {
    final_grade: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    scale_version?: "sos8-v1";
    csat_point_equivalent: 2 | 3 | 4;
    csat_difficulty_band: "two_point" | "three_point" | "three_hard" | "four_easy" | "four_medium" | "four_hard" | "semi_killer" | "killer";
    csat_basis: string;
    concept: number; condition_interpretation: number; insight: number; calculation: number;
    solution_length: "짧음" | "중간" | "김";
    trap_strength: number; time_burden: number; concept_count: number; thinking_step_count: number;
    estimated_minutes: number; reasons: EvidenceTag[];
  };
  errors: EvidenceTag[];
  traps: EvidenceTag[];
  educational_value: {
    representative_type: number; educational_value: number; mutation_potential: number;
    reappearance_probability: number; school_exam_suitability: number;
    mock_exam_suitability: number; csat_suitability: number;
    training_objectives: string[]; recommended_student_levels: string[];
    prerequisite_question_features: string[]; followup_question_features: string[];
    similar_question_features: string[]; mutation_points: string[];
  };
  summary: {
    one_line: string; key_insight: string; first_entry_point: string;
    common_sticking_point: string; decisive_solving_point: string; teaching_point: string;
    ai_confidence: number; review_required: boolean; review_reasons: string[];
  };
};

const stringArray = (maxItems: number) => ({ type: "array", items: { type: "string" }, maxItems }) as const;
const score = { type: "number", minimum: 0, maximum: 100 } as const;
const evidenceTagSchema = {
  type: "object", additionalProperties: false, required: ["tag", "evidence", "confidence"],
  properties: { tag: { type: "string" }, evidence: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 } },
} as const;
const evidenceArray = (maxItems: number) => ({ type: "array", items: evidenceTagSchema, maxItems }) as const;
const thinkingStepSchema = {
  type: "object", additionalProperties: false, required: ["stage", "action", "evidence"],
  properties: { stage: { type: "string" }, action: { type: "string" }, evidence: { type: "string" } },
} as const;

export const problemDnaQuestionSchema = {
  type: "object", additionalProperties: false,
  required: ["schema_version", "question_no", "answer", "official_solution", "basic", "concept", "thinking", "solution", "abilities", "difficulty", "errors", "traps", "educational_value", "summary"],
  properties: {
    schema_version: { type: "string", enum: [PROBLEM_DNA_VERSION] },
    question_no: { type: "integer", minimum: 1, maximum: 200 },
    answer: { type: "string" },
    official_solution: {
      type: "object", additionalProperties: false,
      required: ["available", "matched_question", "official_answer", "answer_matches", "evidence_summary", "review_reason"],
      properties: { available: { type: "boolean" }, matched_question: { type: "boolean" }, official_answer: { type: "string" }, answer_matches: { type: "boolean" }, evidence_summary: { type: "string" }, review_reason: { type: "string" } },
    },
    basic: {
      type: "object", additionalProperties: false,
      required: ["subject", "grade", "curriculum", "major_unit", "middle_unit", "minor_unit", "detailed_topic", "question_format", "problem_types", "concept_composition", "presentation_types"],
      properties: {
        subject: { type: "string" }, grade: { type: "string" }, curriculum: { type: "string" }, major_unit: { type: "string" }, middle_unit: { type: "string" }, minor_unit: { type: "string" }, detailed_topic: { type: "string" },
        question_format: { type: "string", enum: ["objective", "short_answer", "essay", "unknown"] },
        problem_types: stringArray(10), concept_composition: { type: "string", enum: ["single", "multi", "unknown"] }, presentation_types: stringArray(10),
      },
    },
    concept: {
      type: "object", additionalProperties: false,
      required: ["core_concepts", "supporting_concepts", "prerequisite_concepts", "linked_concepts", "formulas", "theorems", "concept_sequence", "application_methods"],
      properties: { core_concepts: evidenceArray(7), supporting_concepts: evidenceArray(7), prerequisite_concepts: evidenceArray(7), linked_concepts: evidenceArray(7), formulas: stringArray(10), theorems: stringArray(10), concept_sequence: stringArray(10), application_methods: evidenceArray(8) },
    },
    thinking: {
      type: "object", additionalProperties: false,
      required: ["process", "thinking_types", "entry_point", "key_insight", "decisive_step", "verification_method"],
      properties: { process: { type: "array", items: thinkingStepSchema, maxItems: 12 }, thinking_types: evidenceArray(15), entry_point: { type: "string" }, key_insight: { type: "string" }, decisive_step: { type: "string" }, verification_method: { type: "string" } },
    },
    solution: {
      type: "object", additionalProperties: false,
      required: ["representative_solution", "shortest_solution", "standard_solution", "alternative_solutions", "approach_types", "strategies"],
      properties: { representative_solution: stringArray(12), shortest_solution: stringArray(10), standard_solution: stringArray(12), alternative_solutions: stringArray(8), approach_types: stringArray(9), strategies: evidenceArray(15) },
    },
    abilities: evidenceArray(13),
    difficulty: {
      type: "object", additionalProperties: false,
      required: ["final_grade", "csat_point_equivalent", "csat_difficulty_band", "csat_basis", "concept", "condition_interpretation", "insight", "calculation", "solution_length", "trap_strength", "time_burden", "concept_count", "thinking_step_count", "estimated_minutes", "reasons"],
      properties: { final_grade: { type: "integer", minimum: 1, maximum: 8 }, csat_point_equivalent: { type: "integer", enum: [2, 3, 4] }, csat_difficulty_band: { type: "string", enum: ["two_point", "three_point", "three_hard", "four_easy", "four_medium", "four_hard", "semi_killer", "killer"] }, csat_basis: { type: "string" }, concept: score, condition_interpretation: score, insight: score, calculation: score, solution_length: { type: "string", enum: ["짧음", "중간", "김"] }, trap_strength: score, time_burden: score, concept_count: { type: "integer", minimum: 0, maximum: 20 }, thinking_step_count: { type: "integer", minimum: 0, maximum: 30 }, estimated_minutes: { type: "number", minimum: 0, maximum: 120 }, reasons: evidenceArray(8) },
    },
    errors: evidenceArray(14), traps: evidenceArray(12),
    educational_value: {
      type: "object", additionalProperties: false,
      required: ["representative_type", "educational_value", "mutation_potential", "reappearance_probability", "school_exam_suitability", "mock_exam_suitability", "csat_suitability", "training_objectives", "recommended_student_levels", "prerequisite_question_features", "followup_question_features", "similar_question_features", "mutation_points"],
      properties: { representative_type: score, educational_value: score, mutation_potential: score, reappearance_probability: score, school_exam_suitability: score, mock_exam_suitability: score, csat_suitability: score, training_objectives: stringArray(8), recommended_student_levels: stringArray(6), prerequisite_question_features: stringArray(6), followup_question_features: stringArray(6), similar_question_features: stringArray(6), mutation_points: stringArray(10) },
    },
    summary: {
      type: "object", additionalProperties: false,
      required: ["one_line", "key_insight", "first_entry_point", "common_sticking_point", "decisive_solving_point", "teaching_point", "ai_confidence", "review_required", "review_reasons"],
      properties: { one_line: { type: "string" }, key_insight: { type: "string" }, first_entry_point: { type: "string" }, common_sticking_point: { type: "string" }, decisive_solving_point: { type: "string" }, teaching_point: { type: "string" }, ai_confidence: { type: "number", minimum: 0, maximum: 1 }, review_required: { type: "boolean" }, review_reasons: stringArray(10) },
    },
  },
} as const;

export const problemDnaBatchSchema = { type: "object", additionalProperties: false, required: ["questions"], properties: { questions: { type: "array", minItems: 1, maxItems: 200, items: problemDnaQuestionSchema } } } as const;

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

function bounded(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

/** 8단계 밴드 → 등급. 밴드가 비었으면 0. */
export function difficultyLevelFromBand(band: unknown): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  switch (String(band ?? "").trim()) {
    case "two_point": return 1;
    case "three_point": return 2;
    case "three_hard": return 3;
    case "four_easy": return 4;
    case "four_medium": return 5;
    case "four_hard": return 6;
    case "semi_killer": return 7;
    case "killer": return 8;
    default: return 0;
  }
}

/**
 * 문항 근거(개념·조건해석·발상·계산·함정·시간·사고단계)만으로 계산한 난이도.
 * 밴드 표기와 무관하게 독립적으로 나오는 값이라 밴드 쏠림을 잡는 기준이 된다.
 */
export function evidenceDifficultyLevel(difficulty: ProblemDNA["difficulty"]): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  const d = difficulty ?? ({} as ProblemDNA["difficulty"]);
  const minutes = Number(d.estimated_minutes);
  const minutesScore = Number.isFinite(minutes) ? bounded((minutes - 0.8) * 20, 0, 100) : 0;
  const lengthScore = d.solution_length === "김" ? 100 : d.solution_length === "중간" ? 50 : 0;
  const score =
    bounded(d.concept, 0, 100) * 0.12 +
    bounded(d.condition_interpretation, 0, 100) * 0.17 +
    bounded(d.insight, 0, 100) * 0.24 +
    bounded(d.calculation, 0, 100) * 0.10 +
    bounded(d.trap_strength, 0, 100) * 0.07 +
    bounded(d.time_burden, 0, 100) * 0.09 +
    minutesScore * 0.07 +
    lengthScore * 0.03 +
    bounded(Number(d.thinking_step_count) * 9, 0, 100) * 0.06 +
    bounded(Number(d.concept_count) * 20, 0, 100) * 0.05;
  if (score < 22) return 1;
  if (score < 34) return 2;
  if (score < 44) return 3;
  if (score < 54) return 4;
  if (score < 65) return 5;
  if (score < 76) return 6;
  if (score < 88) return 7;
  return 8;
}

/**
 * 수능형 SOS 8단계 절대난이도: 2점→3점→어3→쉬4→적4→어4→준킬러→킬러.
 *
 * v164 이전에는 csat_difficulty_band 하나만 보고 등급을 정했다.
 * 밴드는 스키마상 필수라 AI가 애매하면 three_point로 몰아넣었고,
 * 그 결과 신규 등록 문항 대부분이 "3점"으로 찍혔다.
 * 이제 밴드와 근거점수를 함께 보고, 둘이 2단계 이상 어긋나면 중간값으로 보정한다.
 */
export function calculateDifficultyLevel(dna: ProblemDNA): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  const evidence = evidenceDifficultyLevel(dna.difficulty);
  const band = difficultyLevelFromBand(dna.difficulty?.csat_difficulty_band);
  if (!band) return evidence;
  const gap = evidence - band;
  if (Math.abs(gap) <= 1) return band;
  const blended = Math.round((band + evidence) / 2);
  return Math.max(1, Math.min(8, blended)) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export function applyCalculatedDifficulty(dna: ProblemDNA) {
  const evidence = evidenceDifficultyLevel(dna.difficulty);
  const band = difficultyLevelFromBand(dna.difficulty?.csat_difficulty_band);
  const final = calculateDifficultyLevel(dna);
  dna.difficulty.final_grade = final;
  dna.difficulty.scale_version = "sos8-v1";
  // 밴드와 근거가 크게 어긋난 문항은 난이도 탭의 이상 검토 대상으로 표시한다.
  (dna.difficulty as Record<string, unknown>).evidence_grade = evidence;
  (dna.difficulty as Record<string, unknown>).band_grade = band || null;
  (dna.difficulty as Record<string, unknown>).band_conflict = Boolean(band) && Math.abs(evidence - band) >= 2;
  return dna;
}

/**
 * SOS249 운영 난이도 단일 기준.
 * 신규 AI 분석 / 문제은행 등록 직전 / DNA 재계산 보조가 모두 이 함수를 사용한다.
 * 관리자가 확정한 문항은 절대 덮어쓰지 않는다.
 */
/**
 * SOS275: 이 문항의 난이도가 "AI가 실제로 문제를 풀어보고 확정한 값"인가.
 *
 * ai_regrade_version만 보면 안 된다. 아래 DNA 공식 재계산이 나중에 돌면
 * 난이도 값과 검토 플래그를 통째로 덮어쓰기 때문에, AI 판정 흔적은 남아 있어도
 * 실제 저장값은 공식 추정치인 경우가 있다. 시간 순서로 구분한다.
 */
export function difficultyAiVerified(dna: any): boolean {
  const d = dna?.difficulty ?? {};
  if (d.admin_fixed === true) return true;
  if (!String(d.ai_regrade_version ?? "").trim()) return false;
  if (String(d.difficulty_decision ?? "") !== "graded") return false;
  const aiAt = Date.parse(String(d.ai_regraded_at ?? ""));
  const dnaAt = Date.parse(String(d.dna_recalculated_at ?? ""));
  // 공식 재계산이 AI 판정보다 나중이면 저장값은 공식이 덮어쓴 것이다.
  if (Number.isFinite(aiAt) && Number.isFinite(dnaAt) && dnaAt > aiAt) return false;
  return true;
}

export function applyOperationalDifficultyPolicy(dna: ProblemDNA, sourceLabel = "") {
  if (!dna?.difficulty) return dna;
  if ((dna.difficulty as Record<string, unknown>).admin_fixed === true) return dna;
  // SOS275(A안): AI가 재풀이해서 확정한 난이도는 공식 추정치로 덮어쓰지 않는다.
  // 이 가드가 없어서 "DNA만 재계산(보조)"을 돌릴 때마다 AI 판정 결과와
  // 검토필요 플래그가 통째로 지워지고 있었다.
  if (difficultyAiVerified(dna)) return dna;

  applyCalculatedDifficulty(dna);
  const difficulty = dna.difficulty as Record<string, unknown>;
  const beforeCap = Number(dna.difficulty.final_grade);
  const source = String(sourceLabel ?? "").normalize("NFKC");
  const ebsWorkbook = /수능특강|수능완성|수특|수완/.test(source);

  // 수특/수완은 운영상 킬러(8)로 자동 확정하지 않는다. 최고 준킬러(7).
  // 다른 출처는 1~8 전체 범위를 그대로 사용한다.
  if (ebsWorkbook && beforeCap === 8) {
    dna.difficulty.final_grade = 7;
    difficulty.source_cap_applied = true;
    difficulty.source_cap_from = 8;
    difficulty.source_cap_to = 7;
    difficulty.source_cap_reason = "EBS 수특/수완 자동분류는 킬러 확정 금지";
  } else {
    difficulty.source_cap_applied = false;
  }

  difficulty.scale_version = "sos8-v1";
  difficulty.classification_policy = "sos275-dna-operational-v2";
  difficulty.difficulty_source = "dna-local-operational";
  // SOS275(A안): 이 값은 AI가 문제를 풀어보고 내린 판정이 아니라 DNA 점수 가중합 추정치다.
  // 예전에는 여기서 graded / review_required=false 도장을 찍어서, 검증된 값처럼 보이게 만들고
  // AI 판정 결과까지 덮어썼다. 이제 추정치임을 명시하고 검증 대상으로 남긴다.
  difficulty.difficulty_decision = "estimated";
  difficulty.difficulty_estimated = true;
  difficulty.difficulty_review_required = false;
  difficulty.difficulty_review_reason = "";
  difficulty.dna_recalculate_version = "dna-local-v2";
  difficulty.dna_recalculated_at = new Date().toISOString();
  return dna;
}

/** 추가 AI 재풀이가 필요한 '예외'만 선별한다. 최종 난이도 기본값은 위 운영 DNA 기준이다. */
export function shouldVerifyOperationalDifficulty(dna: ProblemDNA) {
  const difficulty = dna?.difficulty as Record<string, unknown> | undefined;
  if (!difficulty || difficulty.admin_fixed === true) return false;
  const final = Number(dna.difficulty.final_grade);
  const confidence = Number(dna.summary?.ai_confidence ?? 0);
  // SOS279: SOS275에서 4로 내렸던 값을 7로 되돌린다.
  //
  // 등록 시점의 이 검증은 결과를 실제 난이도에 반영하지 않고 verification_* 메타만 남긴다.
  // 그래서 SOS278 재판정 큐가 같은 문항을 한 번 더 판정하게 되어 AI 호출이 두 배로 든다.
  // 이제 검증은 큐가 맡는다(등록 즉시 자동 등록 → 몇 시간 안에 판정·반영).
  // 여기서는 준킬러 이상만 등록 화면에서 곧바로 눈에 띄도록 남겨 둔다.
  const VERIFY_FROM_GRADE = 7;
  return difficulty.band_conflict === true || final >= VERIFY_FROM_GRADE || (Number.isFinite(confidence) && confidence > 0 && confidence < 0.72);
}

export function validateProblemDNA(value: unknown): { valid: boolean; errors: string[]; dna?: ProblemDNA } {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["DNA가 객체가 아닙니다."] };
  if (value.schema_version !== PROBLEM_DNA_VERSION) errors.push("schema_version이 현재 버전과 다릅니다.");
  if (!Number.isInteger(value.question_no) || Number(value.question_no) < 1) errors.push("question_no가 올바르지 않습니다.");
  for (const key of ["official_solution", "basic", "concept", "thinking", "solution", "difficulty", "educational_value", "summary"]) if (!isRecord(value[key])) errors.push(`${key} 영역이 없습니다.`);
  for (const key of ["abilities", "errors", "traps"]) if (!Array.isArray(value[key])) errors.push(`${key}가 배열이 아닙니다.`);
  const confidence = isRecord(value.summary) ? Number(value.summary.ai_confidence) : NaN;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push("ai_confidence가 0~1 범위가 아닙니다.");
  const finalGrade = isRecord(value.difficulty) ? Number(value.difficulty.final_grade) : NaN;
  if (!Number.isInteger(finalGrade) || finalGrade < 1 || finalGrade > 8) errors.push("최종 난이도가 SOS 8단계(2점~킬러) 범위가 아닙니다.");
  return errors.length ? { valid: false, errors } : { valid: true, errors: [], dna: value as unknown as ProblemDNA };
}

export function legacyFieldsFromDNA(dna: ProblemDNA) {
  const f = dna.basic.question_format;
  return { question_type: f === "objective" ? "multiple_choice" : f === "short_answer" ? "short_answer" : f === "essay" ? "essay" : "unknown", subject: dna.basic.subject, unit: dna.basic.minor_unit || dna.basic.middle_unit || dna.basic.major_unit, topic: dna.basic.detailed_topic, difficulty: dna.difficulty.final_grade, summary: dna.summary.one_line };
}

export function collectProblemDnaTags(dna: ProblemDNA) {
  const values = [dna.basic.subject, dna.basic.grade, dna.basic.curriculum, dna.basic.major_unit, dna.basic.middle_unit, dna.basic.minor_unit, dna.basic.detailed_topic, ...dna.basic.problem_types, ...dna.basic.presentation_types, ...dna.concept.core_concepts.map((x) => x.tag), ...dna.concept.supporting_concepts.map((x) => x.tag), ...dna.thinking.thinking_types.map((x) => x.tag), ...dna.solution.strategies.map((x) => x.tag), ...dna.abilities.map((x) => x.tag), ...dna.errors.map((x) => x.tag), ...dna.traps.map((x) => x.tag), ...dna.educational_value.training_objectives];
  return [...new Set(values.map((x) => String(x ?? "").trim()).filter(Boolean))];
}

export function problemDnaEmbeddingText(dna: ProblemDNA) {
  return [`과목/학년: ${dna.basic.subject} ${dna.basic.grade}`, `단원: ${[dna.basic.major_unit, dna.basic.middle_unit, dna.basic.minor_unit].filter(Boolean).join(" > ")}`, `세부주제: ${dna.basic.detailed_topic}`, `핵심개념: ${dna.concept.core_concepts.map((x) => x.tag).join(", ")}`, `사고요소: ${dna.thinking.thinking_types.map((x) => x.tag).join(", ")}`, `풀이전략: ${dna.solution.strategies.map((x) => x.tag).join(", ")}`, `요구능력: ${dna.abilities.map((x) => x.tag).join(", ")}`, `예상오류: ${dna.errors.map((x) => x.tag).join(", ")}`, `함정: ${dna.traps.map((x) => x.tag).join(", ")}`, `훈련목적: ${dna.educational_value.training_objectives.join(", ")}`, `난이도: ${dna.difficulty.final_grade}`, `요약: ${dna.summary.one_line}`].join("\n");
}
