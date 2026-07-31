import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const supabase = createClient();
    const bank = await supabase.from("problem_bank_questions").select("analysis_question_id").eq("id", id).single();
    if (bank.error || !bank.data) throw bank.error ?? new Error("문항을 찾을 수 없습니다.");
    const analysis = await supabase.from("analysis_questions").select("ai_result").eq("id", bank.data.analysis_question_id).single();
    const path = String(analysis.data?.ai_result?.official_solution_image_path ?? "").trim();
    if (analysis.error || !path) return NextResponse.json({ success: false, message: "문항별 공식 해설 이미지가 없습니다." }, { status: 404 });
    const signed = await supabase.storage.from("question-images").createSignedUrl(path, 60 * 30);
    if (signed.error) throw signed.error;
    return NextResponse.json({ success: true, imageUrl: signed.data.signedUrl });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "공식 해설 이미지를 불러오지 못했습니다." }, { status: 500 });
  }
}
