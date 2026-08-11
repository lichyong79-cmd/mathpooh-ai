import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { summarizeWorkflow, type WorkflowSummary } from "@/lib/problem-bank-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function fetchAll<T>(
  build: (from: number, to: number) => any,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const result = await build(from, from + pageSize - 1) as {
      data?: T[] | null;
      error?: unknown;
    };

    if (result?.error) throw result.error;

    const page = Array.isArray(result?.data) ? result.data : [];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}

export async function GET() {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const supabase = createClient();

    // Supabase 기본 1000행 제한 때문에 한 번에 전체 문항을 읽으면
    // 시험지별 상태가 잘려서 '신규/미분석'으로 오판될 수 있다.
    // 반드시 끝까지 페이지를 읽는다.
    const [sources, analyses, questions] = await Promise.all([
      fetchAll<any>((from, to) =>
        supabase.from("source_files").select("id").range(from, to)
      ),
      fetchAll<any>((from, to) =>
        supabase.from("source_analysis").select("id,source_file_id,created_at").order("created_at", { ascending: true }).range(from, to)
      ),
      fetchAll<any>((from, to) =>
        supabase.from("analysis_questions").select("id,analysis_id,status,review_result").order("created_at", { ascending: true }).range(from, to)
      ),
    ]);

    // 같은 시험지에 과거 분석이 여러 개 있어도 AI 작업장이 쓰는 최신 분석 1개만 기준.
    const latestAnalysisBySource = new Map<string, any>();
    for (const analysis of analyses) {
      latestAnalysisBySource.set(String(analysis.source_file_id), analysis);
    }

    const questionsByAnalysis = new Map<string, any[]>();
    for (const question of questions) {
      const analysisId = String(question.analysis_id ?? "");
      if (!analysisId) continue;
      const list = questionsByAnalysis.get(analysisId) ?? [];
      list.push(question);
      questionsByAnalysis.set(analysisId, list);
    }

    const statuses: Record<string, WorkflowSummary> = {};
    for (const source of sources) {
      const sourceId = String(source.id);
      const analysis = latestAnalysisBySource.get(sourceId);
      const rows = analysis ? (questionsByAnalysis.get(String(analysis.id)) ?? []) : [];
      statuses[sourceId] = summarizeWorkflow(rows);
    }

    return NextResponse.json(
      { success: true, statuses },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "상태 조회 실패" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
