import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { sourceFileId } = (await request.json()) as { sourceFileId?: string };
    if (!sourceFileId) return NextResponse.json({ success: false, message: "시험지를 선택해 주세요." }, { status: 400 });

    const supabase = createClient();
    const { data: source, error: sourceError } = await supabase.from("source_files").select("id,title").eq("id", sourceFileId).single();
    if (sourceError || !source) return NextResponse.json({ success: false, message: "시험지를 찾을 수 없습니다." }, { status: 404 });

    let { data: analysis, error } = await supabase.from("source_analysis").select("*").eq("source_file_id", sourceFileId).maybeSingle();
    if (error) throw error;

    if (!analysis) {
      const created = await supabase.from("source_analysis").insert({ source_file_id: sourceFileId }).select("*").single();
      if (created.error) throw created.error;
      analysis = created.data;
    }

    const now = new Date().toISOString();
    const job = await supabase.from("analysis_jobs").insert({
      analysis_id: analysis.id,
      job_type: "FULL_ANALYSIS",
      status: "WAITING",
      progress: 0,
      logs: [{ at: now, message: "AI 분석 작업 생성" }],
    }).select("*").single();
    if (job.error) throw job.error;

    const updated = await supabase.from("source_analysis").update({
      status: "WAITING", progress: 0, current_step: "PDF 분석 대기", started_at: null, finished_at: null, updated_at: now,
    }).eq("id", analysis.id).select("*").single();
    if (updated.error) throw updated.error;

    return NextResponse.json({ success: true, analysis: updated.data, job: job.data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "분석 작업 생성에 실패했습니다." }, { status: 500 });
  }
}
