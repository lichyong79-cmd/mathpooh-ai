import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function fileExtension(file: File) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".webp")) return "webp";
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".jpeg")) return "jpeg";
  return "jpg";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ success: false, message: "Supabase 환경변수가 없습니다." }, { status: 500 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ success: false, message: "교체할 파일을 선택해 주세요." }, { status: 400 });
    const lower = file.name.toLowerCase();
    const allowed = file.type.startsWith("image/") || lower.endsWith(".pdf");
    if (!allowed) return NextResponse.json({ success: false, message: "PNG/JPG/WEBP/PDF만 사용할 수 있습니다." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ success: false, message: "파일 크기는 20MB 이하여야 합니다." }, { status: 400 });

    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const questionResponse = await fetch(`${url}/rest/v1/problem_bank_questions?id=eq.${encodeURIComponent(id)}&select=id,question_image_path,question_no`, { headers, cache: "no-store" });
    if (!questionResponse.ok) throw new Error(await questionResponse.text());
    const rows = await questionResponse.json() as Array<{ id: string; question_image_path: string | null; question_no: number }>;
    const question = rows[0];
    if (!question) return NextResponse.json({ success: false, message: "문항을 찾지 못했습니다." }, { status: 404 });

    const extension = fileExtension(file);
    const path = `problem-replacements/${id}/${Date.now()}.${extension}`;
    const uploadResponse = await fetch(`${url}/storage/v1/object/exam-pdf/${encodeURI(path)}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" },
      body: Buffer.from(await file.arrayBuffer()),
    });
    if (!uploadResponse.ok) throw new Error(`문항 파일 저장 실패: ${await uploadResponse.text()}`);

    const updateResponse = await fetch(`${url}/rest/v1/problem_bank_questions?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ question_image_path: path, updated_at: new Date().toISOString() }),
    });
    if (!updateResponse.ok) {
      await fetch(`${url}/storage/v1/object/exam-pdf/${encodeURI(path)}`, { method: "DELETE", headers }).catch(() => undefined);
      throw new Error(`문항 DB 갱신 실패: ${await updateResponse.text()}`);
    }

    if (question.question_image_path && question.question_image_path !== path) {
      await fetch(`${url}/storage/v1/object/exam-pdf/${encodeURI(question.question_image_path)}`, { method: "DELETE", headers }).catch(() => undefined);
    }

    return NextResponse.json({ success: true, message: `${question.question_no}번 문제 이미지를 교체했습니다. 문항 ID는 유지됩니다.` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "문항 교체 중 오류가 발생했습니다." }, { status: 500 });
  }
}
