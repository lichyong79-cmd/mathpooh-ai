/**
 * SOS LANDMARK 공용 계산기
 *
 * 학생 화면 첫 화면(SOS LANDMARK)은 실전모의고사 결과를 과목별 백분위로 바꿔
 * 랜드마크 건물 완성도(0~100%)와 층수(0~10층)로 표시합니다.
 *
 * 백분위는 두 가지 방식으로 만듭니다.
 *  1) cohort   : 같은 시험을 제출한 응시자 점수로 계산한 실제 백분위 (서버에서만 가능)
 *  2) estimated: 응시 인원이 적을 때 쓰는 원점수 → 백분위 환산 추정값
 *
 * 두 방식 모두 여기 한 곳에서만 정의합니다. 서버(포털 API)와 학생 화면이 같은 함수를 씁니다.
 */

export type LandmarkSubject = "대수" | "미적분1" | "확률과통계";
export type LandmarkBasis = "cohort" | "estimated";

export const LANDMARK_SUBJECTS: LandmarkSubject[] = [
  "대수",
  "미적분1",
  "확률과통계",
];

/** 실제 백분위로 인정할 최소 응시 인원. 이보다 적으면 환산 추정값을 씁니다. */
export const MIN_COHORT_SIZE = 8;

export type LandmarkRecord = {
  subject: LandmarkSubject;
  percentile: number;
  basis: LandmarkBasis;
  score: number;
  title: string;
  date: string;
};

export type LandmarkSubjectState = {
  subject: LandmarkSubject;
  /** 최고 백분위 = 건물 완성도(%) */
  best: number;
  /** 가장 최근 응시 백분위 */
  recent: number;
  /** 완성된 층수 0~10 */
  floors: number;
  /** 백분위 기준 등급 1~9, 기록이 없으면 0 */
  grade: number;
  attempts: number;
  basis: LandmarkBasis | null;
  lastTitle: string;
  lastDate: string;
};

export type LandmarkSummary = {
  subjects: Record<LandmarkSubject, LandmarkSubjectState>;
  /** 세 과목 평균 백분위 = 도시 완성도 */
  overall: number;
  /** 정복한 층수 합계 0~30 */
  totalFloors: number;
  /** 주변 완성 단계 0~4 */
  cityLevel: number;
  /** 최근 3회 평균 백분위 = 도시 날씨 */
  recentCondition: number;
  updatedAt: string;
};

/**
 * 원점수 → 백분위 환산 기준표.
 * 최근 수능 수학 성적표 분포를 기준으로 만든 근사값입니다.
 * 학원 자체 기준으로 바꾸려면 이 표만 수정하면 화면 전체에 반영됩니다.
 */
const SCORE_TO_PERCENTILE: [score: number, percentile: number][] = [
  [0, 1],
  [8, 4],
  [16, 8],
  [24, 14],
  [32, 22],
  [40, 31],
  [48, 41],
  [56, 52],
  [64, 64],
  [72, 76],
  [80, 86],
  [88, 93],
  [92, 96],
  [96, 98],
  [100, 100],
];

export function clampPercentile(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** 원점수를 100점 만점으로 환산합니다. */
export function normalizeScore(score: number, totalScore = 100): number {
  const total = Number(totalScore) > 0 ? Number(totalScore) : 100;
  return Math.max(0, Math.min(100, (Number(score) / total) * 100));
}

/** 원점수 → 백분위 추정값 (응시 인원이 적을 때 사용) */
export function estimatePercentile(score: number, totalScore = 100): number {
  const value = normalizeScore(score, totalScore);
  for (let i = 1; i < SCORE_TO_PERCENTILE.length; i += 1) {
    const [prevScore, prevPercentile] = SCORE_TO_PERCENTILE[i - 1];
    const [nextScore, nextPercentile] = SCORE_TO_PERCENTILE[i];
    if (value <= nextScore) {
      const span = nextScore - prevScore || 1;
      const ratio = (value - prevScore) / span;
      return clampPercentile(
        prevPercentile + (nextPercentile - prevPercentile) * ratio,
      );
    }
  }
  return 100;
}

/**
 * 같은 시험 응시자 점수로 계산한 실제 백분위입니다.
 * 백분위 = 나보다 낮은 점수를 받은 응시자 비율 × 100 (수능 성적표와 같은 정의)
 * 응시 인원이 MIN_COHORT_SIZE보다 적으면 신뢰할 수 없으므로 null을 돌려줍니다.
 */
export function cohortPercentile(
  score: number,
  peerScores: number[],
): number | null {
  const peers = peerScores.filter((value) => Number.isFinite(value));
  if (peers.length < MIN_COHORT_SIZE) return null;
  const below = peers.filter((value) => value < score).length;
  return clampPercentile((below / peers.length) * 100);
}

/** 백분위 → 등급 (수능 등급 구분과 동일) */
export function percentileGrade(percentile: number): number {
  const value = clampPercentile(percentile);
  if (value >= 96) return 1;
  if (value >= 89) return 2;
  if (value >= 77) return 3;
  if (value >= 60) return 4;
  if (value >= 40) return 5;
  if (value >= 23) return 6;
  if (value >= 11) return 7;
  if (value >= 4) return 8;
  return 9;
}

/** 백분위 → 완성 층수 (10층 = 백분위 100) */
export function percentileFloors(percentile: number): number {
  return Math.max(0, Math.min(10, Math.round(clampPercentile(percentile) / 10)));
}


/** 문항 분석 단원명으로 교육과정 과목을 판별합니다. */
export function classifyLandmarkQuestionSubject(
  ...parts: (string | null | undefined)[]
): LandmarkSubject | null {
  const text = parts.filter(Boolean).join(" ").replace(/\s+/g, " ");
  if (!text) return null;
  if (/경우의\s*수|순열|조합|확률|통계|확률분포|이항분포|정규분포|표본/.test(text))
    return "확률과통계";
  if (/수열|등차|등비|시그마|귀납|지수|로그|삼각함수/.test(text))
    return "대수";
  if (/함수의\s*극한|연속|미분|도함수|접선|적분|부정적분|정적분|속도|가속도/.test(text))
    return "미적분1";
  return classifyLandmarkSubject(text);
}

/** 시험 제목·과목명에서 랜드마크 과목을 판별합니다. */
export function classifyLandmarkSubject(
  ...parts: (string | null | undefined)[]
): LandmarkSubject | null {
  const text = parts.filter(Boolean).join(" ");
  if (!text) return null;
  if (text.includes("미적분") || text.includes("미적")) return "미적분1";
  if (text.includes("확률") || text.includes("통계") || text.includes("확통"))
    return "확률과통계";
  if (text.includes("대수")) return "대수";
  return null;
}

function emptySubjectState(subject: LandmarkSubject): LandmarkSubjectState {
  return {
    subject,
    best: 0,
    recent: 0,
    floors: 0,
    grade: 0,
    attempts: 0,
    basis: null,
    lastTitle: "",
    lastDate: "",
  };
}

/** 도시 주변 완성 단계 0~4 */
export function cityLevelOf(overall: number): number {
  const value = clampPercentile(overall);
  if (value >= 85) return 4;
  if (value >= 65) return 3;
  if (value >= 45) return 2;
  if (value >= 25) return 1;
  return 0;
}

export function emptyLandmarkSummary(): LandmarkSummary {
  return {
    subjects: {
      대수: emptySubjectState("대수"),
      미적분1: emptySubjectState("미적분1"),
      확률과통계: emptySubjectState("확률과통계"),
    },
    overall: 0,
    totalFloors: 0,
    cityLevel: 0,
    recentCondition: 0,
    updatedAt: new Date().toISOString(),
  };
}

/** 과목별 응시 기록을 랜드마크 상태로 정리합니다. */
export function buildLandmarkSummary(
  records: LandmarkRecord[],
): LandmarkSummary {
  const summary = emptyLandmarkSummary();
  const sorted = [...records].sort((a, b) =>
    String(a.date ?? "").localeCompare(String(b.date ?? "")),
  );

  for (const record of sorted) {
    const state = summary.subjects[record.subject];
    if (!state) continue;
    const percentile = clampPercentile(record.percentile);
    state.attempts += 1;
    state.best = Math.max(state.best, percentile);
    state.recent = percentile;
    state.basis = record.basis;
    state.lastTitle = record.title ?? "";
    state.lastDate = record.date ?? "";
  }

  for (const subject of LANDMARK_SUBJECTS) {
    const state = summary.subjects[subject];
    state.floors = percentileFloors(state.best);
    state.grade = state.attempts ? percentileGrade(state.best) : 0;
  }

  summary.overall = clampPercentile(
    LANDMARK_SUBJECTS.reduce(
      (sum, subject) => sum + summary.subjects[subject].best,
      0,
    ) / LANDMARK_SUBJECTS.length,
  );
  summary.totalFloors = LANDMARK_SUBJECTS.reduce(
    (sum, subject) => sum + summary.subjects[subject].floors,
    0,
  );
  summary.cityLevel = cityLevelOf(summary.overall);

  const latest = sorted.slice(-3);
  summary.recentCondition = latest.length
    ? clampPercentile(
        latest.reduce((sum, record) => sum + clampPercentile(record.percentile), 0) /
          latest.length,
      )
    : 0;
  summary.updatedAt = new Date().toISOString();
  return summary;
}

type LandmarkExamLike = {
  subject?: string | null;
  title?: string | null;
  exam_date?: string | null;
  total_score?: number | null;
  percentile?: number | null;
  percentile_basis?: string | null;
  attempt?: {
    status?: string | null;
    score?: number | null;
    submitted_at?: string | null;
  } | null;
};

/**
 * 학생 화면에서 쓰는 보조 계산기입니다.
 * 서버가 이미 백분위(percentile)를 내려주면 그대로 쓰고,
 * 없으면 원점수 환산 추정값으로 화면을 만듭니다.
 */
export function summarizeExamsForLandmark(
  exams: LandmarkExamLike[],
): LandmarkSummary {
  const records: LandmarkRecord[] = [];
  for (const exam of exams ?? []) {
    if (exam.attempt?.status !== "submitted") continue;
    const subject = classifyLandmarkSubject(exam.subject, exam.title);
    if (!subject) continue;
    const score = Number(exam.attempt.score ?? 0);
    const hasServerPercentile =
      exam.percentile !== null && exam.percentile !== undefined;
    records.push({
      subject,
      score,
      percentile: hasServerPercentile
        ? clampPercentile(Number(exam.percentile))
        : estimatePercentile(score, Number(exam.total_score ?? 100)),
      basis:
        hasServerPercentile && exam.percentile_basis === "cohort"
          ? "cohort"
          : "estimated",
      title: exam.title ?? "",
      date: exam.attempt.submitted_at ?? exam.exam_date ?? "",
    });
  }
  return buildLandmarkSummary(records);
}
