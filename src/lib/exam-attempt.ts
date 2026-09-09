export function examAttemptAnswerCount(attempt: any) {
  if (!attempt?.answers || typeof attempt.answers !== "object") return 0;
  return Object.values(attempt.answers).filter((value) =>
    String(value ?? "").trim(),
  ).length;
}

function attemptTime(attempt: any) {
  return String(
    attempt?.graded_at ??
      attempt?.submitted_at ??
      attempt?.last_saved_at ??
      attempt?.started_at ??
      attempt?.created_at ??
      "",
  );
}

/**
 * 과거 중복 응시행이 남아 있어도 실제 답안이 가장 많이 저장된 행을 우선한다.
 * 답안 수가 같으면 제출 완료, 최신 저장/채점 순으로 하나를 고른다.
 */
export function compareExamAttempts(a: any, b: any) {
  const answerDiff = examAttemptAnswerCount(b) - examAttemptAnswerCount(a);
  if (answerDiff) return answerDiff;
  const statusRank = (value: any) =>
    value?.status === "submitted" ? 2 : value?.status === "in_progress" ? 1 : 0;
  const statusDiff = statusRank(b) - statusRank(a);
  if (statusDiff) return statusDiff;
  const timeDiff = attemptTime(b).localeCompare(attemptTime(a));
  if (timeDiff) return timeDiff;
  return String(b?.id ?? "").localeCompare(String(a?.id ?? ""));
}

export function pickCanonicalAttempt(attempts: any[]) {
  return [...attempts].sort(compareExamAttempts)[0] ?? null;
}

export function dedupeExamAttempts(
  attempts: any[],
  keyOf: (attempt: any) => string,
) {
  const groups = new Map<string, any[]>();
  for (const attempt of attempts) {
    const key = keyOf(attempt);
    groups.set(key, [...(groups.get(key) ?? []), attempt]);
  }
  return [...groups.values()]
    .map(pickCanonicalAttempt)
    .filter(Boolean);
}
