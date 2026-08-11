export const SUBJECTS = [
  "중등수학",
  "공통수학1",
  "공통수학2",
  "대수",
  "미적분 I",
  "확률과 통계",
] as const;

export type StandardSubject = (typeof SUBJECTS)[number];

function compact(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[ㆍ·]/g, "");
}

export function normalizeSubject(value: unknown): string {
  const raw = String(value ?? "").normalize("NFKC").trim();
  if (!raw) return "";

  const key = compact(raw).toLowerCase();
  const aliases: Record<string, StandardSubject> = {
    "중등수학": "중등수학",
    "중학수학": "중등수학",
    "중등": "중등수학",

    "공통수학1": "공통수학1",
    "공통수학i": "공통수학1",
    "공통수학ⅰ": "공통수학1",
    "고등수학(상)": "공통수학1",
    "고등수학상": "공통수학1",
    "수학(상)": "공통수학1",

    "공통수학2": "공통수학2",
    "공통수학ii": "공통수학2",
    "공통수학ⅱ": "공통수학2",
    "고등수학(하)": "공통수학2",
    "고등수학하": "공통수학2",
    "수학(하)": "공통수학2",

    "대수": "대수",
    "수학i": "대수",
    "수학ⅰ": "대수",
    "수학1": "대수",

    "미적분i": "미적분 I",
    "미적분ⅰ": "미적분 I",
    "미적분1": "미적분 I",
    "미적분": "미적분 I",

    "확률과통계": "확률과 통계",
    "확통": "확률과 통계",
    "확률통계": "확률과 통계",
  };

  return aliases[key] ?? raw;
}

export function isStandardSubject(value: unknown): value is StandardSubject {
  return SUBJECTS.includes(normalizeSubject(value) as StandardSubject);
}
