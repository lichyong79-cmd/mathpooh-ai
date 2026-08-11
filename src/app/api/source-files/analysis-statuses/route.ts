import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CanonicalState = "UNANALYZED" | "ANALYZING" | "PENDING" | "REVIEW" | "REGISTERED" | "FAILED";

type StatusRow = {
  state: CanonicalState;
  label: string;
  total: number;
  registered: number;
  pending: number;
  review: number;
  failed: number;
  other: number;
};

function emptyStatus(): StatusRow {
  return { state: "UNANALYZED", label: "미분석", total: 0, registered: 0, pending: 0, review: 0, failed: 0, other: 0 };
}

export async function GET() {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const supabase = createClient();
    const [sourcesResult, analysesResult, questionsResult, bankResult] = await Promise.all([
      supabase.from("source_files").select("id"),
      supabase.from("source_analysis").select("id,source_file_id,status,current_step"),
      supabase.from("analysis_questions").select("id,analysis_id,status"),
      supabase.from("problem_bank_questions").select("source_file_id,analysis_question_id"),
    ]);

    if (sourcesResult.error) throw sourcesResult.error;
    if (analysesResult.error) throw analysesResult.error;
    if (questionsResult.error) throw questionsResult.error;
    if (bankResult.error) throw bankResult.error;

    const analysisBySource = new Map<string, any>();
    for (const row of analysesResult.data ?? []) analysisBySource.set(String(row.source_file_id), row);

    const questionsByAnalysis = new Map<string, any[]>();
    for (const row of questionsResult.data ?? []) {
      const key = String(row.analysis_id);
      const list = questionsByAnalysis.get(key) ?? [];
      list.push(row);
      questionsByAnalysis.set(key, list);
    }

    const registeredIdsBySource = new Map<string, Set<string>>();
    let anonymousBankCountBySource = new Map<string, number>();
    for (const row of bankResult.data ?? []) {
      const sourceId = String(row.source_file_id ?? "");
      if (!sourceId) continue;
      const analysisQuestionId = String(row.analysis_question_id ?? "").trim();
      if (analysisQuestionId) {
        const set = registeredIdsBySource.get(sourceId) ?? new Set<string>();
        set.add(analysisQuestionId);
        registeredIdsBySource.set(sourceId, set);
      } else {
        anonymousBankCountBySource.set(sourceId, (anonymousBankCountBySource.get(sourceId) ?? 0) + 1);
      }
    }

    const statuses: Record<string, StatusRow> = {};

    for (const source of sourcesResult.data ?? []) {
      const sourceId = String(source.id);
      const analysis = analysisBySource.get(sourceId);
      if (!analysis) { statuses[sourceId] = emptyStatus(); continue; }

      const questions = questionsByAnalysis.get(String(analysis.id)) ?? [];
      const registeredIds = registeredIdsBySource.get(sourceId) ?? new Set<string>();
      let registered = 0, pending = 0, review = 0, failed = 0, other = 0;

      for (const q of questions) {
        if (registeredIds.has(String(q.id))) { registered += 1; continue; }
        const status = String(q.status ?? "").toUpperCase();
        if (status === "APPROVED" || status === "AUTO_REGISTERED") pending += 1;
        else if (status === "REVIEW") review += 1;
        else if (status === "FAILED" || status === "REJECTED") failed += 1;
        else other += 1;
      }

      // 과거 데이터 중 analysis_question_id가 없는 문제은행 행도 실제 등록 수에는 포함한다.
      registered += anonymousBankCountBySource.get(sourceId) ?? 0;
      const total = questions.length || registered;
      let state: CanonicalState = "ANALYZING";
      let label = "분석중";

      if (total === 0) { state = "UNANALYZED"; label = "미분석"; }
      else if (registered >= total && pending === 0 && review === 0 && failed === 0 && other === 0) {
        state = "REGISTERED"; label = `문제은행 등록완료 ${registered}/${total}`;
      } else if (review > 0) {
        state = "REVIEW"; label = `3단계 분석 · 등록 ${registered} · 대기 ${pending} · 보류 ${review}`;
      } else if (pending > 0) {
        state = "PENDING"; label = `3단계 분석 · 등록 ${registered} · 대기 ${pending}`;
      } else if (failed > 0 && registered === 0 && other === 0) {
        state = "FAILED"; label = `분석 실패 ${failed}`;
      } else {
        state = "ANALYZING"; label = `분석중 ${registered + pending + review + failed}/${total}`;
      }

      statuses[sourceId] = { state, label, total, registered, pending, review, failed, other };
    }

    return NextResponse.json({ success: true, statuses });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "상태 조회 실패" }, { status: 500 });
  }
}
