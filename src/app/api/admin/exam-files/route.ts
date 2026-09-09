import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const allowedKinds = new Set(["test", "solution", "original"]);

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const path = new URL(request.url).searchParams.get("path")?.trim() ?? "";
  if (!path || path.includes(".."))
    return NextResponse.json({ message: "파일 경로가 올바르지 않습니다." }, { status: 400 });

  const signed = await createClient().storage
    .from("exam-files")
    .createSignedUrl(path, 60 * 15);
  if (signed.error || !signed.data?.signedUrl)
    return NextResponse.json(
      { message: "저장된 파일을 찾을 수 없습니다. 파일 변경에서 다시 선택해 주세요." },
      { status: 404 },
    );
  return NextResponse.json({ url: signed.data.signedUrl });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const form = await request.formData();
  const file = form.get("file");
  const examId = String(form.get("examId") ?? "").trim();
  const kind = String(form.get("kind") ?? "").trim();

  if (!(file instanceof File) || !file.size || !examId || !allowedKinds.has(kind))
    return NextResponse.json(
      { message: "시험 파일, 시험 ID 또는 파일 종류가 올바르지 않습니다." },
      { status: 400 },
    );
  if (file.size > 100 * 1024 * 1024)
    return NextResponse.json(
      { message: "시험 파일은 100MB 이하만 등록할 수 있습니다." },
      { status: 413 },
    );

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${examId}/${kind}-${Date.now()}-${safeName}`;
  const supabase = createClient();
  const uploaded = await supabase.storage
    .from("exam-files")
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploaded.error)
    return NextResponse.json(
      { message: `파일 업로드 실패: ${uploaded.error.message}` },
      { status: 400 },
    );
  return NextResponse.json({ success: true, path });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const paths = Array.isArray(body.paths)
    ? body.paths.map(String).filter((path: string) => path && !path.includes(".."))
    : [];
  if (!paths.length) return NextResponse.json({ success: true });
  const removed = await createClient().storage.from("exam-files").remove(paths);
  return removed.error
    ? NextResponse.json({ message: removed.error.message }, { status: 400 })
    : NextResponse.json({ success: true });
}
