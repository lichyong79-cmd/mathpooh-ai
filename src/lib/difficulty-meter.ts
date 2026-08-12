export const SOS_DIFFICULTY_LABELS = [
  "2점", "3점", "어3", "쉬4", "적4", "어4", "준킬러", "킬러",
] as const;

export const MIN_PROBLEM_EMPIRICAL_STUDENTS = 20;

export function clampMeter(value: unknown, fallback = 3) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : fallback;
  return Math.round(Math.max(1, Math.min(8, safe)) * 100) / 100;
}

export function meterStage(value: unknown) {
  return Math.max(1, Math.min(8, Math.round(clampMeter(value))));
}

export function meterLabel(value: unknown) {
  return SOS_DIFFICULTY_LABELS[meterStage(value) - 1];
}

export function expectedCorrectProbability(studentMeter: number, problemMeter: number) {
  const s = clampMeter(studentMeter);
  const q = clampMeter(problemMeter);
  return 1 / (1 + Math.pow(10, (q - s) / 2));
}

export function nextStudentMeter(studentMeter: number, problemMeter: number, correct: boolean) {
  const expected = expectedCorrectProbability(studentMeter, problemMeter);
  const actual = correct ? 1 : 0;
  const k = 0.35;
  return clampMeter(studentMeter + k * (actual - expected), studentMeter);
}

export function nextProblemMeter(args: {
  problemMeter: number;
  studentMeterBefore: number;
  correct: boolean;
  uniqueStudents: number;
}) {
  const current = clampMeter(args.problemMeter);
  if (args.uniqueStudents < MIN_PROBLEM_EMPIRICAL_STUDENTS) return current;

  const expected = expectedCorrectProbability(args.studentMeterBefore, current);
  const actual = args.correct ? 1 : 0;
  const confidence = Math.max(
    0.15,
    Math.min(1, (args.uniqueStudents - MIN_PROBLEM_EMPIRICAL_STUDENTS + 1) / 80),
  );
  const k = 0.18 * confidence;
  return clampMeter(current + k * (expected - actual), current);
}

export function diagnosisTargets(studentMeter: number) {
  const s = clampMeter(studentMeter);
  return [
    { meter: clampMeter(s - 0.9), role: "하단 확인" },
    { meter: s, role: "현재 수준" },
    { meter: clampMeter(s + 0.9), role: "상단 확인" },
  ];
}

export function trainingTargets(studentMeter: number) {
  const s = clampMeter(studentMeter);
  return [
    ...Array.from({ length: 2 }, () => ({ meter: clampMeter(s - 0.8), role: "안정화" })),
    ...Array.from({ length: 5 }, () => ({ meter: s, role: "적정 훈련" })),
    ...Array.from({ length: 3 }, () => ({ meter: clampMeter(s + 0.7), role: "상향 도전" })),
  ];
}

export function distanceFromTarget(problemMeter: number, targetMeter: number) {
  return Math.abs(clampMeter(problemMeter) - clampMeter(targetMeter));
}
