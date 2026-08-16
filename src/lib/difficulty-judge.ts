/**
 * SOS 8단계 난이도 판정 엔진 (SOS240)
 *
 * 핵심 원칙
 *  - 모르면 3점으로 보내지 않는다. 미판정/검토필요로 남긴다.
 *  - 난이도를 찍기 전에 AI가 문제를 먼저 독립적으로 풀게 한다.
 *  - 독립 풀이 + 공식답(있으면) + DNA + 관리자 확정 기준문항을 함께 검증한다.
 *  - 낮은 신뢰도/풀이 불일치/판독 불가는 자동 적용 금지.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DIFFICULTY_SCALE, DIFFICULTY_SCALE_VERSION, normalizeDifficulty, type DifficultyValue } from "@/lib/difficulty-scale";
import { canonicalSubject } from "@/lib/subject";

export const DIFFICULTY_JUDGE_VERSION = "difficulty-v240-solve-verify" as const;

export type DifficultyBandName =
  | "two_point" | "three_point" | "three_hard" | "four_easy"
  | "four_medium" | "four_hard" | "semi_killer" | "killer";

export type DifficultySolve = {
  solvable: boolean;
  solved_answer: string;
  solution_outline: string;
  key_insight: string;
  concepts: string[];
  reasoning_steps: number;
  condition_transformations: number;
  calculation_load: number;
  insight_load: number;
  confidence: number;
  issue: string;
};

export type DifficultyJudgement = {
  decision: "graded" | "unclassified";
  final_grade: DifficultyValue | null;
  csat_point_equivalent: 2 | 3 | 4 | null;
  csat_difficulty_band: DifficultyBandName | null;
  reason: string;
  confidence: number;
  review_required: boolean;
  review_reason: string;
  solution_verified: boolean;
  answer_consistency: "match" | "mismatch" | "unknown";
  solve: DifficultySolve;
};

const allowedGrades = DIFFICULTY_SCALE.map((x) => x.value) as DifficultyValue[];

const solveSchema = {
  type: "object",
  additionalProperties: false,
  required: ["solvable","solved_answer","solution_outline","key_insight","concepts","reasoning_steps","condition_transformations","calculation_load","insight_load","confidence","issue"],
  properties: {
    solvable: { type: "boolean" },
    solved_answer: { type: "string" },
    solution_outline: { type: "string" },
    key_insight: { type: "string" },
    concepts: { type: "array", items: { type: "string" }, maxItems: 8 },
    reasoning_steps: { type: "integer", minimum: 0, maximum: 20 },
    condition_transformations: { type: "integer", minimum: 0, maximum: 12 },
    calculation_load: { type: "integer", minimum: 1, maximum: 5 },
    insight_load: { type: "integer", minimum: 1, maximum: 5 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    issue: { type: "string" },
  },
} as const;

const judgeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision","final_grade","csat_point_equivalent","csat_difficulty_band","reason","confidence","review_required","review_reason","solution_verified","answer_consistency"],
  properties: {
    decision: { type: "string", enum: ["graded","unclassified"] },
    final_grade: { anyOf: [{ type: "string", enum: allowedGrades }, { type: "null" }] },
    csat_point_equivalent: { anyOf: [{ type: "integer", enum: [2,3,4] }, { type: "null" }] },
    csat_difficulty_band: { anyOf: [{ type: "string", enum: ["two_point","three_point","three_hard","four_easy","four_medium","four_hard","semi_killer","killer"] }, { type: "null" }] },
    reason: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    review_required: { type: "boolean" },
    review_reason: { type: "string" },
    solution_verified: { type: "boolean" },
    answer_consistency: { type: "string", enum: ["match","mismatch","unknown"] },
  },
} as const;

function dnaSummary(dna: any) {
  const basic = dna?.basic ?? {};
  const thinking = dna?.thinking ?? {};
  const solution = dna?.solution ?? {};
  const concept = dna?.concept ?? {};
  return {
    subject: basic.subject ?? "",
    unit: [basic.major_unit,basic.middle_unit,basic.minor_unit].filter(Boolean).join(" > "),
    topic: basic.detailed_topic ?? "",
    core_concepts: concept.core_concepts ?? [],
    thinking_process: thinking.process ?? [],
    key_insight: thinking.key_insight ?? "",
    representative_solution: solution.representative_solution ?? [],
  };
}

function buildSolvePrompt(dna: any) {
  return `당신은 한국 고등수학 문항을 직접 푸는 검증자입니다. 난이도를 아직 판정하지 마세요. 먼저 첨부 문항을 처음부터 독립적으로 풀어야 합니다.

[중요]
- DNA나 기존 난이도를 정답처럼 믿지 마세요. 이미지의 실제 문제를 우선합니다.
- 문항이 잘렸거나 판독 불가하거나 조건이 부족하면 solvable=false로 두세요.
- 객관식이면 최종 선택지 번호, 단답형이면 최종 값을 solved_answer에 적으세요.
- reasoning_steps는 의미 있는 추론/전환 단계 수입니다. 단순 계산 한 줄씩을 과장해 세지 마세요.
- condition_transformations는 문제 조건을 식/그래프/치환/경우분류 등 다른 표현으로 바꾸어야 하는 횟수입니다.
- calculation_load와 insight_load는 1(매우 낮음)~5(매우 높음)입니다.

참고용 DNA(오류 가능): ${JSON.stringify(dnaSummary(dna))}
JSON 객체 하나만 출력하세요.`;
}

function buildJudgePrompt(dna: any, solve: DifficultySolve, references = "", officialAnswer = "") {
  return `당신은 한국 수능 고등수학 난이도 검증자입니다. 첨부 문항과 아래의 독립 재풀이 결과를 검증한 뒤 MATHPOOH SOS 공식 8단계 중 하나를 판정하세요.

[공식 8단계]
1=2점: 정의·공식·성질 거의 직접 적용. 매우 짧고 전략 선택 부담 거의 없음.
2=3점: 정형 대표유형. 기본 조건 해석·식 정리·계산은 있으나 4점급 사고는 아님.
3=어3: 3점 상단. 조건 해석/계산/연결이 까다로워 쉬운 4점 직전.
4=쉬4: 4점 입문. 실질적 사고가 필요하지만 구조와 진입이 비교적 명확.
5=적4: 표준 수능 4점 중심. 개념 결합·조건 번역·관계 발견·풀이 방향 선택이 의미 있게 필요.
6=어4: 어려운 4점. 복합추론·경우분류·구조변환·상당한 계산/해석 부담.
7=준킬러: 비정형 핵심 발상 또는 여러 단계 추론이 필요하며 상위권 변별력이 뚜렷함.
8=킬러: 최상위 난도. 핵심 발상 자체가 매우 어렵고 복합적 비정형 추론이 필수.

[절대 규칙]
- 모른다고 3점(2단계)에 보내지 마세요.
- 이미지가 불완전하거나 독립 풀이가 불확실하거나 공식답과 명백히 충돌하면 decision=unclassified, final_grade=null로 두세요.
- confidence<0.68이면 반드시 review_required=true입니다.
- 독립 풀이와 공식답이 일치하는지 판단 가능한 경우 answer_consistency를 match/mismatch로 표시하세요. 공식답 형식 때문에 비교가 불가능하면 unknown입니다.
- answer_consistency=mismatch면 자동 확정하지 말고 decision=unclassified로 두세요.
- 단순 계산량만으로 난이도를 올리지 말고 핵심 발상, 조건 변환, 추론 단계, 전략 선택 부담을 우선하세요.
- 전체 분포를 맞추려 하지 말고 이 문항 하나만 독립적으로 판정하세요.

[독립 재풀이]
${JSON.stringify(solve)}

[기존 DNA - 참고용, 오류 가능]
${JSON.stringify(dnaSummary(dna))}
${officialAnswer ? `\n[저장된 공식 정답]\n${officialAnswer}` : ""}
${references ? `\n[관리자 확정 기준문항]\n${references}` : ""}

JSON 객체 하나만 출력하세요.`;
}

function outputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  return (payload?.output ?? []).flatMap((x:any)=>x?.content??[]).map((x:any)=>x?.text??"").filter(Boolean).join("\n").trim();
}

async function requestStructured(args: { apiKey:string; model:string; imageUrl:string; prompt:string; schema:any; schemaName:string; timeoutMs:number; effort?:"low"|"medium" }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method:"POST",
    headers:{ Authorization:`Bearer ${args.apiKey}`, "Content-Type":"application/json" },
    body:JSON.stringify({
      model:args.model,
      input:[{ role:"user", content:[{type:"input_text",text:args.prompt},{type:"input_image",image_url:args.imageUrl,detail:"high"}] }],
      reasoning:{ effort:args.effort ?? "medium" },
      text:{ format:{ type:"json_schema", name:args.schemaName, strict:true, schema:args.schema } },
      max_output_tokens:1800,
      store:false,
    }),
    signal:AbortSignal.timeout(args.timeoutMs),
    cache:"no-store",
  });
  const raw=await response.text();
  if(!response.ok) throw new Error(`AI 난이도 검증 실패 (${response.status}): ${raw.slice(0,800)}`);
  const payload=JSON.parse(raw);
  const text=outputText(payload);
  if(!text) throw new Error("AI 난이도 검증 응답이 비었습니다.");
  return JSON.parse(text);
}

/** 1차 독립 재풀이 → 2차 난이도 검증. */
export async function judgeDifficulty(args: {
  apiKey:string;
  model:string;
  imageUrl:string;
  dna:any;
  references?:string;
  officialAnswer?:string | number | null;
  timeoutMs?:number;
}): Promise<DifficultyJudgement> {
  const timeout=Math.max(60_000,args.timeoutMs ?? 180_000);
  const solve=await requestStructured({
    apiKey:args.apiKey,model:args.model,imageUrl:args.imageUrl,
    prompt:buildSolvePrompt(args.dna),schema:solveSchema,schemaName:"mathpooh_difficulty_solve_v240",timeoutMs:timeout,effort:"medium",
  }) as DifficultySolve;

  if (!solve.solvable || Number(solve.confidence) < .50) {
    return {
      decision:"unclassified", final_grade:null, csat_point_equivalent:null, csat_difficulty_band:null,
      reason:"독립 재풀이 단계에서 문항을 안정적으로 해석/풀이하지 못했습니다.", confidence:Number(solve.confidence)||0,
      review_required:true, review_reason:solve.issue || "문항 판독 또는 독립 풀이 신뢰도가 낮음",
      solution_verified:false, answer_consistency:"unknown", solve,
    };
  }

  const judged=await requestStructured({
    apiKey:args.apiKey,model:args.model,imageUrl:args.imageUrl,
    prompt:buildJudgePrompt(args.dna,solve,args.references??"",String(args.officialAnswer??"").trim()),
    schema:judgeSchema,schemaName:"mathpooh_difficulty_judge_v240",timeoutMs:timeout,effort:"medium",
  }) as Omit<DifficultyJudgement,"solve">;

  const confidence=Math.max(0,Math.min(1,Number(judged.confidence)||0));
  const invalidGrade=judged.final_grade!==null && !allowedGrades.includes(judged.final_grade as DifficultyValue);
  const forceUnclassified = invalidGrade || judged.answer_consistency === "mismatch" || confidence < .55 || judged.solution_verified === false;
  const finalGrade = forceUnclassified ? null : judged.final_grade;
  return {
    ...judged,
    decision: forceUnclassified || !finalGrade ? "unclassified" : "graded",
    final_grade: finalGrade as DifficultyValue | null,
    csat_point_equivalent: finalGrade ? judged.csat_point_equivalent : null,
    csat_difficulty_band: finalGrade ? judged.csat_difficulty_band : null,
    confidence,
    review_required: judged.review_required || confidence < .68 || forceUnclassified,
    review_reason: judged.review_reason || (forceUnclassified ? "재풀이 검증을 통과하지 못함" : confidence < .68 ? "난이도 판정 신뢰도 낮음" : ""),
    solve,
  };
}

/** 판정 결과를 DNA에 반영. 미판정이면 기존 난이도는 건드리지 않고 검토 상태만 기록한다. */
export function applyJudgedDifficulty(dna:any,result:DifficultyJudgement,previousGrade:string|null=null) {
  const next=dna&&typeof dna==="object"?{...dna}:{};
  const oldDifficulty={...(next.difficulty??{})};
  next.difficulty = {
    ...oldDifficulty,
    ...(result.final_grade ? {
      final_grade:Number(result.final_grade),
      csat_point_equivalent:result.csat_point_equivalent,
      csat_difficulty_band:result.csat_difficulty_band,
      csat_basis:result.reason,
    } : {}),
    reasons:[{tag:"재풀이 검증 난이도",evidence:result.reason,confidence:result.confidence}],
    scale_version:DIFFICULTY_SCALE_VERSION,
    ai_regraded_at:new Date().toISOString(),
    ai_regrade_confidence:result.confidence,
    ai_regrade_version:DIFFICULTY_JUDGE_VERSION,
    previous_final_grade:previousGrade,
    difficulty_decision:result.decision,
    difficulty_review_required:result.review_required,
    difficulty_review_reason:result.review_reason,
    solution_verified:result.solution_verified,
    answer_consistency:result.answer_consistency,
    independent_solve:result.solve,
    band_conflict:false,
  };
  return next;
}

type ReferenceRow={id:string;subject:string|null;unit:string|null;topic:string|null;difficulty:string|number|null;problem_dna:any};
let referenceCache:{at:number;rows:ReferenceRow[]}|null=null;
const REFERENCE_TTL_MS=5*60*1000;

export async function loadAdminFixedReferences(supabase:SupabaseClient):Promise<ReferenceRow[]> {
  if(referenceCache&&Date.now()-referenceCache.at<REFERENCE_TTL_MS)return referenceCache.rows;
  try{
    const result=await supabase.from("problem_bank_questions").select("id,subject,unit,topic,difficulty,problem_dna").eq("problem_dna->difficulty->>admin_fixed","true").eq("problem_dna->difficulty->>scale_version",DIFFICULTY_SCALE_VERSION).limit(400);
    if(result.error)throw result.error;
    const rows=(result.data??[]) as ReferenceRow[]; referenceCache={at:Date.now(),rows}; return rows;
  }catch{referenceCache={at:Date.now(),rows:[]};return[];}
}

export function formatDifficultyReferences(rows:ReferenceRow[],subject?:unknown,perGrade=2){
  if(!rows.length)return"";
  const wanted=canonicalSubject(subject);
  const sorted=[...rows].sort((a,b)=>(canonicalSubject(a.subject)===wanted?0:1)-(canonicalSubject(b.subject)===wanted?0:1));
  const lines:string[]=[];
  for(const scale of DIFFICULTY_SCALE){
    const picked=sorted.filter(row=>normalizeDifficulty(row.difficulty)===scale.value).slice(0,perGrade);
    for(const row of picked){
      const dna=row.problem_dna??{},basic=dna.basic??{},thinking=dna.thinking??{},solution=dna.solution??{};
      lines.push(`- ${scale.label} | ${canonicalSubject(row.subject,basic.subject)} | ${row.unit??basic.major_unit??""} | ${row.topic??basic.detailed_topic??""} | 핵심발상:${String(thinking.key_insight??"")} | 사고단계:${(thinking.process??[]).length} | 대표풀이:${JSON.stringify(solution.representative_solution??[]).slice(0,500)}`);
    }
  }
  return lines.join("\n");
}

export async function difficultyReferenceText(supabase:SupabaseClient,subject?:unknown){return formatDifficultyReferences(await loadAdminFixedReferences(supabase),subject);}
