import { difficultyAiVerified } from "@/lib/problem-dna";

/**
 * SOS279 · 난이도 재판정 큐 등록 헬퍼
 *
 * 공식(DNA 가중합)은 난이도를 낮게 매기는 경향이 있어, 등록 시 검증 문턱(쉬4 이상)에
 * 걸리지 않은 문항은 추정치 그대로 굳는다. 지금 4723건이 쌓인 이유가 그것이다.
 * 신규문항도 같은 길을 걷지 않도록, 검증을 못 받은 문항은 등록 즉시 큐에 넣는다.
 *
 * 등록 직후에는 추정치로 바로 사용할 수 있고, 몇 시간 안에 cron이 AI 검증을 끝낸다.
 * 큐 등록이 실패해도 문항 등록 자체는 막지 않는다(best-effort).
 */

// 미분류 → 3점·어3 → 나머지. 경계가 흐린 구간부터 처리한다.
export function difficultyQueuePriority(difficulty: unknown) {
  const d = String(difficulty ?? "").trim();
  if (!/^[1-8]$/.test(d)) return 10;
  if (d === "2" || d === "3") return 20;
  return 30;
}

export async function enqueueDifficultyRegrade(
  supabase: any,
  rows: Array<{ id: string; difficulty?: unknown; problem_dna?: any; question_image_path?: unknown }>,
) {
  try {
    const targets = (rows ?? []).filter(r =>
      r?.id &&
      Boolean(r.question_image_path) &&
      r.problem_dna?.difficulty?.admin_fixed !== true &&
      !difficultyAiVerified(r.problem_dna) &&
      // 이미 AI 판정을 거친 문항(검토필요 포함)은 다시 태우지 않는다.
      !String(r.problem_dna?.difficulty?.ai_regrade_version ?? "").trim()
    );
    if (!targets.length) return 0;

    const now = new Date().toISOString();
    let inserted = 0;
    for (let i = 0; i < targets.length; i += 500) {
      const chunk = targets.slice(i, i + 500).map(r => ({
        question_id: r.id,
        priority: difficultyQueuePriority(r.difficulty),
        status: "QUEUED",
        attempt_count: 0,
        before_difficulty: String(r.difficulty ?? "") || null,
        queued_at: now,
        updated_at: now,
      }));
      const res = await supabase
        .from("sos_difficulty_regrade_jobs")
        .upsert(chunk, { onConflict: "question_id", ignoreDuplicates: true })
        .select("id");
      if (res.error) return inserted;
      inserted += (res.data ?? []).length;
    }
    return inserted;
  } catch {
    // 큐 등록 실패가 문항 등록을 막아서는 안 된다.
    return 0;
  }
}
