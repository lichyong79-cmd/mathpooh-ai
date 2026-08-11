export const SUBJECTS = ["중등수학","공통수학1","공통수학2","대수","미적분 I","확률과 통계"] as const;
export function normalizeSubject(value: unknown): string {
  const s=String(value ?? "").trim();
  const aliases:Record<string,string>={"미적분Ⅰ":"미적분 I","미적분1":"미적분 I","확통":"확률과 통계","공통수학Ⅰ":"공통수학1","공통수학 1":"공통수학1","공통수학Ⅱ":"공통수학2","공통수학 2":"공통수학2"};
  return aliases[s] ?? s;
}
