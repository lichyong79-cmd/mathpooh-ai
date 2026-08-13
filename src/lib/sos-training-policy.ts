import { clampMeter } from "@/lib/difficulty-meter";

export function sosTrainingGoalDelta(baseline: number) {
  const b = clampMeter(baseline);
  if (b < 4) return 0.30;
  if (b < 6) return 0.20;
  if (b < 7) return 0.15;
  if (b < 7.5) return 0.10;
  return 0.05;
}

export function sosTrainingGoalMeter(baseline: number) {
  const b = clampMeter(baseline);
  return clampMeter(Math.min(8, b + sosTrainingGoalDelta(b)));
}

export function expectedSolveSeconds(problemMeter: number) {
  const m = clampMeter(problemMeter);
  if (m < 1.5) return 55;
  if (m < 2.5) return 80;
  if (m < 3.5) return 110;
  if (m < 4.5) return 145;
  if (m < 5.5) return 185;
  if (m < 6.5) return 235;
  if (m < 7.5) return 300;
  return 390;
}

export function trainingPerformanceActual(args:{correct:boolean;responseSeconds?:number|null;problemMeter:number}) {
  if (!args.correct) return 0;
  const expected = expectedSolveSeconds(args.problemMeter);
  const seconds = Number(args.responseSeconds ?? 0);
  if (!seconds || !Number.isFinite(seconds)) return 0.90;
  const ratio = seconds / expected;
  if (ratio <= 0.75) return 1.00;
  if (ratio <= 1.00) return 0.96;
  if (ratio <= 1.30) return 0.90;
  if (ratio <= 1.70) return 0.82;
  return 0.74;
}

export function reviewBonus(args:{correct:boolean;responseSeconds?:number|null;problemMeter:number}) {
  if (!args.correct) return 0;
  const expected = expectedSolveSeconds(args.problemMeter);
  const seconds = Number(args.responseSeconds ?? 0);
  if (!seconds || !Number.isFinite(seconds)) return 0.008;
  const ratio = seconds / expected;
  if (ratio <= 0.80) return 0.012;
  if (ratio <= 1.20) return 0.010;
  if (ratio <= 1.70) return 0.007;
  return 0.004;
}

export function trainingDifficultyTargets(studentMeter:number) {
  const s=clampMeter(studentMeter);
  return [
    ...Array.from({length:3},()=>({meter:clampMeter(s-0.9),role:"기초 안정화"})),
    ...Array.from({length:4},()=>({meter:clampMeter(s-0.35),role:"핵심 보완"})),
    ...Array.from({length:2},()=>({meter:clampMeter(s+0.15),role:"포함 적용"})),
    {meter:clampMeter(s+0.45),role:"완성 확인"},
  ];
}
