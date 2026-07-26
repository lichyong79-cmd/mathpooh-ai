import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function safeFileName(name: string) {
  return name.normalize("NFC").replace(/[^\p{L}\p{N}._-]/gu, "_").replace(/_+/g, "_");
}

export async function POST(request: NextRequest) {
  let uploadedPath = "";
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ success: false, message: "Supabase 환경변수가 없습니다." }, { status: 500 });

    const formData = await request.formData();
    const file = formData.get("file");
    const title = String(formData.get("title") ?? "").trim();
    const source = String(formData.get("source") ?? "").trim();

    if (!(file instanceof File)) return NextResponse.json({ success: false, message: "PDF 파일을 선택해 주세요." }, { status: 400 });
    if (!title) return NextResponse.json({ success: false, message: "시험지명을 입력해 주세요." }, { status: 400 });
    if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) return NextResponse.json({ success: false, message: "PDF 파일만 등록할 수 있습니다." }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ success: false, message: "파일 크기는 50MB 이하여야 합니다." }, { status: 400 });

    const now = new Date();
    uploadedPath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const commonHeaders = { apikey: key, Authorization: `Bearer ${key}` };

    const storageResponse = await fetch(`${url}/storage/v1/object/exam-pdf/${encodeURI(uploadedPath)}`, {
      method: "POST",
      headers: { ...commonHeaders, "Content-Type": "application/pdf", "x-upsert": "false" },
      body: Buffer.from(await file.arrayBuffer()),
    });
    if (!storageResponse.ok) throw new Error(`PDF 저장 실패: ${await storageResponse.text()}`);

    const dbResponse = await fetch(`${url}/rest/v1/source_files`, {
      method: "POST",
      headers: { ...commonHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ title, source: source || null, storage_path: uploadedPath, page_count: 0, status: "uploaded", error_message: null }),
    });
    if (!dbResponse.ok) {
      await fetch(`${url}/storage/v1/object/exam-pdf/${encodeURI(uploadedPath)}`, { method: "DELETE", headers: commonHeaders });
      throw new Error(`DB 등록 실패: ${await dbResponse.text()}`);
    }

    const rows = await dbResponse.json();
    return NextResponse.json({ success: true, message: "PDF가 등록되었습니다.", data: rows[0] });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "PDF 등록 중 오류가 발생했습니다." }, { status: 500 });
  }
}
