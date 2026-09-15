/** Preserve numeric values; only explicit choice labels may become choice indices. */
export function normalizeProblemAnswer(value: unknown, format: unknown): string {
  const raw = String(value ?? "").trim().replace(/^(?:정답|답|선지)\s*[:：]\s*/, "");
  if (format === "objective" || format === "multiple_choice") {
    const circled = raw.match(/^([①②③④⑤])(?:$|\s|[.(（])/);
    if (circled) return String("①②③④⑤".indexOf(circled[1]) + 1);
    const numbered = raw.match(/^([1-5])(?:번)?$/);
    if (numbered) return numbered[1];
  }
  return raw;
}

/** Ambiguous index/value mappings require review, never a guessed conversion. */
export function problemAnswerIssues(answer: unknown, format: unknown, dnaAnswer?: unknown, officialAnswer?: unknown): string[] {
  const issues: string[] = [];
  const normalized = normalizeProblemAnswer(answer, format);
  const objective = format === "objective" || format === "multiple_choice";
  if (!normalized) issues.push("정답이 비어 있습니다.");
  for (const [label, value] of [["저장", answer], ["분석", dnaAnswer], ["공식 해설", officialAnswer]]) {
    if (value === undefined || value === null || String(value).trim() === "") continue;
    const candidate = normalizeProblemAnswer(value, format);
    if (objective && !/^[1-5]$/.test(candidate)) {
      issues.push(`${label} 정답과 객관식 형식이 충돌합니다. 선지 번호와 값을 확인하세요.`);
    }
    if (candidate !== normalized) issues.push(`${label} 정답과 최종 저장 정답이 다릅니다.`);
  }
  return [...new Set(issues)];
}
