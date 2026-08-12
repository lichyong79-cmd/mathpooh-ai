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

export function calculateExamScore(
  answers: Record<string, unknown> | null | undefined,
  answerKeys: unknown,
  questionCount: number,
  totalScore = 100,
): ExamScoreResult {
  const keys = Array.isArray(answerKeys) ? answerKeys.map(normalizeExamAnswer) : [];
  const wrong: number[] = [];
  const unanswered: number[] = [];
  let correct = 0;

  for (let no = 1; no <= Math.max(0, Number(questionCount || 0)); no += 1) {
    const answer = normalizeExamAnswer(answers?.[String(no)]);
    const key = normalizeExamAnswer(keys[no - 1]);
    if (!answer) unanswered.push(no);
    else if (key && answer === key) correct += 1;
    else wrong.push(no);
  }

  const score = Math.round(
    (correct / Math.max(1, Number(questionCount || 0))) * Number(totalScore || 100),
  );
  return { score, correct, wrong, unanswered };
}
