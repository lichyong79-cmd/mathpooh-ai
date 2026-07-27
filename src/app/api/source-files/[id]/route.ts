import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ success: false, message: "Supabase 환경변수가 없습니다." }, { status: 500 });

    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const sourceResponse = await fetch(`${url}/rest/v1/source_files?id=eq.${encodeURIComponent(id)}&select=id,hwp_path,exam_pdf_path,solution_pdf_path`, { headers, cache: "no-store" });
    if (!sourceResponse.ok) throw new Error(await sourceResponse.text());
    const [source] = await sourceResponse.json() as Array<{ id: string; hwp_path?: string | null; exam_pdf_path?: string | null; solution_pdf_path?: string | null }>;
    if (!source) return NextResponse.json({ success: false, message: "삭제할 시험지 세트를 찾지 못했습니다." }, { status: 404 });

    const deleteResponse = await fetch(`${url}/rest/v1/source_files?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } });
    if (!deleteResponse.ok) throw new Error(await deleteResponse.text());

    const paths = [...new Set([source.hwp_path, source.exam_pdf_path, source.solution_pdf_path].filter((path): path is string => Boolean(path)))];
    await Promise.allSettled(paths.map((path) => fetch(`${url}/storage/v1/object/exam-pdf/${encodeURI(path)}`, { method: "DELETE", headers })));

    return NextResponse.json({ success: true, message: "시험지 세트를 삭제했습니다." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
