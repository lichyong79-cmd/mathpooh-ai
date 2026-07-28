import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const supabase = createClient();
    const analysis = await supabase.from("source_analysis").select("*").eq("id", id).single();
    if (analysis.error) throw analysis.error;
    const jobs = await supabase.from("analysis_jobs").select("*").eq("analysis_id", id).order("created_at", { ascending: false });
    if (jobs.error) throw jobs.error;
    const questions = await supabase.from("analysis_questions").select("*").eq("analysis_id", id).order("question_no");
    if (questions.error) throw questions.error;
    return NextResponse.json({ success: true, analysis: analysis.data, jobs: jobs.data, questions: questions.data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "분석 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const allowed = ["status", "progress", "current_step", "total_questions", "objective_count", "subjective_count"];
    const patch = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    patch.updated_at = new Date().toISOString();
    const supabase = createClient();
    const result = await supabase.from("source_analysis").update(patch).eq("id", id).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ success: true, analysis: result.data });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "저장에 실패했습니다." }, { status: 500 });
  }
}
