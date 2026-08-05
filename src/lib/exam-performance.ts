export type PerformanceGroup = {
  label: string;
  total: number;
  correct: number;
  rate: number;
};

export type PerformanceHistory = {
  attemptId: string;
  examId: string;
  title: string;
  examDate: string;
  submittedAt: string;
  score: number;
  correct: number;
  questionCount: number;
};

const answerAt = (answers: unknown, no: number) => {
  if (!answers || typeof answers !== "object") return "";
  const row = answers as Record<string, unknown>;
  return String(row[String(no)] ?? row[no] ?? "").trim();
};

function groupRows(rows: Array<{ label: string; correct: boolean }>) {
  const groups = new Map<string, { total: number; correct: number }>();
  for (const row of rows) {
    const current = groups.get(row.label) ?? { total: 0, correct: 0 };
    current.total += 1;
    if (row.correct) current.correct += 1;
    groups.set(row.label, current);
  }
  return [...groups.entries()]
    .map(([label, value]) => ({
      label,
      ...value,
      rate: Math.round((value.correct / Math.max(1, value.total)) * 100),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "ko"));
}

export function buildStudentPerformance(
  attempts: any[],
  exams: any[],
  metadata: any[],
) {
  const examMap = new Map(exams.map((exam) => [String(exam.id), exam]));
  const metadataMap = new Map<string, any>();
  for (const item of metadata)
    metadataMap.set(`${item.exam_id}:${item.question_no}`, item);

  const history: PerformanceHistory[] = [];
  const units: Array<{ label: string; correct: boolean }> = [];
  const types: Array<{ label: string; correct: boolean }> = [];
  const difficulties: Array<{ label: string; correct: boolean }> = [];

  for (const attempt of attempts) {
    const exam = examMap.get(String(attempt.exam_id));
    if (!exam || attempt.status !== "submitted") continue;
    const keys = Array.isArray(exam.answer_keys) ? exam.answer_keys.map(String) : [];
    const questionCount = Number(exam.question_count ?? keys.length ?? 0);
    let recomputedCorrect = 0;
    for (let no = 1; no <= questionCount; no += 1) {
      const correct = Boolean(keys[no - 1]) && answerAt(attempt.answers, no) === String(keys[no - 1]).trim();
      if (correct) recomputedCorrect += 1;
      const info = metadataMap.get(`${exam.id}:${no}`);
      const unit = info?.middle_unit || info?.major_unit || info?.minor_unit || "미분류";
      const problemTypes = Array.isArray(info?.problem_types) ? info.problem_types : [];
      const type = problemTypes[0] || info?.detailed_topic || info?.question_type || "미분류";
      const difficulty = Number(info?.difficulty);
      units.push({ label: unit, correct });
      types.push({ label: type, correct });
      difficulties.push({
        label: difficulty >= 1 && difficulty <= 5 ? `${difficulty}단계` : "미분류",
        correct,
      });
    }
    history.push({
      attemptId: String(attempt.id),
      examId: String(exam.id),
      title: exam.title ?? "시험",
      examDate: exam.exam_date ?? "",
      submittedAt: attempt.submitted_at ?? "",
      score: Number(attempt.score ?? Math.round((recomputedCorrect / Math.max(1, questionCount)) * Number(exam.total_score ?? 100))),
      correct: recomputedCorrect,
      questionCount,
    });
  }
  history.sort((a, b) => (b.submittedAt || b.examDate).localeCompare(a.submittedAt || a.examDate));
  const scores = history.map((item) => item.score);
  return {
    summary: {
      examCount: history.length,
      averageScore: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
      latestScore: scores[0] ?? null,
      bestScore: scores.length ? Math.max(...scores) : null,
      scoreChange: scores.length > 1 ? scores[0] - scores[1] : null,
    },
    history,
    units: groupRows(units),
    types: groupRows(types),
    difficulties: groupRows(difficulties).sort((a, b) => a.label.localeCompare(b.label, "ko")),
  };
}
