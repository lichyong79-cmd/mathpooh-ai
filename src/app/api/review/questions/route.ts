import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createClient();
    const result = await supabase
      .from("analysis_questions")
      .select(`
        id,
        analysis_id,
        question_no,
        answer,
        status,
        confidence,
        ai_result,
        review_result,
        review_reason,
        question_image_path,
        created_at,
        source_analysis!inner(
          source_file_id,
          source_files!inner(id,title,source,grade,subject)
        )
      `)
      .eq("status", "REVIEW")
      .order("confidence", { ascending: true })
      .order("created_at", { ascending: true });

    if (result.error) throw result.error;
    return NextResponse.json({ success: true, questions: result.data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "검수대기 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
