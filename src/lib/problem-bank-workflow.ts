export type WorkflowBucket = "registered" | "pending" | "review" | "failed" | "other";

export type WorkflowQuestionLike = {
  status?: unknown;
  review_result?: unknown;
};

export type WorkflowSummary = {
  state: "UNANALYZED" | "ANALYZING" | "PENDING" | "REVIEW" | "REGISTERED" | "FAILED";
  label: string;
  total: number;
  registered: number;
  pending: number;
  review: number;
  failed: number;
  other: number;
};

function reviewResultOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function workflowBucketOf(question: WorkflowQuestionLike): WorkflowBucket {
  const review = reviewResultOf(question.review_result);
  if (String(review.bank_status ?? "").trim().toUpperCase() === "REGISTERED") return "registered";

  const status = String(question.status ?? "").trim().toUpperCase();
  if (status === "APPROVED" || status === "AUTO_REGISTERED" || status === "REGISTERED") return "pending";
  if (status === "REVIEW") return "review";
  if (status === "FAILED" || status === "REJECTED") return "failed";
  return "other";
}

export function summarizeWorkflow(questions: WorkflowQuestionLike[]): WorkflowSummary {
  let registered = 0;
  let pending = 0;
  let review = 0;
  let failed = 0;
  let other = 0;

  for (const question of questions) {
    const bucket = workflowBucketOf(question);
    if (bucket === "registered") registered += 1;
    else if (bucket === "pending") pending += 1;
    else if (bucket === "review") review += 1;
    else if (bucket === "failed") failed += 1;
    else other += 1;
  }

  const total = questions.length;
  let state: WorkflowSummary["state"] = "ANALYZING";
  let label = `분석중 ${registered + pending + review + failed}/${total}`;

  if (total === 0) {
    state = "UNANALYZED";
    label = "미분석";
  } else if (registered === total) {
    state = "REGISTERED";
    label = `문제은행 등록완료 ${registered}/${total}`;
  } else if (review > 0) {
    state = "REVIEW";
    label = `등록 ${registered} · 대기 ${pending} · 보류 ${review} / 전체 ${total}`;
  } else if (pending > 0) {
    state = "PENDING";
    label = `등록 ${registered} · 대기 ${pending} / 전체 ${total}`;
  } else if (failed > 0 && other === 0) {
    state = "FAILED";
    label = `제외·실패 ${failed}/${total}`;
  }

  return { state, label, total, registered, pending, review, failed, other };
}
