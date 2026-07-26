import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function safeFileName(name: string) {
  return name
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}._-]/gu, "_")
    .replace(/_+/g, "_");
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isHwp(file: File) {
  const lower = file.name.toLowerCase();
  return lower.endsWith(".hwp") || lower.endsWith(".hwpx");
}

export async function POST(request: NextRequest) {
  const uploadedPaths: string[] = [];

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      return NextResponse.json(
        { success: false, message: "Supabase 환경변수가 없습니다." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const title = String(formData.get("title") ?? "").trim();
    const source = String(formData.get("source") ?? "").trim();
    const grade = String(formData.get("grade") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const hwpFile = formData.get("hwpFile");
    const examPdf = formData.get("examPdf");
    const solutionPdf = formData.get("solutionPdf");

    if (!title) {
      return NextResponse.json({ success: false, message: "시험지명을 입력해 주세요." }, { status: 400 });
    }
    if (!(hwpFile instanceof File) || !isHwp(hwpFile)) {
      return NextResponse.json({ success: false, message: "한글 원본(.hwp 또는 .hwpx)을 선택해 주세요." }, { status: 400 });
    }
    if (!(examPdf instanceof File) || !isPdf(examPdf)) {
      return NextResponse.json({ success: false, message: "시험지 PDF를 선택해 주세요." }, { status: 400 });
    }
    if (!(solutionPdf instanceof File) || !isPdf(solutionPdf)) {
      return NextResponse.json({ success: false, message: "해설지 PDF를 선택해 주세요." }, { status: 400 });
    }

    for (const file of [hwpFile, examPdf, solutionPdf]) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, message: `${file.name} 파일이 50MB를 초과합니다.` },
          { status: 400 }
        );
      }
    }

    const commonHeaders = { apikey: key, Authorization: `Bearer ${key}` };
    const folder = `${new Date().getFullYear()}/${crypto.randomUUID()}`;

    const upload = async (file: File, fileName: string, contentType: string) => {
      const path = `${folder}/${fileName}`;
      const response = await fetch(`${url}/storage/v1/object/exam-pdf/${encodeURI(path)}`, {
        method: "POST",
        headers: {
          ...commonHeaders,
          "Content-Type": contentType,
          "x-upsert": "false",
        },
        body: Buffer.from(await file.arrayBuffer()),
      });

      if (!response.ok) {
        throw new Error(`${file.name} 저장 실패: ${await response.text()}`);
      }

      uploadedPaths.push(path);
      return path;
    };

    const hwpExtension = hwpFile.name.toLowerCase().endsWith(".hwpx") ? "hwpx" : "hwp";
    const hwpPath = await upload(
      hwpFile,
      `source-${safeFileName(hwpFile.name)}`,
      hwpFile.type || "application/octet-stream"
    );
    const examPdfPath = await upload(examPdf, `exam-${safeFileName(examPdf.name)}`, "application/pdf");
    const solutionPdfPath = await upload(
      solutionPdf,
      `solution-${safeFileName(solutionPdf.name)}`,
      "application/pdf"
    );

    const dbResponse = await fetch(`${url}/rest/v1/source_files`, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        title,
        source: source || null,
        grade: grade || null,
        subject: subject || null,
        storage_path: examPdfPath,
        hwp_path: hwpPath,
        exam_pdf_path: examPdfPath,
        solution_pdf_path: solutionPdfPath,
        original_hwp_name: hwpFile.name,
        exam_pdf_name: examPdf.name,
        solution_pdf_name: solutionPdf.name,
        page_count: 0,
        status: "uploaded",
        error_message: null,
      }),
    });

    if (!dbResponse.ok) {
      throw new Error(`DB 등록 실패: ${await dbResponse.text()}`);
    }

    const rows = await dbResponse.json();
    return NextResponse.json({
      success: true,
      message: "한글 원본, 시험지 PDF, 해설지 PDF가 등록되었습니다.",
      data: rows[0],
    });
  } catch (error) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (url && key && uploadedPaths.length > 0) {
      const commonHeaders = { apikey: key, Authorization: `Bearer ${key}` };
      await Promise.allSettled(
        uploadedPaths.map((path) =>
          fetch(`${url}/storage/v1/object/exam-pdf/${encodeURI(path)}`, {
            method: "DELETE",
            headers: commonHeaders,
          })
        )
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "시험지 등록 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
