import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const supabase = createClient();
    const analysis = await supabase.from("source_analysis").select("id").eq("source_file_id", id).maybeSingle();
    if (analysis.error) throw analysis.error;
    if (!analysis.data?.id) return NextResponse.json({ success: true, state: "UNANALYZED", label: "미분석", total: 0, registered: 0, pending: 0, review: 0, failed: 0, other: 0 });

    const [questionsResult, bankResult] = await Promise.all([
      supabase.from("analysis_questions").select("id,status").eq("analysis_id", analysis.data.id),
      supabase.from("problem_bank_questions").select("analysis_question_id").eq("source_file_id", id),
    ]);
    if (questionsResult.error) throw questionsResult.error;
    if (bankResult.error) throw bankResult.error;
    const registeredIds = new Set((bankResult.data ?? []).map((row) => String(row.analysis_question_id ?? "")).filter(Boolean));
    const anonymousRegistered = (bankResult.data ?? []).filter((row) => !row.analysis_question_id).length;
    let registered = anonymousRegistered, pending = 0, review = 0, failed = 0, other = 0;
    for (const q of questionsResult.data ?? []) {
      if (registeredIds.has(String(q.id))) { registered += 1; continue; }
      const status = String(q.status ?? "").toUpperCase();
      if (status === "APPROVED" || status === "AUTO_REGISTERED") pending += 1;
      else if (status === "REVIEW") review += 1;
      else if (status === "FAILED" || status === "REJECTED") failed += 1;
      else other += 1;
    }
    const total = (questionsResult.data ?? []).length || registered;
    let state = "ANALYZING", label = `분석중 ${registered + pending + review + failed}/${total}`;
    if (total === 0) { state = "UNANALYZED"; label = "미분석"; }
    else if (registered >= total && pending === 0 && review === 0 && failed === 0 && other === 0) { state = "REGISTERED"; label = `문제은행 등록완료 ${registered}/${total}`; }
    else if (review > 0) { state = "REVIEW"; label = `3단계 분석 · 등록 ${registered} · 대기 ${pending} · 보류 ${review}`; }
    else if (pending > 0) { state = "PENDING"; label = `3단계 분석 · 등록 ${registered} · 대기 ${pending}`; }
    else if (failed > 0 && registered === 0 && other === 0) { state = "FAILED"; label = `분석 실패 ${failed}`; }
    return NextResponse.json({ success: true, state, label, total, registered, pending, review, failed, other });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "상태 조회 실패" }, { status: 500 });
  }
}
