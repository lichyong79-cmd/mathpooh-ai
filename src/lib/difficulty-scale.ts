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
  const raw=String(value ?? "").trim();
  const version=String(dna?.difficulty?.scale_version ?? dna?.difficulty?.difficulty_scale_version ?? "");
  if (version === DIFFICULTY_SCALE_VERSION) return normalizeDifficulty(raw, fallback);
  // 기존 1~5 체계를 새 8단계로 보수적으로 환산. 전체 재판정 시 정확한 8단계로 교체된다.
  const legacyMap: Record<string,DifficultyValue> = {"1":"1","2":"2","3":"5","4":"6","5":"7",A:"1",B:"2",C:"5",D:"6",E:"7",하:"1",중:"2",상:"6",최상:"7"};
  return legacyMap[raw] ?? normalizeDifficulty(raw, fallback);
}
