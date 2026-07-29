import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SourceFileRow = {
  id: string;
  hwp_path?: string | null;
  exam_pdf_path?: string | null;
  solution_pdf_path?: string | null;
};

type AnalysisRow = { id: string };
type ImagePathRow = { question_image_path?: string | null };

type DeleteStep = {
  name: string;
  count?: number;
};

function uniquePaths(paths: Array<string | null | undefined>) {
  return [...new Set(paths.filter((path): path is string => Boolean(path?.trim())))];
}

async function restJson<T>(url: string, headers: Record<string, string>, path: string): Promise<T> {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function restDelete(url: string, headers: Record<string, string>, path: string) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: "DELETE",
    headers: { ...headers, Prefer: "return=representation" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<unknown[]>;
}

async function deleteStorageObjects(
  url: string,
  headers: Record<string, string>,
  bucket: string,
  paths: string[],
) {
  const results = await Promise.allSettled(
    uniquePaths(paths).map(async (path) => {
      const response = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
        method: "DELETE",
        headers,
        cache: "no-store",
      });
      // 이미 없는 파일은 완전 삭제 목표에 부합하므로 실패로 처리하지 않는다.
      if (!response.ok && response.status !== 404) throw new Error(await response.text());
    }),
  );

  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    const reason = failed[0];
    throw new Error(reason.status === "rejected" && reason.reason instanceof Error
      ? reason.reason.message
      : "Storage 파일 삭제에 실패했습니다.");
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json({ success: false, message: "Supabase 환경변수가 없습니다." }, { status: 500 });
    }

    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const encodedId = encodeURIComponent(id);
    const sourceRows = await restJson<SourceFileRow[]>(
      url,
      headers,
      `source_files?id=eq.${encodedId}&select=id,hwp_path,exam_pdf_path,solution_pdf_path`,
    );
    const source = sourceRows[0];
    if (!source) {
      return NextResponse.json({ success: false, message: "삭제할 시험지 세트를 찾지 못했습니다." }, { status: 404 });
    }

    const steps: DeleteStep[] = [];
    const analyses = await restJson<AnalysisRow[]>(
      url,
      headers,
      `source_analysis?source_file_id=eq.${encodedId}&select=id`,
    );
    const analysisIds = analyses.map((row) => row.id);

    const analysisImageRows: ImagePathRow[] = [];
    for (const analysisId of analysisIds) {
      const rows = await restJson<ImagePathRow[]>(
        url,
        headers,
        `analysis_questions?analysis_id=eq.${encodeURIComponent(analysisId)}&select=question_image_path`,
      );
      analysisImageRows.push(...rows);
    }

    const bankImageRows = await restJson<ImagePathRow[]>(
      url,
      headers,
      `problem_bank_questions?source_file_id=eq.${encodedId}&select=question_image_path`,
    );

    // FK/캐스케이드 설정이 과거 DB에 빠져 있어도 잔존 데이터가 없도록 자식부터 명시적으로 삭제한다.
    const deletedBank = await restDelete(url, headers, `problem_bank_questions?source_file_id=eq.${encodedId}`);
    steps.push({ name: "problem_bank_questions", count: deletedBank.length });

    for (const analysisId of analysisIds) {
      const encodedAnalysisId = encodeURIComponent(analysisId);
      const deletedQuestions = await restDelete(url, headers, `analysis_questions?analysis_id=eq.${encodedAnalysisId}`);
      const deletedJobs = await restDelete(url, headers, `analysis_jobs?analysis_id=eq.${encodedAnalysisId}`);
      steps.push({ name: `analysis_questions:${analysisId}`, count: deletedQuestions.length });
      steps.push({ name: `analysis_jobs:${analysisId}`, count: deletedJobs.length });
    }

    const deletedAnalyses = await restDelete(url, headers, `source_analysis?source_file_id=eq.${encodedId}`);
    steps.push({ name: "source_analysis", count: deletedAnalyses.length });

    const deletedSources = await restDelete(url, headers, `source_files?id=eq.${encodedId}`);
    steps.push({ name: "source_files", count: deletedSources.length });

    await deleteStorageObjects(
      url,
      headers,
      "question-images",
      [...analysisImageRows, ...bankImageRows].map((row) => row.question_image_path ?? null).filter((path): path is string => Boolean(path)),
    );
    steps.push({ name: "question-images", count: uniquePaths([...analysisImageRows, ...bankImageRows].map((row) => row.question_image_path)).length });

    await deleteStorageObjects(
      url,
      headers,
      "exam-pdf",
      uniquePaths([source.hwp_path, source.exam_pdf_path, source.solution_pdf_path]),
    );
    steps.push({ name: "exam-pdf", count: uniquePaths([source.hwp_path, source.exam_pdf_path, source.solution_pdf_path]).length });

    return NextResponse.json(
      {
        success: true,
        message: "시험지와 관련 분석·크롭·문제은행·저장 파일을 모두 삭제했습니다.",
        deleted: steps,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "완전 삭제 중 오류가 발생했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
