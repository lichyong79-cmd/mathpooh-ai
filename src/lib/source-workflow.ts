/**
 * 시험지 진행 상태 단일 기준 (SOS164)
 *
 * 예전에는 같은 상태를 세 군데에서 따로 계산했다.
 *  - /api/source-files/analysis-statuses         (문제등록 탭 목록)
 *  - /api/source-files/[id]/analysis-status      (개별 조회)
 *  - AI 분석 화면 클라이언트                      (review_result.bank_status 기준)
 *
 * 기준이 달라서 "등록완료"인데 "검토보류"로도 세어지는 식의 불일치가 생겼다.
 * 이제 상태 판정과 표기는 이 파일 하나만 사용한다.
 */

export type SourceWorkflowState =
  | "UNANALYZED" | "ANALYZING" | "PENDING" | "REVIEW" | "REGISTERED" | "FAILED";

export type SourceWorkflowTone = "new" | "running" | "pending" | "review" | "ready" | "error";

export type QuestionStage = "registered" | "pending" | "review" | "failed" | "other";

export type SourceWorkflowCounts = {
  total: number;
  registered: number;
  pending: number;
  review: number;
  failed: number;
  other: number;
};

export type SourceWorkflowStatus = SourceWorkflowCounts & {
  state: SourceWorkflowState;
  label: string;
  detail: string;
  tone: SourceWorkflowTone;
};

/** 화면 어디서나 같은 단어를 쓴다. */
export const SOURCE_WORKFLOW_LABEL: Record<SourceWorkflowState, string> = {
  UNANALYZED: "미분석",
  ANALYZING: "분석중",
  PENDING: "등록대기",
  REVIEW: "검토보류",
  REGISTERED: "문제은행 등록완료",
  FAILED: "분석오류",
};

export const SOURCE_WORKFLOW_TONE: Record<SourceWorkflowState, SourceWorkflowTone> = {
  UNANALYZED: "new",
  ANALYZING: "running",
  PENDING: "pending",
  REVIEW: "review",
  REGISTERED: "ready",
  FAILED: "error",
};

export const SOURCE_WORKFLOW_ORDER: SourceWorkflowState[] = [
  "UNANALYZED", "ANALYZING", "PENDING", "REVIEW", "REGISTERED", "FAILED",
];

/**
 * 문항 1개의 단계를 정한다.
 * 문제은행에 등록된 문항은 analysis_questions.status가 무엇이든 "등록완료"가 우선이다.
 * (등록완료 문항이 보류로도 세어지던 중복 집계를 없앤다.)
 */
export function classifyQuestionStage(status: unknown, bankRegistered: boolean): QuestionStage {
  if (bankRegistered) return "registered";
  const value = String(status ?? "").toUpperCase();
  if (value === "APPROVED" || value === "AUTO_REGISTERED") return "pending";
  if (value === "REVIEW") return "review";
  if (value === "FAILED" || value === "REJECTED") return "failed";
  return "other";
}

export function emptySourceWorkflowCounts(): SourceWorkflowCounts {
  return { total: 0, registered: 0, pending: 0, review: 0, failed: 0, other: 0 };
}

export function countSourceWorkflow(
  questions: Array<{ status?: unknown; bankRegistered: boolean }>,
): SourceWorkflowCounts {
  const counts = emptySourceWorkflowCounts();
  for (const question of questions) {
    counts[classifyQuestionStage(question.status, question.bankRegistered)] += 1;
  }
  counts.total = questions.length;
  return counts;
}

/** 카운트 → 상태/표기. 서버와 화면이 모두 이 함수를 통과한다. */
export function summarizeSourceWorkflow(counts: SourceWorkflowCounts): SourceWorkflowStatus {
  const { total, registered, pending, review, failed, other } = counts;
  let state: SourceWorkflowState;

  if (total === 0) state = "UNANALYZED";
  else if (registered >= total && pending === 0 && review === 0 && failed === 0 && other === 0) state = "REGISTERED";
  else if (review > 0) state = "REVIEW";
  else if (pending > 0) state = "PENDING";
  else if (failed > 0 && registered === 0 && other === 0) state = "FAILED";
  else state = "ANALYZING";

  const detail =
    state === "UNANALYZED" ? "AI 분석 전"
      : state === "REGISTERED" ? `${registered}/${total}문항`
        : state === "FAILED" ? `${failed}문항 실패`
          : `등록 ${registered} · 대기 ${pending} · 보류 ${review} / 전체 ${total}`;

  return {
    ...counts,
    state,
    label: SOURCE_WORKFLOW_LABEL[state],
    detail,
    tone: SOURCE_WORKFLOW_TONE[state],
  };
}
