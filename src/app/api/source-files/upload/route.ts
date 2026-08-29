import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// 레거시 multipart 업로드 호환용 한도입니다.
 // 대용량(300문항급) 신규 등록은 브라우저에서 Supabase Storage로 직접 올린 뒤
 // 이 API에는 경로만 전달하므로 Vercel 요청 본문 제한을 우회합니다.
const MAX_FILE_SIZE = 250 * 1024 * 1024;

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isOriginal(file: File) {
  const lower = file.name.toLowerCase();
  return lower.endsWith(".hwp") || lower.endsWith(".hwpx") || lower.endsWith(".pdf");
}


type DirectUploadCommit = {
  mode?: "direct" | "prepare";
  hwpExtension?: string;
  title?: string;
  source?: string;
  grade?: string;
  subject?: string;
  contentRole?: string;
  folder?: string;
  hwpPath?: string;
  examPdfPath?: string;
  solutionPdfPath?: string;
  originalHwpName?: string;
  examPdfName?: string;
  solutionPdfName?: string;
};

function safeStoragePath(value: unknown) {
  const path = String(value ?? "").trim();
  if (!path || path.includes("..") || path.startsWith("/") || !/^[A-Za-z0-9_./-]+$/.test(path)) {
    throw new Error("Storage 경로가 올바르지 않습니다.");
  }
  return path;
}

async function commitDirectUpload(body: DirectUploadCommit) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ success: false, message: "Supabase 환경변수가 없습니다." }, { status: 500 });
  }

  const title = String(body.title ?? "").trim();
  const source = String(body.source ?? "").trim();
  const grade = String(body.grade ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const contentRole = String(body.contentRole ?? "TRAINING").trim();

  if (!title) {
    return NextResponse.json({ success: false, message: "시험지명을 입력해 주세요." }, { status: 400 });
  }

  const hwpPath = safeStoragePath(body.hwpPath);
  const examPdfPath = safeStoragePath(body.examPdfPath);
  const solutionPdfPath = safeStoragePath(body.solutionPdfPath);

  const commonHeaders = { apikey: key, Authorization: `Bearer ${key}` };

  // 실제로 세 파일이 Storage에 올라갔는지 먼저 확인합니다.
  const verify = async (path: string) => {
    const response = await fetch(`${url}/storage/v1/object/info/exam-pdf/${encodeURI(path)}`, {
      headers: commonHeaders,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`업로드 확인 실패: ${path}`);
    }
  };
  await Promise.all([verify(hwpPath), verify(examPdfPath), verify(solutionPdfPath)]);

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
      content_role: contentRole === "REFERENCE" ? "REFERENCE" : "TRAINING",
      storage_path: examPdfPath,
      hwp_path: hwpPath,
      exam_pdf_path: examPdfPath,
      solution_pdf_path: solutionPdfPath,
      original_hwp_name: String(body.originalHwpName ?? "source"),
      exam_pdf_name: String(body.examPdfName ?? "exam.pdf"),
      solution_pdf_name: String(body.solutionPdfName ?? "solution.pdf"),
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
    message: "대용량 직접 업로드 완료 · 원본, 시험지 PDF, 해설지 PDF가 등록되었습니다.",
    data: rows[0],
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  // JSON이면 파일 바이트가 아니라 Storage 경로만 받는 대용량 직접 업로드 commit 요청입니다.
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const body = (await request.json()) as DirectUploadCommit;
      if (body.mode === "prepare") {
        const ext = ["hwp", "hwpx", "pdf"].includes(String(body.hwpExtension)) ? String(body.hwpExtension) : "hwp";
        const folder = `${new Date().getFullYear()}/${crypto.randomUUID()}`;
        const supabase = createClient();
        const files = [
          { kind: "hwp", path: `${folder}/source.${ext}` },
          { kind: "exam", path: `${folder}/exam.pdf` },
          { kind: "solution", path: `${folder}/solution.pdf` },
        ];
        const uploads = await Promise.all(files.map(async (file) => {
          const signed = await supabase.storage.from("exam-pdf").createSignedUploadUrl(file.path);
          if (signed.error || !signed.data?.token) throw signed.error ?? new Error("일회용 업로드 권한을 만들지 못했습니다.");
          return { ...file, token: signed.data.token };
        }));
        return NextResponse.json({ success: true, folder, uploads });
      }
      return await commitDirectUpload(body);
    } catch (error) {
      return NextResponse.json(
        { success: false, message: error instanceof Error ? error.message : "대용량 시험지 등록 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }
  }

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
    const contentRole = String(formData.get("contentRole") ?? "TRAINING").trim();
    const hwpFile = formData.get("hwpFile");
    const examPdf = formData.get("examPdf");
    const solutionPdf = formData.get("solutionPdf");

    if (!title) {
      return NextResponse.json({ success: false, message: "시험지명을 입력해 주세요." }, { status: 400 });
    }
    if (!(hwpFile instanceof File) || !isOriginal(hwpFile)) {
      return NextResponse.json({ success: false, message: "원본(.hwp, .hwpx 또는 .pdf)을 선택해 주세요." }, { status: 400 });
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
          { success: false, message: `${file.name} 파일이 250MB를 초과합니다.` },
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

    const lowerOriginal = hwpFile.name.toLowerCase();
    const hwpExtension = lowerOriginal.endsWith(".pdf") ? "pdf" : lowerOriginal.endsWith(".hwpx") ? "hwpx" : "hwp";
    // Supabase Storage 경로에는 원본 한글 파일명을 넣지 않습니다.
    // 한글/공백/특수문자가 포함된 이름은 InvalidKey 오류를 일으킬 수 있으므로
    // Storage에는 영문 고정 이름으로 저장하고 원래 파일명은 DB에 별도로 보관합니다.
    const hwpPath = await upload(
      hwpFile,
      `source.${hwpExtension}`,
      hwpFile.type || (hwpExtension === "pdf" ? "application/pdf" : "application/octet-stream")
    );
    const examPdfPath = await upload(examPdf, "exam.pdf", "application/pdf");
    const solutionPdfPath = await upload(solutionPdf, "solution.pdf", "application/pdf");

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
        content_role: contentRole === "REFERENCE" ? "REFERENCE" : "TRAINING",
        // training_course는 DB 기본값(대표유형)을 사용합니다.
        // source_files.training_course가 NOT NULL이므로 null을 직접 보내면 등록이 실패합니다.
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
      const errorText = await dbResponse.text();
      if (dbResponse.status === 401 || dbResponse.status === 403 || errorText.includes("row-level security")) {
        throw new Error("DB 저장 권한이 아직 설정되지 않았습니다. supabase-v1.3-source-files-rls.sql을 Supabase SQL Editor에서 한 번 실행해 주세요.");
      }
      throw new Error(`DB 등록 실패: ${errorText}`);
    }

    const rows = await dbResponse.json();
    return NextResponse.json({
      success: true,
      message: "원본, 시험지 PDF, 해설지 PDF가 등록되었습니다.",
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
