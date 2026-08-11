/**
 * SOS 과목 표준화 (SOS164)
 *
 * 과목명이 화면마다/AI 응답마다 제각각이면 문제은행 "과목별 보유 문항"이 갈라집니다.
 * 저장 시점에 반드시 이 파일의 표준 6개 중 하나로 고정합니다.
 */

export const SUBJECTS = ["중등수학", "공통수학1", "공통수학2", "대수", "미적분 I", "확률과 통계"] as const;
export type Subject = (typeof SUBJECTS)[number];

/** 표준 과목으로 확정하지 못한 문항에 쓰는 단일 표기. */
export const UNCLASSIFIED_SUBJECT = "미분류";

/** 표기 흔들림(공백/로마숫자/괄호/전각)을 제거한 비교용 키를 만든다. */
function squeeze(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[·・.,~\-_/()[\]{}<>「」『』"'`]/g, "")
    .replace(/[Ⅲⅲ]/g, "3")
    .replace(/[Ⅱⅱ]/g, "2")
    .replace(/[Ⅰⅰ]/g, "1")
    .replace(/III/gi, "3")
    .replace(/II/gi, "2")
    .replace(/I/gi, "1")
    .toLowerCase();
}

/** squeeze 결과 → 표준 과목. AI가 만들어내는 표기 흔들림을 전부 여기서 흡수한다. */
const ALIAS_SOURCE: Record<Subject, string[]> = {
  중등수학: ["중등수학", "중학수학", "중등", "중등부", "중학교수학", "중1수학", "중2수학", "중3수학", "중1", "중2", "중3"],
  공통수학1: ["공통수학1", "공통수학", "공통1", "고등수학상", "수학상", "고1수학1", "고등수학1"],
  공통수학2: ["공통수학2", "공통2", "고등수학하", "수학하", "고1수학2", "고등수학2"],
  대수: ["대수", "수학1", "고2수학1", "지수로그삼각수열"],
  "미적분 I": ["미적분1", "미적분", "수학2", "고2수학2", "미적", "미분적분", "미적분학"],
  "확률과 통계": ["확률과통계", "확통", "확률통계", "통계", "확률과통계학"],
};

const ALIASES: Record<string, Subject> = {};
for (const subject of SUBJECTS) {
  ALIASES[squeeze(subject)] = subject;
  for (const alias of ALIAS_SOURCE[subject]) ALIASES[squeeze(alias)] = subject;
}

/**
 * 표준 과목명으로 변환한다. 매칭에 실패하면 빈 문자열을 돌려준다.
 * (빈 문자열 = "아직 과목을 확정하지 못했다"는 뜻이므로 호출부에서 판단한다.)
 */
export function normalizeSubject(value: unknown): string {
  const key = squeeze(value);
  if (!key) return "";
  return ALIASES[key] ?? "";
}

/**
 * 화면/집계용 과목명. 표준 과목이면 그대로, 아니면 UNCLASSIFIED_SUBJECT로 모은다.
 * 원문을 그대로 남기지 않기 때문에 "과목별 보유 문항"이 더 이상 갈라지지 않는다.
 */
export function canonicalSubject(value: unknown, fallback: unknown = ""): string {
  return normalizeSubject(value) || normalizeSubject(fallback) || UNCLASSIFIED_SUBJECT;
}

export function isCanonicalSubject(value: unknown): value is Subject {
  return (SUBJECTS as readonly string[]).includes(String(value ?? ""));
}
