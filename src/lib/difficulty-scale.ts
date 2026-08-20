export const DIFFICULTY_SCALE = [
  { value: "1", label: "2점", band: "two_point" },
  { value: "2", label: "3점", band: "three_point" },
  { value: "3", label: "어3", band: "three_hard" },
  { value: "4", label: "쉬4", band: "four_easy" },
  { value: "5", label: "적4", band: "four_medium" },
  { value: "6", label: "어4", band: "four_hard" },
  { value: "7", label: "준킬러", band: "semi_killer" },
  { value: "8", label: "킬러", band: "killer" },
] as const;

export type DifficultyValue = typeof DIFFICULTY_SCALE[number]["value"];
export type DifficultyBand = typeof DIFFICULTY_SCALE[number]["band"];

const labelMap = Object.fromEntries(DIFFICULTY_SCALE.map((x) => [x.value, x.label])) as Record<string,string>;
const bandMap = Object.fromEntries(DIFFICULTY_SCALE.map((x) => [x.value, x.band])) as Record<string,DifficultyBand>;
const valueByBand: Record<string,DifficultyValue> = {
  two_point:"1", three_point:"2", three_hard:"3", four_easy:"4", four_medium:"5", four_hard:"6",
  semi_killer:"7", semi_killer_easy:"7", semi_killer_hard:"7", killer:"8",
};

export const DIFFICULTY_SCALE_VERSION = "sos8-v1" as const;
export const DIFFICULTY_WEIGHTS: Record<number, number> = {
  1: 1.00, 2: 1.08, 3: 1.16, 4: 1.28, 5: 1.42, 6: 1.60, 7: 1.82, 8: 2.10,
};

export const DIFFICULTY_PROMPT_GUIDE = `SOS 공식 난이도는 아래 8단계 하나만 사용한다. 기존 1~5 체계나 쉬움/보통/어려움 3단계 체계는 사용하지 않는다.
1=2점: 정의·공식·성질의 직접 적용 중심.
2=3점: 정형 대표유형, 기본 조건 해석과 계산.
3=어3: 3점 상단, 쉬운 4점 직전의 까다로운 조건·계산·연결.
4=쉬4: 4점 입문, 실질적 사고가 필요하나 풀이 진입이 비교적 명확.
5=적4: 적정 4점, 표준 수능 4점의 중심.
6=어4: 어려운 4점, 복합 추론·경우 분류·구조 변환·계산 부담이 큼.
7=준킬러: 상위권 변별용 고난도.
8=킬러: 최상위권 변별용 최고난도.
특히 어3/쉬4/적4/어4 경계를 세밀하게 구분하고 분포를 억지로 맞추지 않는다.`;


export function normalizeDifficulty(value: unknown, fallback: DifficultyValue | "" = "") : DifficultyValue | "" {
  const raw=String(value ?? "").trim();
  if (/^[1-8]$/.test(raw)) return raw as DifficultyValue;
  const legacy: Record<string,DifficultyValue> = { A:"1",B:"2",C:"4",D:"6",E:"8",하:"1",중:"2",상:"6",최상:"8" };
  return legacy[raw] ?? fallback;
}
export function difficultyLabel(value: unknown) { const v=normalizeDifficulty(value); return v ? labelMap[v] : "미분류"; }
export function difficultyBand(value: unknown) { const v=normalizeDifficulty(value); return v ? bandMap[v] : null; }
export function difficultyFromBand(band: unknown): DifficultyValue | "" { return valueByBand[String(band ?? "").trim()] ?? ""; }
export function difficultyNumber(value: unknown, fallback=4) { const v=normalizeDifficulty(value); return v ? Number(v) : fallback; }

export function normalizeProblemDifficulty(value: unknown, dna?: any, fallback: DifficultyValue | "" = "") : DifficultyValue | "" {
  // SOS273: AI 재판정 실패(unclassified)는 저장 난이도 삭제가 아니다.
  // difficulty 컬럼에 유효한 값이 있으면 화면/집계에서는 반드시 그 값을 유지한다.
  const raw=String(value ?? "").trim();
  const version=String(dna?.difficulty?.scale_version ?? dna?.difficulty?.difficulty_scale_version ?? "");
  if (version === DIFFICULTY_SCALE_VERSION) return normalizeDifficulty(raw, fallback);
  const legacyMap: Record<string,DifficultyValue> = {"1":"1","2":"2","3":"5","4":"6","5":"7",A:"1",B:"2",C:"5",D:"6",E:"7",하:"1",중:"2",상:"6",최상:"7"};
  return legacyMap[raw] ?? normalizeDifficulty(raw, fallback);
}

export function problemDifficultyNeedsReview(value: unknown, dna?: any): boolean {
  const diff=dna?.difficulty ?? {};
  if (diff?.admin_fixed === true) return false;
  if (diff?.difficulty_review_required === true || dna?.summary?.review_required === true) return true;
  // SOS274: 예전에는 "저장 난이도가 있는 미판정"만 검토필요로 셌다.
  // 그 결과 난이도가 아예 없는 문항(가장 손봐야 할 대상)이 검토필요에서 빠져
  // 검토필요 0으로 표시되는 착시가 생겼다. 미판정이면 저장값 유무와 무관하게 센다.
  return String(diff?.difficulty_decision ?? "") === "unclassified";
}

/**
 * SOS274: 이 문항이 실제로 AI 8단계 재판정을 거쳤는가.
 *
 * scale_version만으로는 판단할 수 없다.
 * supabase-v3.0-sos-difficulty-8scale.sql이 옛 1~5 난이도를 기계 환산하면서
 * scale_version에 'sos8-v1' 도장을 함께 찍었기 때문에, 검증받은 적 없는 문항도
 * 새 체계로 보인다. 실제 판정 흔적은 ai_regrade_version에만 남는다.
 */
export function difficultyAiJudged(dna?: any): boolean {
  const d = dna?.difficulty ?? {};
  if (d?.admin_fixed === true) return true;                 // 관리자가 직접 확정한 값은 검증된 것으로 본다
  if (!String(d?.ai_regrade_version ?? "").trim()) return false;
  if (String(d?.difficulty_decision ?? "") !== "graded") return false;
  // SOS275: DNA 공식 재계산이 AI 판정보다 나중에 돌았다면 저장값은 공식 추정치다.
  const aiAt = Date.parse(String(d?.ai_regraded_at ?? ""));
  const dnaAt = Date.parse(String(d?.dna_recalculated_at ?? ""));
  if (Number.isFinite(aiAt) && Number.isFinite(dnaAt) && dnaAt > aiAt) return false;
  return true;
}
