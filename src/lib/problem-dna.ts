export const PROBLEM_DNA_VERSION = "problem-dna-v2.0" as const;

export type EvidenceTag = { tag: string; evidence: string; confidence: number };

export type ProblemDNA = {
  schema_version: typeof PROBLEM_DNA_VERSION;
  question_no: number;
  answer: string;
  basic: { subject: string; grade: string; curriculum: string; major_unit: string; middle_unit: string; minor_unit: string; detailed_topic: string; question_format: "objective" | "short_answer" | "essay" | "unknown"; problem_types: string[]; concept_count: "single" | "multi" | "unknown" };
  concept: { core_concepts: EvidenceTag[]; supporting_concepts: EvidenceTag[]; prerequisite_concepts: EvidenceTag[]; linked_concepts: EvidenceTag[]; formulas_theorems: string[]; concept_sequence: string[]; application_types: EvidenceTag[] };
  thinking: { entry_point: string; solution_steps: string[]; required_reasoning: EvidenceTag[]; representation_changes: string[]; key_insight: string; decisive_step: string; verification_method: string };
  calculation: { calculation_load: number; algebra_load: number; arithmetic_load: number; symbolic_complexity: number; case_count: number; likely_bottlenecks: EvidenceTag[] };
  difficulty: { overall_level: "하" | "중하" | "중" | "중상" | "상" | "최상"; score_100: number; concept_demand: number; reasoning_demand: number; calculation_demand: number; condition_interpretation_demand: number; time_pressure: number; estimated_minutes: number; difficulty_reasons: EvidenceTag[] };
  intention: { primary_intention: string; assessed_abilities: EvidenceTag[]; expected_solution_path: string; alternate_solution_paths: string[] };
  expected_errors: EvidenceTag[];
  traps: EvidenceTag[];
  educational_value: { representative_type: number; educational_value: number; mutation_potential: number; reappearance_probability: number; school_exam_suitability: number; mock_exam_suitability: number; csat_suitability: number; training_objectives: string[]; recommended_student_levels: string[]; prerequisite_question_features: string[]; followup_question_features: string[]; similar_question_features: string[]; mutation_points: string[] };
  summary: { one_line: string; key_insight: string; first_entry_point: string; common_sticking_point: string; decisive_solving_point: string; teaching_point: string; ai_confidence: number; review_required: boolean; review_reasons: string[] };
};

const evidenceTagSchema = { type: "object", additionalProperties: false, required: ["tag", "evidence", "confidence"], properties: { tag: { type: "string" }, evidence: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 } } } as const;
const stringArray = (maxItems: number) => ({ type: "array", items: { type: "string" }, maxItems }) as const;
const score = { type: "number", minimum: 0, maximum: 100 } as const;
const evidenceArray = (maxItems: number) => ({ type: "array", items: evidenceTagSchema, maxItems }) as const;

export const problemDnaQuestionSchema = {
  type: "object", additionalProperties: false,
  required: ["schema_version", "question_no", "answer", "basic", "concept", "thinking", "calculation", "difficulty", "intention", "expected_errors", "traps", "educational_value", "summary"],
  properties: {
    schema_version: { type: "string", enum: [PROBLEM_DNA_VERSION] }, question_no: { type: "integer", minimum: 1, maximum: 200 }, answer: { type: "string" },
    basic: { type: "object", additionalProperties: false, required: ["subject", "grade", "curriculum", "major_unit", "middle_unit", "minor_unit", "detailed_topic", "question_format", "problem_types", "concept_count"], properties: { subject:{type:"string"}, grade:{type:"string"}, curriculum:{type:"string"}, major_unit:{type:"string"}, middle_unit:{type:"string"}, minor_unit:{type:"string"}, detailed_topic:{type:"string"}, question_format:{type:"string",enum:["objective","short_answer","essay","unknown"]}, problem_types:stringArray(8), concept_count:{type:"string",enum:["single","multi","unknown"]} } },
    concept: { type:"object", additionalProperties:false, required:["core_concepts","supporting_concepts","prerequisite_concepts","linked_concepts","formulas_theorems","concept_sequence","application_types"], properties:{ core_concepts:evidenceArray(5), supporting_concepts:evidenceArray(5), prerequisite_concepts:evidenceArray(5), linked_concepts:evidenceArray(5), formulas_theorems:stringArray(8), concept_sequence:stringArray(8), application_types:evidenceArray(5) } },
    thinking: { type:"object", additionalProperties:false, required:["entry_point","solution_steps","required_reasoning","representation_changes","key_insight","decisive_step","verification_method"], properties:{ entry_point:{type:"string"}, solution_steps:stringArray(8), required_reasoning:evidenceArray(7), representation_changes:stringArray(6), key_insight:{type:"string"}, decisive_step:{type:"string"}, verification_method:{type:"string"} } },
    calculation: { type:"object", additionalProperties:false, required:["calculation_load","algebra_load","arithmetic_load","symbolic_complexity","case_count","likely_bottlenecks"], properties:{ calculation_load:score, algebra_load:score, arithmetic_load:score, symbolic_complexity:score, case_count:{type:"integer",minimum:0,maximum:30}, likely_bottlenecks:evidenceArray(6) } },
    difficulty: { type:"object", additionalProperties:false, required:["overall_level","score_100","concept_demand","reasoning_demand","calculation_demand","condition_interpretation_demand","time_pressure","estimated_minutes","difficulty_reasons"], properties:{ overall_level:{type:"string",enum:["하","중하","중","중상","상","최상"]}, score_100:score, concept_demand:score, reasoning_demand:score, calculation_demand:score, condition_interpretation_demand:score, time_pressure:score, estimated_minutes:{type:"number",minimum:0,maximum:120}, difficulty_reasons:evidenceArray(6) } },
    intention: { type:"object", additionalProperties:false, required:["primary_intention","assessed_abilities","expected_solution_path","alternate_solution_paths"], properties:{ primary_intention:{type:"string"}, assessed_abilities:evidenceArray(7), expected_solution_path:{type:"string"}, alternate_solution_paths:stringArray(5) } },
    expected_errors:evidenceArray(10), traps:evidenceArray(10),
    educational_value: { type:"object", additionalProperties:false, required:["representative_type","educational_value","mutation_potential","reappearance_probability","school_exam_suitability","mock_exam_suitability","csat_suitability","training_objectives","recommended_student_levels","prerequisite_question_features","followup_question_features","similar_question_features","mutation_points"], properties:{ representative_type:score, educational_value:score, mutation_potential:score, reappearance_probability:score, school_exam_suitability:score, mock_exam_suitability:score, csat_suitability:score, training_objectives:stringArray(8), recommended_student_levels:stringArray(6), prerequisite_question_features:stringArray(6), followup_question_features:stringArray(6), similar_question_features:stringArray(6), mutation_points:stringArray(8) } },
    summary: { type:"object", additionalProperties:false, required:["one_line","key_insight","first_entry_point","common_sticking_point","decisive_solving_point","teaching_point","ai_confidence","review_required","review_reasons"], properties:{ one_line:{type:"string"}, key_insight:{type:"string"}, first_entry_point:{type:"string"}, common_sticking_point:{type:"string"}, decisive_solving_point:{type:"string"}, teaching_point:{type:"string"}, ai_confidence:{type:"number",minimum:0,maximum:1}, review_required:{type:"boolean"}, review_reasons:stringArray(8) } }
  }
} as const;

export const problemDnaBatchSchema = { type:"object", additionalProperties:false, required:["questions"], properties:{ questions:{type:"array",minItems:1,maxItems:200,items:problemDnaQuestionSchema} } } as const;

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
export function validateProblemDNA(value: unknown): { valid: boolean; errors: string[]; dna?: ProblemDNA } {
  const errors:string[]=[]; if(!isRecord(value)) return {valid:false,errors:["DNA가 객체가 아닙니다."]};
  if(value.schema_version!==PROBLEM_DNA_VERSION) errors.push("schema_version이 현재 버전과 다릅니다.");
  if(!Number.isInteger(value.question_no)||Number(value.question_no)<1) errors.push("question_no가 올바르지 않습니다.");
  for(const key of ["basic","concept","thinking","calculation","difficulty","intention","educational_value","summary"]) if(!isRecord(value[key])) errors.push(`${key} 영역이 없습니다.`);
  if(!Array.isArray(value.expected_errors)) errors.push("expected_errors가 배열이 아닙니다."); if(!Array.isArray(value.traps)) errors.push("traps가 배열이 아닙니다.");
  const confidence=isRecord(value.summary)?Number(value.summary.ai_confidence):NaN; if(!Number.isFinite(confidence)||confidence<0||confidence>1) errors.push("ai_confidence가 0~1 범위가 아닙니다.");
  return errors.length?{valid:false,errors}:{valid:true,errors:[],dna:value as unknown as ProblemDNA};
}
export function legacyFieldsFromDNA(dna:ProblemDNA){ const f=dna.basic.question_format; return { question_type:f==="objective"?"multiple_choice":f==="short_answer"?"short_answer":f==="essay"?"essay":"unknown", subject:dna.basic.subject, unit:dna.basic.minor_unit||dna.basic.middle_unit||dna.basic.major_unit, topic:dna.basic.detailed_topic, difficulty:dna.difficulty.overall_level==="중하"?"중":dna.difficulty.overall_level==="중상"?"상":dna.difficulty.overall_level, summary:dna.summary.one_line }; }
export function collectProblemDnaTags(dna:ProblemDNA){ const v=[dna.basic.subject,dna.basic.grade,dna.basic.curriculum,dna.basic.major_unit,dna.basic.middle_unit,dna.basic.minor_unit,dna.basic.detailed_topic,...dna.basic.problem_types,...dna.concept.core_concepts.map(x=>x.tag),...dna.concept.supporting_concepts.map(x=>x.tag),...dna.thinking.required_reasoning.map(x=>x.tag),...dna.expected_errors.map(x=>x.tag),...dna.traps.map(x=>x.tag),...dna.educational_value.training_objectives]; return [...new Set(v.map(x=>String(x??"").trim()).filter(Boolean))]; }
export function problemDnaEmbeddingText(dna:ProblemDNA){ return [`과목/학년: ${dna.basic.subject} ${dna.basic.grade}`,`단원: ${[dna.basic.major_unit,dna.basic.middle_unit,dna.basic.minor_unit].filter(Boolean).join(" > ")}`,`세부주제: ${dna.basic.detailed_topic}`,`핵심개념: ${dna.concept.core_concepts.map(x=>x.tag).join(", ")}`,`사고요소: ${dna.thinking.required_reasoning.map(x=>x.tag).join(", ")}`,`예상오류: ${dna.expected_errors.map(x=>x.tag).join(", ")}`,`함정: ${dna.traps.map(x=>x.tag).join(", ")}`,`훈련목적: ${dna.educational_value.training_objectives.join(", ")}`,`난이도: ${dna.difficulty.overall_level} (${dna.difficulty.score_100})`,`요약: ${dna.summary.one_line}`].join("\n"); }
