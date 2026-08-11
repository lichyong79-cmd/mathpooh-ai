import type { ProblemDNA } from "@/lib/problem-dna";

export type DifficultyReference = {
  difficulty: string | number;
  problem_dna?: any;
};

export type DifficultyJudgement = {
  grade: 1|2|3|4|5|6|7|8;
  bandGrade: 1|2|3|4|5|6|7|8;
  evidenceGrade: 1|2|3|4|5|6|7|8;
  bandConflict: boolean;
  calibrated: boolean;
};

function clamp(value: unknown, min=0, max=100) {
  const n=Number(value);
  return Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : min;
}

export function gradeFromBand(value: unknown): 1|2|3|4|5|6|7|8 {
  const map:Record<string,1|2|3|4|5|6|7|8>={
    two_point:1, three_point:2, three_hard:3, four_easy:4,
    four_medium:5, four_hard:6, semi_killer:7, killer:8,
  };
  return map[String(value ?? "")] ?? 2;
}

export function evidenceScore(dna: ProblemDNA) {
  const d=dna.difficulty;
  return (
    clamp(d.concept)*0.14 +
    clamp(d.condition_interpretation)*0.18 +
    clamp(d.insight)*0.24 +
    clamp(d.calculation)*0.13 +
    clamp(d.trap_strength)*0.08 +
    clamp(d.time_burden)*0.10 +
    clamp(Number(d.thinking_step_count)*8)*0.08 +
    clamp(Number(d.concept_count)*20)*0.05
  );
}

export function gradeFromEvidence(dna: ProblemDNA):1|2|3|4|5|6|7|8 {
  const s=evidenceScore(dna);
  if(s<22)return 1;if(s<34)return 2;if(s<44)return 3;if(s<54)return 4;
  if(s<65)return 5;if(s<76)return 6;if(s<88)return 7;return 8;
}

function vector(dna:any){
  const d=dna?.difficulty??{};
  return [
    clamp(d.concept),clamp(d.condition_interpretation),clamp(d.insight),
    clamp(d.calculation),clamp(d.trap_strength),clamp(d.time_burden),
    clamp(Number(d.thinking_step_count)*8),clamp(Number(d.concept_count)*20),
  ];
}

function distance(a:number[],b:number[]){
  return Math.sqrt(a.reduce((sum,x,i)=>sum+(x-(b[i]??0))**2,0));
}

export function judgeDifficulty(dna:ProblemDNA,references:DifficultyReference[]=[]):DifficultyJudgement{
  const bandGrade=gradeFromBand(dna.difficulty.csat_difficulty_band);
  const evidenceGrade=gradeFromEvidence(dna);
  let grade:1|2|3|4|5|6|7|8=bandGrade;

  // 밴드를 무조건 확정값으로 쓰지 않는다.
  // 근거점수와 2단계 이상 벌어지면 근거 쪽으로 1단계 보정한다.
  const gap=evidenceGrade-bandGrade;
  if(Math.abs(gap)>=2) grade=Math.max(1,Math.min(8,bandGrade+(gap>0?1:-1))) as 1|2|3|4|5|6|7|8;

  // 원장이 직접 확정한 문항이 있으면 동일 8축 기준의 최근접 표본으로 한 번 더 보정한다.
  const fixed=references.filter(r=>r?.problem_dna?.difficulty?.admin_fixed===true && /^[1-8]$/.test(String(r.difficulty)));
  let calibrated=false;
  if(fixed.length>=3){
    const v=vector(dna);
    const nearest=fixed.map(r=>({g:Number(r.difficulty),d:distance(v,vector(r.problem_dna))}))
      .sort((a,b)=>a.d-b.d).slice(0,5);
    const weighted=nearest.reduce((s,x)=>s+x.g/(x.d+20),0)/nearest.reduce((s,x)=>s+1/(x.d+20),0);
    const refGrade=Math.max(1,Math.min(8,Math.round(weighted))) as 1|2|3|4|5|6|7|8;
    if(Math.abs(refGrade-grade)>=1) grade=Math.max(1,Math.min(8,Math.round((grade+refGrade)/2))) as 1|2|3|4|5|6|7|8;
    calibrated=true;
  }

  return {grade,bandGrade,evidenceGrade,bandConflict:Math.abs(bandGrade-evidenceGrade)>=2,calibrated};
}

export function applyDifficultyJudgement(dna:ProblemDNA,references:DifficultyReference[]=[]){
  const j=judgeDifficulty(dna,references);
  dna.difficulty.final_grade=j.grade;
  dna.difficulty.scale_version="sos8-v1";
  (dna.difficulty as any).band_conflict=j.bandConflict;
  (dna.difficulty as any).evidence_grade=j.evidenceGrade;
  (dna.difficulty as any).band_grade=j.bandGrade;
  (dna.difficulty as any).admin_reference_calibrated=j.calibrated;
  return dna;
}
