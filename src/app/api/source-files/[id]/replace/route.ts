import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type ReplaceKind = "hwp" | "exam" | "solution";

function isAllowed(kind: ReplaceKind, file: File) {
  const lower = file.name.toLowerCase();
  if (kind === "hwp") return lower.endsWith(".hwp") || lower.endsWith(".hwpx") || lower.endsWith(".pdf");
  return file.type === "application/pdf" || lower.endsWith(".pdf");
}

function extFor(kind: ReplaceKind, file: File) {
  if (kind !== "hwp") return "pdf";
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".hwpx")) return "hwpx";
  if (lower.endsWith(".pdf")) return "pdf";
  return "hwp";
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
    const kind = String(formData.get("kind") ?? "") as ReplaceKind;
    const file = formData.get("file");
    if (!(["hwp", "exam", "solution"] as string[]).includes(kind)) {
      return NextResponse.json({ success: false, message: "교체 종류가 올바르지 않습니다." }, { status: 400 });
    }
    if (!(file instanceof File) || !isAllowed(kind, file)) {
      return NextResponse.json({ success: false, message: kind === "hwp" ? "원본은 HWP/HWPX/PDF만 가능합니다." : "PDF 파일만 가능합니다." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: "파일 크기는 50MB 이하여야 합니다." }, { status: 400 });
    }

    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const sourceResponse = await fetch(`${url}/rest/v1/source_files?id=eq.${encodeURIComponent(id)}&select=id,hwp_path,exam_pdf_path,solution_pdf_path`, {
      headers,
      cache: "no-store",
    });
    if (!sourceResponse.ok) throw new Error(await sourceResponse.text());
    const sourceRows = await sourceResponse.json() as Array<{ id: string; hwp_path: string | null; exam_pdf_path: string | null; solution_pdf_path: string | null }>;
    const source = sourceRows[0];
    if (!source) return NextResponse.json({ success: false, message: "시험지 세트를 찾지 못했습니다." }, { status: 404 });

    const extension = extFor(kind, file);
    const storageName = kind === "hwp" ? `source.${extension}` : kind === "exam" ? "exam.pdf" : "solution.pdf";
    const path = `replacements/${id}/${Date.now()}-${storageName}`;
    const uploadResponse = await fetch(`${url}/storage/v1/object/exam-pdf/${encodeURI(path)}`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: Buffer.from(await file.arrayBuffer()),
    });
    if (!uploadResponse.ok) throw new Error(`새 파일 저장 실패: ${await uploadResponse.text()}`);

    const patch: Record<string, string> = {};
    let oldPath: string | null = null;
    if (kind === "hwp") {
      patch.hwp_path = path;
      patch.original_hwp_name = file.name;
      oldPath = source.hwp_path;
    } else if (kind === "exam") {
      patch.exam_pdf_path = path;
      patch.storage_path = path;
      patch.exam_pdf_name = file.name;
      oldPath = source.exam_pdf_path;
    } else {
      patch.solution_pdf_path = path;
      patch.solution_pdf_name = file.name;
      oldPath = source.solution_pdf_path;
    }

    const updateResponse = await fetch(`${url}/rest/v1/source_files?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!updateResponse.ok) {
      await fetch(`${url}/storage/v1/object/exam-pdf/${encodeURI(path)}`, { method: "DELETE", headers }).catch(() => undefined);
      throw new Error(`DB 갱신 실패: ${await updateResponse.text()}`);
    }

    if (oldPath && oldPath !== path) {
      await fetch(`${url}/storage/v1/object/exam-pdf/${encodeURI(oldPath)}`, { method: "DELETE", headers }).catch(() => undefined);
    }

    const label = kind === "hwp" ? "원본 파일" : kind === "exam" ? "문제 PDF" : "해설 PDF";
    return NextResponse.json({ success: true, message: `${label}을 교체했습니다. 기존 시험지·문항 연결은 유지됩니다.` });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "파일 교체 중 오류가 발생했습니다." }, { status: 500 });
  }
}
