import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireAdmin } from "@/lib/supabase/auth";
import { difficultyAiVerified } from "@/lib/problem-dna";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * SOS278 · 난이도 재판정 큐 관리
 *  GET  : 진행 현황
 *  POST : 큐에 넣기(enqueue) / 실패분 재시도(retry) / 남은 대기 비우기(clear)
 *
 * 우선순위: 미분류(10) → 3점·어3(20) → 나머지(30)
 * 경계가 가장 부정확한 구간부터 처리한다.
 */

function priorityFor(difficulty: string) {
  const d = String(difficulty ?? "").trim();
  if (!/^[1-8]$/.test(d)) return 10;          // 미분류: 값이 아예 없는 문항
  if (d === "2" || d === "3") return 20;      // 3점 / 어3: 경계가 가장 흐린 구간
  return 30;
}

export async function GET() {
  const denied = await requireAdmin();  // SOS280: 관리자 전용
  if (denied) return denied;
  try {
    const supabase = createClient();
    const statuses = ["QUEUED", "RUNNING", "DONE", "FAILED", "SKIPPED"] as const;
    const counts: Record<string, number> = {};
    for (const s of statuses) {
      const r = await supabase.from("sos_difficulty_regrade_jobs")
        .select("id", { count: "exact", head: true }).eq("status", s);
      counts[s] = r.count ?? 0;
    }
    // 최근 처리 결과 몇 건을 함께 보여준다.
    const recent = await supabase.from("sos_difficulty_regrade_jobs")
      .select("question_id,status,before_difficulty,after_difficulty,decision,review_required,confidence,last_error,finished_at")
      .in("status", ["DONE", "FAILED"])
      .order("finished_at", { ascending: false }).limit(12);
    const total = statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
    const finished = (counts.DONE ?? 0) + (counts.FAILED ?? 0) + (counts.SKIPPED ?? 0);
    return NextResponse.json({
      success: true, counts, total, finished,
      percent: total ? Math.round((finished / total) * 100) : 0,
      recent: recent.data ?? [],
    });
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : "진행 현황을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();  // SOS280: 관리자 전용
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({} as any));
    const action = String(body?.action ?? "enqueue");
    const supabase = createClient();

    if (action === "clear") {
      const r = await supabase.from("sos_difficulty_regrade_jobs").delete().eq("status", "QUEUED").select("id");
      if (r.error) throw r.error;
      return NextResponse.json({ success: true, cleared: (r.data ?? []).length });
    }

    if (action === "retry") {
      const r = await supabase.from("sos_difficulty_regrade_jobs")
        .update({ status: "QUEUED", attempt_count: 0, last_error: null, updated_at: new Date().toISOString() })
        .eq("status", "FAILED").select("id");
      if (r.error) throw r.error;
      return NextResponse.json({ success: true, requeued: (r.data ?? []).length });
    }

    // enqueue: AI 미검증 문항만 큐에 넣는다.
    const subject = String(body?.subject ?? "").trim();
    const rows: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      let q = supabase.from("problem_bank_questions")
        .select("id,difficulty,subject,problem_dna,question_image_path")
        .eq("status", "ACTIVE")
        .range(offset, offset + 999);
      if (subject) q = q.eq("subject", subject);
      const r = await q;
      if (r.error) throw r.error;
      const batch = r.data ?? [];
      rows.push(...batch);
      if (batch.length < 1000) break;
    }

    // SOS279: 이미 AI 판정을 거친 문항은 다시 태우지 않는다.
    // 검토필요로 남은 문항은 AI를 다시 돌린다고 풀리지 않는다 —
    // 관리자가 화면에서 확정해야 하는 것들이라, 재실행은 비용만 든다.
    // 강제로 다시 돌리고 싶을 때만 { force: true }로 요청한다.
    const force = body?.force === true;
    const targets = rows.filter(x =>
      Boolean(x.question_image_path) &&
      x.problem_dna?.difficulty?.admin_fixed !== true &&
      !difficultyAiVerified(x.problem_dna) &&
      (force || !String(x.problem_dna?.difficulty?.ai_regrade_version ?? "").trim())
    );

    let inserted = 0;
    const now = new Date().toISOString();
    for (let i = 0; i < targets.length; i += 500) {
      const chunk = targets.slice(i, i + 500).map(x => ({
        question_id: x.id,
        priority: priorityFor(x.difficulty),
        status: "QUEUED",
        attempt_count: 0,
        before_difficulty: String(x.difficulty ?? "") || null,
        queued_at: now,
        updated_at: now,
      }));
      // 이미 큐에 있는 문항은 건너뛴다(question_id unique).
      const r = await supabase.from("sos_difficulty_regrade_jobs")
        .upsert(chunk, { onConflict: "question_id", ignoreDuplicates: true })
        .select("id");
      if (r.error) throw r.error;
      inserted += (r.data ?? []).length;
    }

    return NextResponse.json({ success: true, candidates: targets.length, inserted });
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : "큐 처리 중 오류" }, { status: 500 });
  }
}
