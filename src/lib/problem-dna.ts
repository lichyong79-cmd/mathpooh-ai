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
    final_grade: 1 | 2 | 3 | 4 | 5;
    csat_point_equivalent: 2 | 3 | 4;
    csat_difficulty_band: "two_point" | "three_point" | "four_easy" | "four_medium" | "four_hard" | "semi_killer_easy" | "semi_killer_hard" | "killer";
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
      properties: { final_grade: { type: "integer", minimum: 1, maximum: 5 }, csat_point_equivalent: { type: "integer", enum: [2, 3, 4] }, csat_difficulty_band: { type: "string", enum: ["two_point", "three_point", "four_easy", "four_medium", "four_hard", "semi_killer_easy", "semi_killer_hard", "killer"] }, csat_basis: { type: "string" }, concept: score, condition_interpretation: score, insight: score, calculation: score, solution_length: { type: "string", enum: ["짧음", "중간", "김"] }, trap_strength: score, time_burden: score, concept_count: { type: "integer", minimum: 0, maximum: 20 }, thinking_step_count: { type: "integer", minimum: 0, maximum: 30 }, estimated_minutes: { type: "number", minimum: 0, maximum: 120 }, reasons: evidenceArray(8) },
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

/** AI의 중간값 선호를 막고 세부 난이도 지표로 최종 1~5단계를 일관되게 계산한다. */
export function calculateDifficultyLevel(dna: ProblemDNA): 1 | 2 | 3 | 4 | 5 {
  const d = dna.difficulty;
  if (d.csat_point_equivalent === 2 || d.csat_difficulty_band === "two_point") return 1;
  if (d.csat_point_equivalent === 3 || d.csat_difficulty_band === "three_point") return 2;
  if (d.csat_difficulty_band === "four_easy" || d.csat_difficulty_band === "four_medium") return 3;
  if (d.csat_difficulty_band === "four_hard" || d.csat_difficulty_band === "semi_killer_easy") return 4;
  if (d.csat_difficulty_band === "semi_killer_hard" || d.csat_difficulty_band === "killer") return 5;
  // 구버전/비정상 응답에만 사용하는 안전한 보조 계산식.
  const score =
    bounded(d.concept, 0, 100) * 0.14 +
    bounded(d.condition_interpretation, 0, 100) * 0.18 +
    bounded(d.insight, 0, 100) * 0.24 +
    bounded(d.calculation, 0, 100) * 0.13 +
    bounded(d.trap_strength, 0, 100) * 0.08 +
    bounded(d.time_burden, 0, 100) * 0.10 +
    bounded(d.thinking_step_count * 8, 0, 100) * 0.08 +
    bounded(d.concept_count * 20, 0, 100) * 0.05;
  if (score < 29) return 1;
  if (score < 46) return 2;
  if (score < 63) return 3;
  if (score < 79) return 4;
  return 5;
}

export function applyCalculatedDifficulty(dna: ProblemDNA) {
  dna.difficulty.final_grade = calculateDifficultyLevel(dna);
  return dna;
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
  if (!Number.isInteger(finalGrade) || finalGrade < 1 || finalGrade > 5) errors.push("최종 난이도가 1~5단계가 아닙니다.");
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
