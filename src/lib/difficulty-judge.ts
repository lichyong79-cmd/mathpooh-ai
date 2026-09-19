import { STUDENT_DIFFICULTY_CRITERIA, curriculumContext } from "@/lib/difficulty-assessment-policy";
import { SOURCE_STAR_PROMPT, SOURCE_STAR_POLICY, sourceStarSchema, sourceStarGrades, sourceStarReview, type SourceStars } from "@/lib/source-star-difficulty";
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
import { DIFFICULTY_SCALE, DIFFICULTY_SCALE_VERSION, normalizeDifficulty, difficultyBand, type DifficultyValue } from "@/lib/difficulty-scale";
import { canonicalSubject } from "@/lib/subject";

export const DIFFICULTY_JUDGE_VERSION = "difficulty-v284-student-audit" as const;

export type DifficultyBandName =
  | "two_point" | "three_point" | "three_hard" | "four_easy"
  | "four_medium" | "four_hard" | "semi_killer" | "killer";

export type DifficultySolve = {
  source_stars?: SourceStars;
  observed_question_no?: number | null;
  observed_conditions?: string[];
  observed_choices?: string[];
  answer_value?: string;
  curriculum_valid?: boolean;
  curriculum_reason?: string;
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
  student_assessment?: {
    entry_barrier: string; condition_connections: string; execution_burden: string;
    standard_student_obstacle: string; advanced_student_obstacle: string;
    estimated_minutes_min: number; estimated_minutes_max: number;
    lower_grade_reason: string; higher_grade_reason: string;
    curriculum_verified: boolean;
  };
  execution?: { requested_model: string; calls: Array<Record<string, unknown>>; source_star_evidence?: Record<string,unknown> };
};

const allowedGrades = DIFFICULTY_SCALE.map((x) => x.value) as DifficultyValue[];

export type DifficultyVerificationFailureType =
  | "timeout"
  | "http_429"
  | "http_4xx"
  | "http_5xx"
  | "response_json_parse"
  | "incomplete_max_output_tokens"
  | "incomplete_content_filter"
  | "incomplete_other"
  | "empty_response"
  | "structured_json_parse"
  | "unknown";

export class DifficultyVerificationError extends Error {
  failureType: DifficultyVerificationFailureType;
  stage: string;
  detail: string;
  constructor(failureType: DifficultyVerificationFailureType, message: string, stage: string, detail = "") {
    super(message);
    this.name = "DifficultyVerificationError";
    this.failureType = failureType;
    this.stage = stage;
    this.detail = detail;
  }
}

const solveSchema = {
  type: "object",
  additionalProperties: false,
  required: ["observed_question_no","observed_conditions","observed_choices","answer_value","curriculum_valid","curriculum_reason","source_stars","solvable","solved_answer","solution_outline","key_insight","concepts","reasoning_steps","condition_transformations","calculation_load","insight_load","confidence","issue"],
  properties: {
    observed_question_no: { anyOf: [{ type:"integer" }, { type:"null" }] },
    observed_conditions: { type:"array", items:{type:"string"}, minItems:1 },
    observed_choices: { type:"array", items:{type:"string"} },
    answer_value: { type:"string" },
    curriculum_valid: { type:"boolean" },
    curriculum_reason: { type:"string" },
    source_stars: sourceStarSchema,
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
  required: ["student_assessment","decision","final_grade","csat_point_equivalent","csat_difficulty_band","reason","confidence","review_required","review_reason","solution_verified","answer_consistency"],
  properties: {
    student_assessment: {
      type:"object", additionalProperties:false,
      required:["entry_barrier","condition_connections","execution_burden","standard_student_obstacle","advanced_student_obstacle","estimated_minutes_min","estimated_minutes_max","lower_grade_reason","higher_grade_reason","curriculum_verified"],
      properties:{
        entry_barrier:{type:"string"}, condition_connections:{type:"string"}, execution_burden:{type:"string"},
        standard_student_obstacle:{type:"string"}, advanced_student_obstacle:{type:"string"},
        estimated_minutes_min:{type:"number",minimum:0}, estimated_minutes_max:{type:"number",minimum:0},
        lower_grade_reason:{type:"string"}, higher_grade_reason:{type:"string"}, curriculum_verified:{type:"boolean"}
      }
    },
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

function buildSolvePrompt(subject: unknown, questionNo?: number | null) {
  return `당신은 한국 고등수학 문항을 직접 푸는 검증자입니다. 난이도를 아직 판정하지 마세요. 먼저 첨부 문항을 처음부터 독립적으로 풀어야 합니다.

${SOURCE_STAR_PROMPT}
${curriculumContext(subject, questionNo)}
[중요]
- DNA나 기존 난이도를 정답처럼 믿지 마세요. 이미지의 실제 문제를 우선합니다.
- 문항이 잘렸거나 판독 불가하거나 조건이 부족하면 solvable=false로 두세요.
- 객관식이면 최종 선택지 번호, 단답형이면 최종 값을 solved_answer에 적으세요.
- reasoning_steps는 의미 있는 추론/전환 단계 수입니다. 단순 계산 한 줄씩을 과장해 세지 마세요.
- condition_transformations는 문제 조건을 식/그래프/치환/경우분류 등 다른 표현으로 바꾸어야 하는 횟수입니다.
- calculation_load와 insight_load는 1(매우 낮음)~5(매우 높음)입니다.

기존 DNA·풀이·핵심발상·정답은 제공하지 않는다. 이미지의 모든 조건으로 끝까지 풀고 핵심 경우분류를 생략하지 않는다.
observed_conditions에는 이미지에서 직접 읽은 조건을 기록하고 observed_choices에는 실제 선택지를 기록한다.
solved_answer는 객관식의 선지 번호만, answer_value는 그 선지의 수학적 값이다. 단답형은 두 필드에 같은 값을 기록한다.

JSON 객체 하나만 출력하세요.`;
}

function buildJudgePrompt(subject: unknown, solve: DifficultySolve, references = "", officialAnswer = "", questionNo?: number | null, questionType?: string) {
  return `당신은 한국 수능 고등수학 난이도 검증자입니다. 첨부 문항과 아래의 독립 재풀이 결과를 검증한 뒤 MATHPOOH SOS 공식 8단계 중 하나를 판정하세요.

${SOURCE_STAR_PROMPT}
이번 원본 별점 판독: ${JSON.stringify(solve.source_stars ?? null)}
허용 SOS 등급: ${JSON.stringify(sourceStarGrades(solve.source_stars) ?? "별점 미확정: 불확실하면 검토필요")}

${curriculumContext(subject, questionNo)}
${STUDENT_DIFFICULTY_CRITERIA}
저장 정답 형식: ${questionType || "이미지에서 확인"}. 객관식 저장 정답은 값이 아닌 선지 번호이다. 반드시 observed_choices와 대조한다.

[공식 8단계]
1=2점: 정의·공식·성질 거의 직접 적용. 매우 짧고 전략 선택 부담 거의 없음.
2=3점: 정형 대표유형. 기본 조건 해석·식 정리·계산은 있으나 4점급 사고는 아님.
3=어3: 3점 상단. 조건 해석/계산/연결이 까다로워 쉬운 4점 직전.
4=쉬4: 4점 입문. 실질적 사고가 필요하지만 구조와 진입이 비교적 명확.
5=적4: 표준 수능 4점 중심. 개념 결합·조건 번역·관계 발견·풀이 방향 선택이 의미 있게 필요.
6=어4: 어려운 4점. 복합추론·경우분류·구조변환·상당한 계산/해석 부담.
7=준킬러: 발상 발견 또는 여러 조건의 정교한 연결·완주 부담으로 상위권 변별력이 뚜렷함.
8=킬러: 최상위권에게도 발상 발견 또는 복합 추론·경우분류·완주가 매우 어려운 최고난도.

[절대 규칙]
- 학생이 제한 시간 안에 처음 보는 문제를 푸는 상황을 평가한다. AI가 풀이를 이미 발견했거나 해설이 짧다는 이유로 낮추지 않는다.
- 정형 개념을 쓰더라도 진입 전략 발견, 복합 조건 연결, 빠짐없는 경우 분류, 계산 정확성, 검산 부담을 함께 평가한다. '전형적'이라는 말만으로 고난도를 배제하지 않는다.
- 내신/학교 이름, 문제 번호 또는 예상 전체 분포만으로 등급을 올리거나 내리지 않는다. 실제 비교 기준이 제공되지 않으면 특정 연도 수능과 대조했다고 주장하지 않는다.
- final_grade, csat_difficulty_band, csat_point_equivalent는 일치해야 한다. 등급1은 2점, 2/3은 3점, 4~8은 4점이다.
- 모른다고 3점(2단계)에 보내지 마세요.
- 이미지가 불완전하거나 독립 풀이가 불확실하거나 공식답과 명백히 충돌하면 decision=unclassified, final_grade=null로 두세요.
- confidence<0.68이면 반드시 review_required=true입니다.
- 독립 풀이와 공식답이 일치하는지 판단 가능한 경우 answer_consistency를 match/mismatch로 표시하세요. 공식답 형식 때문에 비교가 불가능하면 unknown입니다.
- solution_verified는 "위 [독립 재풀이]가 이 문항의 타당한 풀이인가"를 당신이 검토한 결과입니다.
  재풀이 논리에 결정적 오류가 없고 문항 조건과 모순되지 않으면 true로 두세요.
  공식답과 값이 다른지 여부는 여기에 반영하지 말고 answer_consistency로만 표시하세요.
  풀이 자체가 틀렸거나 문항 조건을 잘못 읽었을 때만 false입니다.
- confidence는 "최종 8단계 등급 선택"에 대한 확신도입니다. 인접 등급 사이에서 망설인 정도만 반영하세요.
  문항 판독이나 풀이에 대한 불안은 confidence를 낮추는 대신 review_reason에 적으세요.
- 저장 정답이 오기입일 수도 있으므로 답의 불일치 원인을 기록하되 자동 적용하지 않는다. 불일치 또는 비교 불가이면 review_required=true이다.
- student_assessment의 모든 판단에는 이 문항의 구체적 근거를 쓴다. 풀이가 짧다는 이유만으로 낮추지 않는다.
- 단순 계산량만으로 난이도를 올리지 말고 핵심 발상, 조건 변환, 추론 단계, 전략 선택 부담을 우선하세요.
- 전체 분포를 맞추려 하지 말고 이 문항 하나만 독립적으로 판정하세요.

[독립 재풀이]
${JSON.stringify(solve)}

[독립 검증] 기존 DNA·난이도·기존 풀이는 숨겨져 있다. 새 풀이의 생략된 핵심 논증을 검증하고 확인 불가이면 solution_verified=false이다.
${officialAnswer ? `\n[저장된 공식 정답]\n${officialAnswer}` : ""}
${references ? `\n[관리자 확정 기준문항]\n${references}` : ""}

JSON 객체 하나만 출력하세요.`;
}

function outputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  return (payload?.output ?? []).flatMap((x:any)=>x?.content??[]).map((x:any)=>x?.text??"").filter(Boolean).join("\n").trim();
}

async function requestStructured(args: { apiKey:string; model:string; imageUrl:string; prompt:string; schema:any; schemaName:string; timeoutMs:number; effort?:"medium"|"high"; audit?:Array<Record<string,unknown>>; deadline?:number }) {
  let lastError: DifficultyVerificationError = new DifficultyVerificationError("unknown", "AI 난이도 검증 실패", args.schemaName);
  // Preserve reasoning effort on retries. A truncated response is not a reason to weaken the assessor.
  const attemptPlans = [12000, 20000].map(maxOutputTokens => ({effort:args.effort ?? "high",maxOutputTokens}));
  for (let attempt=1; attempt<=attemptPlans.length; attempt++) {
    const plan=attemptPlans[attempt-1];
    try {
      if (args.deadline && Date.now() >= args.deadline) throw new DifficultyVerificationError("timeout", "난도 검증 전체 시간 초과", args.schemaName);
      const response = await fetch("https://api.openai.com/v1/responses", {
        method:"POST",
        headers:{ Authorization:`Bearer ${args.apiKey}`, "Content-Type":"application/json" },
        body:JSON.stringify({
          model:args.model,
          input:[{ role:"user", content:[{type:"input_text",text:args.prompt},{type:"input_image",image_url:args.imageUrl,detail:"high"}] }],
          reasoning:{ effort:plan.effort },
          text:{ format:{ type:"json_schema", name:args.schemaName, strict:true, schema:args.schema } },
          max_output_tokens: plan.maxOutputTokens,
          store:false,
        }),
        signal:AbortSignal.timeout(Math.max(1,Math.min(args.timeoutMs,(args.deadline ?? Infinity)-Date.now()))),
        cache:"no-store",
      });
      const raw=await response.text();
      if(!response.ok) {
        const failureType: DifficultyVerificationFailureType = response.status===429 ? "http_429" : response.status>=500 ? "http_5xx" : "http_4xx";
        lastError = new DifficultyVerificationError(
          failureType,
          `AI 난이도 검증 HTTP 오류 (${response.status})`,
          args.schemaName,
          raw.slice(0,1200),
        );
        if(attempt<attemptPlans.length && response.status>=500) continue;
        throw lastError;
      }

      let payload:any;
      try { payload = raw ? JSON.parse(raw) : {}; }
      catch {
        lastError = new DifficultyVerificationError("response_json_parse", "OpenAI 응답 JSON을 읽지 못했습니다.", args.schemaName, raw.slice(0,1200));
        if(attempt<attemptPlans.length) continue;
        throw lastError;
      }

      args.audit?.push({stage:args.schemaName, attempt, requested_model:args.model,
        response_model:payload.model ?? null, reasoning_effort:plan.effort,
        max_output_tokens:plan.maxOutputTokens, status:payload.status ?? null,
        input_tokens:payload.usage?.input_tokens ?? null, output_tokens:payload.usage?.output_tokens ?? null,
        reasoning_tokens:payload.usage?.output_tokens_details?.reasoning_tokens ?? null});
      if(payload?.status === "incomplete") {
        const reason=String(payload?.incomplete_details?.reason ?? "unknown");
        const failureType: DifficultyVerificationFailureType = reason==="max_output_tokens"
          ? "incomplete_max_output_tokens"
          : reason==="content_filter"
            ? "incomplete_content_filter"
            : "incomplete_other";
        lastError = new DifficultyVerificationError(
          failureType,
          `AI 응답이 완료되지 않았습니다. (${reason})`,
          args.schemaName,
          `status=${String(payload?.status)} / output_types=${JSON.stringify((payload?.output??[]).map((x:any)=>x?.type))}`,
        );
        if(attempt<attemptPlans.length && reason!=="content_filter") continue;
        throw lastError;
      }

      const text=outputText(payload);
      if(!text) {
        lastError = new DifficultyVerificationError(
          "empty_response",
          "AI 난이도 검증 응답 본문이 비었습니다.",
          args.schemaName,
          `status=${String(payload?.status ?? "unknown")} / incomplete=${JSON.stringify(payload?.incomplete_details ?? null)} / output_types=${JSON.stringify((payload?.output??[]).map((x:any)=>x?.type))}`,
        );
        if(attempt<attemptPlans.length) continue;
        throw lastError;
      }

      try { return JSON.parse(text); }
      catch {
        lastError = new DifficultyVerificationError("structured_json_parse", "AI 구조화 난이도 JSON 파싱에 실패했습니다.", args.schemaName, text.slice(0,1200));
        if(attempt<attemptPlans.length) continue;
        throw lastError;
      }
    } catch (error) {
      if(error instanceof DifficultyVerificationError) lastError=error;
      else if(error instanceof Error && (error.name==="TimeoutError" || error.name==="AbortError" || /timeout/i.test(error.message))) {
        lastError=new DifficultyVerificationError("timeout", "AI 난이도 검증 시간이 초과되었습니다.", args.schemaName, error.message);
      } else {
        lastError=new DifficultyVerificationError("unknown", error instanceof Error?error.message:String(error), args.schemaName);
      }
      if(attempt>=attemptPlans.length || lastError.failureType==="http_429" || lastError.failureType==="incomplete_content_filter") break;
    }
  }
  throw lastError;
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
  blind?:boolean;
  subject?:string | null;
  questionNo?:number | null;
  questionType?:string;
}): Promise<DifficultyJudgement> {
  const timeout=Math.max(60_000,args.timeoutMs ?? 180_000);
  const deadline=Date.now()+Math.min(timeout,240_000);
  const calls:Array<Record<string,unknown>>=[];
  const execution:NonNullable<DifficultyJudgement["execution"]>={requested_model:args.model,calls};
  const subject=args.subject || args.dna?.basic?.subject;
  const questionNo=args.questionNo ?? args.dna?.question_no;
  const solve=await requestStructured({
    apiKey:args.apiKey,model:args.model,imageUrl:args.imageUrl,
    prompt:buildSolvePrompt(subject,questionNo),schema:solveSchema,schemaName:"mathpooh_difficulty_solve_v284",timeoutMs:timeout,effort:"high",audit:calls,deadline,
  }) as DifficultySolve;

  const imageStars=solve.source_stars;
  const paperStars=args.dna?.difficulty?.source_star_origin === "original_pdf" ? args.dna.difficulty.source_stars as SourceStars : undefined;
  execution.source_star_evidence={image:imageStars ?? null, cached_paper:paperStars ?? null};
  if (paperStars) {
    const imageConfirmed=sourceStarGrades(imageStars);
    const paperConfirmed=sourceStarGrades(paperStars);
    // A cached 'absent' must not silently erase newly visible printed stars.
    if (imageConfirmed && ((paperConfirmed && imageStars?.count !== paperStars.count) || paperStars.status === "absent")) {
      solve.source_stars={status:"uncertain",count:null,confidence:0,evidence:"새 이미지의 별점과 기존 원본 PDF 판독이 충돌함"};
    } else {
      solve.source_stars=imageConfirmed && !paperConfirmed ? imageStars : paperStars;
    }
  }

  // SOS274: 1차 재풀이 탈락 기준. 여기서 걸리면 이미지 판독 자체가 안 된 것이므로 미판정이 맞다.
  const wrongQuestion=questionNo != null && solve.observed_question_no !== questionNo;
  if (!solve.solvable || Number(solve.confidence) < .68 || solve.curriculum_valid !== true || wrongQuestion) {
    return {
      decision:"unclassified", final_grade:null, csat_point_equivalent:null, csat_difficulty_band:null,
      reason:"독립 재풀이 단계에서 문항을 안정적으로 해석/풀이하지 못했습니다.", confidence:Number(solve.confidence)||0,
      review_required:true, review_reason:wrongQuestion ? "대상 문항 번호 확인 실패" : solve.curriculum_valid !== true ? "교육과정 내 풀이 미검증: " + (solve.curriculum_reason || "") : solve.issue || "문항 판독 또는 독립 풀이 신뢰도가 낮음",
      solution_verified:false, answer_consistency:"unknown", solve, execution,
    };
  }

  const judged=await requestStructured({
    apiKey:args.apiKey,model:args.model,imageUrl:args.imageUrl,
    prompt:buildJudgePrompt(subject,solve,args.blind ? "" : args.references??"",String(args.officialAnswer??"").trim(),questionNo,args.questionType),
    schema:judgeSchema,schemaName:"mathpooh_difficulty_judge_v284",timeoutMs:timeout,effort:"high",audit:calls,deadline,
  }) as Omit<DifficultyJudgement,"solve">;

  const confidence=Math.max(0,Math.min(1,Number(judged.confidence)||0));
  const invalidGrade=judged.final_grade!==null && !allowedGrades.includes(judged.final_grade as DifficultyValue);
  const expectedPoint = judged.final_grade === "1" ? 2 : Number(judged.final_grade) <= 3 ? 3 : 4;
  const pointMismatch=!!judged.final_grade && judged.csat_point_equivalent !== expectedPoint;
  const a=judged.student_assessment;
  const assessmentInvalid=!a || a.curriculum_verified !== true || a.estimated_minutes_max < a.estimated_minutes_min ||
    ![a.entry_barrier,a.condition_connections,a.execution_burden,a.standard_student_obstacle,a.advanced_student_obstacle,a.lower_grade_reason,a.higher_grade_reason].every(x=>typeof x === "string" && x.trim().length>0);
  const answerUnknown=String(args.officialAnswer??"").trim() !== "" && judged.answer_consistency === "unknown";
  const bandMismatch = !!judged.final_grade && difficultyBand(judged.final_grade) !== judged.csat_difficulty_band;

  // SOS274: 이전에는 정답 불일치·재풀이 미검증·신뢰도 0.55 미만을 모두 '미판정'으로 묶었다.
  // 미판정은 화면에서 사라지고 수동 확인 대상도 되지 않아, 사람이 손댈 방법이 없는 상태로 쌓였다.
  // 이제 두 단계로 나눈다.
  //   hardFail   = 등급 자체를 신뢰할 수 없음 -> 미판정
  //   needsReview = 등급은 나왔으나 사람이 확인해야 함 -> 검토필요(값은 보존, 화면에 노출)
  const starReview = sourceStarReview(solve.source_stars, judged.final_grade);
  const hardFail = !!starReview || invalidGrade || !judged.final_grade || confidence < .45;
  const imageIssue=String(solve.issue ?? "").trim();
  const needsReview =
    !!imageIssue || pointMismatch || assessmentInvalid || answerUnknown || bandMismatch || judged.decision !== "graded" ||
    judged.review_required ||
    confidence < .68 ||
    judged.answer_consistency === "mismatch" ||   // 저장 정답이 오기입일 수 있으므로 미판정이 아닌 검토필요
    judged.solution_verified === false;

  const finalGrade = hardFail ? null : judged.final_grade;
  const reviewReason =
    starReview || (imageIssue ? "독립 재풀이의 미해결 사항: " + imageIssue : "") || (assessmentInvalid ? "학생 관점·교육과정 검증 근거 불충분" : "") || (pointMismatch ? "등급과 수능 상당 배점 불일치" : "") || (answerUnknown ? "저장 정답과 비교 불가" : "") || (bandMismatch ? "AI 등급과 난도 분류명이 불일치 · 재검증 필요" : "") || judged.review_reason ||
    (hardFail ? "등급 판정 신뢰도가 너무 낮음"
      : judged.answer_consistency === "mismatch" ? "AI 재풀이 답과 저장 정답이 다름 · 정답 확인 필요"
      : judged.solution_verified === false ? "독립 재풀이의 타당성이 확인되지 않음"
      : confidence < .68 ? "난이도 판정 신뢰도 낮음"
      : "");

  return {
    ...judged,
    decision: hardFail || judged.decision !== "graded" ? "unclassified" : "graded",
    final_grade: finalGrade as DifficultyValue | null,
    csat_point_equivalent: finalGrade ? judged.csat_point_equivalent : null,
    csat_difficulty_band: finalGrade ? judged.csat_difficulty_band : null,
    confidence,
    review_required: hardFail || needsReview,
    review_reason: reviewReason,
    solve, execution,
  };
}

/** 판정 결과를 DNA에 반영. 미판정이면 기존 난이도/기존 scale_version을 절대 확정값처럼 바꾸지 않는다. */
export function applyJudgedDifficulty(dna:any,result:DifficultyJudgement,previousGrade:string|null=null) {
  if (dna?.difficulty?.admin_fixed === true) return dna;
  const next=dna&&typeof dna==="object"?{...dna}:{};
  const oldDifficulty={...(next.difficulty??{})};
  const graded = result.decision === "graded" && !!result.final_grade && !result.review_required;
  next.difficulty = {
    ...oldDifficulty,
    ...(graded ? {
      final_grade:Number(result.final_grade),
      csat_point_equivalent:result.csat_point_equivalent,
      csat_difficulty_band:result.csat_difficulty_band,
      csat_basis:result.reason,
      scale_version:DIFFICULTY_SCALE_VERSION,
    } : {}),
    reasons:[{tag:"재풀이 검증 난이도",evidence:result.reason,confidence:result.confidence}],
    ai_regrade_target_scale_version:DIFFICULTY_SCALE_VERSION,
    ai_regraded_at:new Date().toISOString(),
    ai_regrade_confidence:result.confidence,
    ai_regrade_version:DIFFICULTY_JUDGE_VERSION,
    previous_final_grade:previousGrade,
    difficulty_decision:result.decision,
    difficulty_review_required:result.review_required || !graded,
    difficulty_review_reason:result.review_reason || (!graded ? "AI 재판정 미확정 · 기존 난이도 유지" : ""),
    solution_verified:result.solution_verified,
    answer_consistency:result.answer_consistency,
    independent_solve:result.solve,
    student_assessment:result.student_assessment ?? null,
    execution:result.execution ?? null,
    ...(graded ? {difficulty_source:"ai-student-assessment",difficulty_estimated:false,source_cap_applied:false} : {}),
    source_stars:result.solve.source_stars ?? oldDifficulty.source_stars ?? null,
    source_star_policy:SOURCE_STAR_POLICY,
    allowed_regrade_grades:sourceStarGrades(result.solve.source_stars),
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
