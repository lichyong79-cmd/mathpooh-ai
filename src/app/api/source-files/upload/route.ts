import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}._-]/gu, "_")
    .replace(/_+/g, "_");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const fileValue = formData.get("file");
    const title = String(formData.get("title") ?? "").trim();
    const source = String(formData.get("source") ?? "").trim();

    if (!(fileValue instanceof File)) {
      return NextResponse.json({ success: false, message: "PDF 파일을 선택해 주세요." }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ success: false, message: "시험지 제목을 입력해 주세요." }, { status: 400 });
    }

    const isPdf = fileValue.type === "application/pdf" || fileValue.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json({ success: false, message: "PDF 파일만 등록할 수 있습니다." }, { status: 400 });
    }

    const maxFileSize = 50 * 1024 * 1024;
    if (fileValue.size > maxFileSize) {
      return NextResponse.json({ success: false, message: "파일 크기는 50MB 이하여야 합니다." }, { status: 400 });
    }

    const supabase = await createClient();
    const safeFileName = sanitizeFileName(fileValue.name);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const storagePath = `${year}/${month}/${crypto.randomUUID()}-${safeFileName}`;
    const fileBuffer = await fileValue.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("exam-pdf")
      .upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ success: false, message: `PDF 저장 실패: ${uploadError.message}` }, { status: 500 });
    }

    const { data: sourceFile, error: insertError } = await supabase
      .from("source_files")
      .insert({
        title,
        source: source || null,
        storage_path: storagePath,
        page_count: 0,
        status: "uploaded",
        error_message: null,
      })
      .select("id, created_at, title, source, storage_path, page_count, status, error_message")
      .single();

    if (insertError) {
      await supabase.storage.from("exam-pdf").remove([storagePath]);
      return NextResponse.json({ success: false, message: `DB 등록 실패: ${insertError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "PDF가 등록되었습니다.", data: sourceFile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF 등록 중 알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
