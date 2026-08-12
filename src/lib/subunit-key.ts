function clean(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function slug(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[ㆍ·]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 학생 난이도 미터의 기준 단위는 소단원.
 * problem_bank_questions.unit 를 1순위로 사용하고,
 * 비어 있으면 Problem DNA의 basic/unit 계층에서 안전하게 fallback.
 */
export function problemSubunit(problem: any) {
  const dna = problem?.problem_dna ?? {};
  const basic = dna?.basic ?? {};
  const taxonomy = dna?.taxonomy ?? {};

  const subject = clean(problem?.subject || basic?.subject || taxonomy?.subject);
  const major =
    clean(
      problem?.problem_dna?.basic?.major_unit ||
      taxonomy?.major_unit ||
      taxonomy?.chapter ||
      ""
    );
  const subunit =
    clean(
      basic?.minor_unit ||
      taxonomy?.minor_unit ||
      basic?.middle_unit ||
      taxonomy?.middle_unit ||
      problem?.unit ||
      basic?.unit ||
      problem?.topic ||
      ""
    );

  return {
    subject,
    major,
    subunit,
    key: [slug(subject), slug(major), slug(subunit)].filter(Boolean).join("::"),
  };
}

export function requireSubunit(problem: any) {
  const info = problemSubunit(problem);
  if (!info.subunit || !info.key) {
    throw new Error("소단원 분류가 없는 문항입니다. 문제등록에서 소단원을 먼저 확정해 주세요.");
  }
  return info;
}
