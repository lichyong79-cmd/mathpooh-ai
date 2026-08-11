import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import {
  countSourceWorkflow,
  emptySourceWorkflowCounts,
  summarizeSourceWorkflow,
  type SourceWorkflowStatus,
} from "@/lib/source-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// v164: 상태 판정은 src/lib/source-workflow.ts 한 곳에서만 한다.
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
    const anonymousBankCountBySource = new Map<string, number>();
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

    const statuses: Record<string, SourceWorkflowStatus> = {};

    for (const source of sourcesResult.data ?? []) {
      const sourceId = String(source.id);
      const analysis = analysisBySource.get(sourceId);
      if (!analysis) {
        statuses[sourceId] = summarizeSourceWorkflow(emptySourceWorkflowCounts());
        continue;
      }

      const questions = questionsByAnalysis.get(String(analysis.id)) ?? [];
      const registeredIds = registeredIdsBySource.get(sourceId) ?? new Set<string>();
      const counts = countSourceWorkflow(
        questions.map((q) => ({ status: q.status, bankRegistered: registeredIds.has(String(q.id)) })),
        anonymousBankCountBySource.get(sourceId) ?? 0,
      );
      statuses[sourceId] = summarizeSourceWorkflow(counts);
    }

    return NextResponse.json({ success: true, statuses });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "상태 조회 실패" }, { status: 500 });
  }
}
