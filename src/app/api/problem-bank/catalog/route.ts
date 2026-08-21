import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireAdmin } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 다른 MATHPOOH 프로그램에서도 같은 문항·Problem DNA 계약을 사용할 수 있는 내부 카탈로그 API.
export async function GET(request: NextRequest) {
  const denied = await requireAdmin();  // SOS280: 관리자 전용
  if (denied) return denied;
  try {
    const supabase = createClient();
    const params = request.nextUrl.searchParams;
    const status = params.get("status") || "ACTIVE";
    const limit = Math.max(1, Math.min(500, Number(params.get("limit") || 100)));
    let query = supabase.from("problem_bank_questions").select("id,problem_code,question_no,title,grade,subject,unit,topic,difficulty,question_type,answer,summary,source_name,confidence,status,content_role,training_course,question_image_path,problem_dna,analysis_version,dna_tags,created_at,updated_at").order("created_at", { ascending: false }).limit(limit);
    if (status !== "ALL") query = query.eq("status", status);
    const contentRole = params.get("contentRole");
    if (contentRole) query = query.eq("content_role", contentRole);
    for (const key of ["grade", "subject", "unit", "difficulty"] as const) {
      const value = params.get(key);
      if (value) query = query.eq(key, value);
    }
    const result = await query;
    if (result.error) throw result.error;
    return NextResponse.json({ success: true, contract_version: "mathpooh-problem-bank-v1", problem_dna_version: "problem-dna-v3.4", items: result.data ?? [] });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "문제은행 카탈로그를 불러오지 못했습니다." }, { status: 500 });
  }
}
