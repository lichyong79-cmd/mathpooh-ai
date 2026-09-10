export const SOS_SCOPE_CODES = ["ALGEBRA", "ALGEBRA_CALC1", "FULL"] as const;
export type SosScopeCode = (typeof SOS_SCOPE_CODES)[number];

export function normalizeSosScope(value: unknown): SosScopeCode {
  const code = String(value ?? "FULL").toUpperCase();
  return SOS_SCOPE_CODES.includes(code as SosScopeCode)
    ? (code as SosScopeCode)
    : "FULL";
}

export function sosScopeLabel(value: unknown) {
  const code = normalizeSosScope(value);
  if (code === "ALGEBRA") return "대수";
  if (code === "ALGEBRA_CALC1") return "대수+미적Ⅰ";
  return "대수+미적Ⅰ+확통";
}

export function cycleIdFromSosSession(session: any) {
  const snapshot = session?.target_snapshot ?? {};
  return String(
    snapshot.learningCycleId ??
      snapshot.learning_cycle_id ??
      snapshot.cycleId ??
      "",
  );
}

const OPEN_SOS_STATUSES = new Set(["ASSIGNED", "IN_PROGRESS", "RETRAIN"]);
const FINAL_SOS_DECISIONS = new Set([
  "HOMEWORK_DONE",
  "NO_WEAKNESS_AFTER_SECOND_DIAGNOSIS",
  "SECOND_TRAINING_PASSED",
  "SECOND_TRAINING_DONE",
]);

/**
 * 다음 공식 시험을 여는 보수적인 판정입니다.
 * 단순히 한 단계가 COMPLETED인 것만으로는 통과시키지 않고,
 * 같은 일정의 열린 단계가 하나도 없고 최종 종료 결정이 있을 때만 통과합니다.
 */
export function isSosCyclePassed(sessions: any[], cycleId: string) {
  const rows = (sessions ?? []).filter(
    (session) => cycleIdFromSosSession(session) === String(cycleId),
  );
  if (!rows.length) return false;
  if (rows.some((row) => OPEN_SOS_STATUSES.has(String(row?.status ?? ""))))
    return false;
  return rows.some((row) => {
    const status = String(row?.status ?? "");
    const decision = String(row?.decision ?? "");
    const kind = String(row?.cycle_kind ?? "");
    return (
      ["PASSED", "COMPLETED"].includes(status) &&
      (FINAL_SOS_DECISIONS.has(decision) ||
        (kind === "HOMEWORK" && decision === "HOMEWORK_DONE"))
    );
  });
}

export function isMissingPersonalFlowColumn(message: unknown) {
  const text = String(message ?? "");
  return [
    "formal_sequence",
    "scope_code",
    "attendance_mode",
    "scheduled_at",
    "booking_status",
    "sos_gate_status",
    "is_practice",
  ].some((column) => text.includes(column));
}

