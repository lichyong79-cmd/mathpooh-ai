// 30문항 수능형 수학: 공통 1~15 객관식, 16~22 단답형 /
// 선택 23~28 객관식, 29~30 단답형.
export function isObjectiveQuestion(questionNo: number, questionCount: number, objectiveCount: number) {
  if (questionCount === 30 && objectiveCount === 21)
    return questionNo <= 15 || (questionNo >= 23 && questionNo <= 28);
  return questionNo <= objectiveCount;
}

export function questionTypeSummary(questionCount: number, objectiveCount: number) {
  if (questionCount === 30 && objectiveCount === 21)
    return "1~15 객관식 · 16~22 주관식 · 23~28 객관식 · 29~30 주관식";
  return objectiveCount
    ? `1~${objectiveCount} 객관식 · ${objectiveCount + 1}~${questionCount} 주관식`
    : `1~${questionCount} 주관식`;
}
