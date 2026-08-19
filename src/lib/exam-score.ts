export type ExamScoreResult = {
  score: number;
  correct: number;
  wrong: number[];
  unanswered: number[];
};

export function normalizeExamAnswer(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^-?\d+$/.test(text)) return String(Number(text));
  return text;
}

export function normalizeQuestionPoints(value: unknown, questionCount: number, totalScore = 100) {
  const raw = Array.isArray(value) ? value.map((v) => Number(v)) : [];
  const valid = raw.length >= questionCount && raw.slice(0, questionCount).every((v) => Number.isFinite(v) && v >= 0);
  if (valid && raw.slice(0, questionCount).some((v) => v > 0)) return raw.slice(0, questionCount);
  // Legacy exams without per-question points keep the old equal-weight behavior.
  const each = Number(totalScore || 100) / Math.max(1, Number(questionCount || 0));
  return Array.from({ length: Math.max(0, Number(questionCount || 0)) }, () => each);
}

export function calculateExamScore(
  answers: Record<string, unknown> | null | undefined,
  answerKeys: unknown,
  questionCount: number,
  totalScore = 100,
  questionPoints?: unknown,
): ExamScoreResult {
  const count = Math.max(0, Number(questionCount || 0));
  const keys = Array.isArray(answerKeys) ? answerKeys.map(normalizeExamAnswer) : [];
  const points = normalizeQuestionPoints(questionPoints, count, totalScore);
  const configuredTotal = points.reduce((sum, value) => sum + value, 0);
  const scale = configuredTotal > 0 ? Number(totalScore || configuredTotal) / configuredTotal : 1;
  const wrong: number[] = [];
  const unanswered: number[] = [];
  let correct = 0;
  let earned = 0;

  for (let no = 1; no <= count; no += 1) {
    const answer = normalizeExamAnswer(answers?.[String(no)]);
    const key = normalizeExamAnswer(keys[no - 1]);
    if (!answer) unanswered.push(no);
    else if (key && answer === key) { correct += 1; earned += Number(points[no - 1] || 0); }
    else wrong.push(no);
  }

  return { score: Math.round(earned * scale), correct, wrong, unanswered };
}
