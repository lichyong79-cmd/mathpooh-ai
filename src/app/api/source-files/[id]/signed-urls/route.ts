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
    const source = await supabase.from("source_files").select("exam_pdf_path,solution_pdf_path").eq("id", id).single();
    if (source.error) throw source.error;
    const sign = async (path: string | null) => {
      if (!path) return null;
      const result = await supabase.storage.from("exam-pdf").createSignedUrl(path, 60 * 60);
      if (result.error) throw result.error;
      return result.data.signedUrl;
    };
    return NextResponse.json({ success: true, examUrl: await sign(source.data.exam_pdf_path), solutionUrl: await sign(source.data.solution_pdf_path) });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "PDF 주소를 만들지 못했습니다." }, { status: 500 });
  }
}
