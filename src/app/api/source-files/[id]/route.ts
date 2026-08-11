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



type SourceMetadataPatch = {
  title?: unknown;
  source?: unknown;
  subject?: unknown;
};

type BankMetadataRow = {
  id: string;
  question_no: number;
  problem_dna?: Record<string, any> | null;
};

type AnalysisMetadataRow = {
  id: string;
  ai_result?: Record<string, any> | null;
  review_result?: Record<string, any> | null;
};

function cleanMetadataText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function withSourceMetadata(
  result: Record<string, any> | null | undefined,
  metadata: { title: string; source: string; subject: string },
) {
  if (!result || typeof result !== "object") return result ?? null;

  const next: Record<string, any> = {
    ...result,
    source_title: metadata.title,
    source_name: metadata.source || null,
    subject: metadata.subject || null,
  };

  const dna = next.problem_dna;
  if (dna && typeof dna === "object") {
    next.problem_dna = {
      ...dna,
      basic: {
        ...(dna.basic && typeof dna.basic === "object" ? dna.basic : {}),
        source_title: metadata.title,
        source_name: metadata.source || null,
        subject: metadata.subject || null,
      },
    };
  }

  return next;
}

async function restPatch(url: string, headers: Record<string, string>, path: string, body: unknown) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<unknown[]>;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = await request.json() as SourceMetadataPatch;
    const title = cleanMetadataText(body.title);
    const source = cleanMetadataText(body.source);
    const subject = cleanMetadataText(body.subject);
    if (!title) return NextResponse.json({ success: false, message: "시험지명을 입력해 주세요." }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    // 연결 문항 전체 동기화는 관리자 작업이므로 service role을 우선 사용한다.
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json({ success: false, message: "Supabase 환경변수가 없습니다." }, { status: 500 });
    }
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const encodedId = encodeURIComponent(id);

    // 1) 시험지 원본 정보 수정
    const sourceRows = await restPatch(url, headers, `source_files?id=eq.${encodedId}`, {
      title,
      source: source || null,
      subject: subject || null,
    });
    if (!sourceRows.length) {
      return NextResponse.json({ success: false, message: "수정할 시험지를 찾지 못했습니다." }, { status: 404 });
    }

    // 2) 화면 집계/검색에 직접 쓰이는 공통 메타데이터는 한 번의 UPDATE로 전 문항 즉시 동기화한다.
    //    이렇게 해야 시험지 수정 직후 과목별 보유문항/필터에도 그대로 반영된다.
    const bankBulkResponse = await fetch(
      `${url}/rest/v1/problem_bank_questions?source_file_id=eq.${encodedId}`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          subject: subject || null,
          source_name: source || null,
          updated_at: new Date().toISOString(),
        }),
        cache: "no-store",
      },
    );
    if (!bankBulkResponse.ok) throw new Error(await bankBulkResponse.text());
    const bulkUpdatedRows = await bankBulkResponse.json() as Array<{ id: string; question_no: number; problem_dna?: Record<string, any> | null }>;
    const bankUpdated = bulkUpdatedRows.length;

    // 3) 문항명과 Problem DNA 안의 학년/과목도 전부 맞춘다.
    //    반환행이 DB max-rows에 걸릴 수 있으므로 ID 목록은 별도로 1,000개씩 끝까지 읽는다.
    const bankRows: BankMetadataRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await restJson<BankMetadataRow[]>(
        url,
        headers,
        `problem_bank_questions?source_file_id=eq.${encodedId}&select=id,question_no,problem_dna&order=question_no.asc&offset=${offset}&limit=1000`,
      );
      bankRows.push(...page);
      if (page.length < 1000) break;
    }

    for (const row of bankRows) {
      const dna = row.problem_dna && typeof row.problem_dna === "object"
        ? {
            ...row.problem_dna,
            basic: {
              ...(row.problem_dna.basic && typeof row.problem_dna.basic === "object" ? row.problem_dna.basic : {}),
              source_title: title,
              source_name: source || null,
              subject: subject || null,
            },
          }
        : row.problem_dna ?? null;
      await restPatch(url, headers, `problem_bank_questions?id=eq.${encodeURIComponent(row.id)}`, {
        title: `${title} ${row.question_no}번`,
        problem_dna: dna,
        updated_at: new Date().toISOString(),
      });
    }

    // 4) AI 분석 작업물도 같은 시험지 기준으로 동기화한다.
    const analyses = await restJson<AnalysisRow[]>(
      url, headers, `source_analysis?source_file_id=eq.${encodedId}&select=id`,
    );
    let analysisUpdated = 0;
    for (const analysis of analyses) {
      for (let offset = 0; ; offset += 1000) {
        const questions = await restJson<AnalysisMetadataRow[]>(
          url,
          headers,
          `analysis_questions?analysis_id=eq.${encodeURIComponent(analysis.id)}&select=id,ai_result,review_result&offset=${offset}&limit=1000`,
        );
        for (const question of questions) {
          await restPatch(url, headers, `analysis_questions?id=eq.${encodeURIComponent(question.id)}`, {
            ai_result: withSourceMetadata(question.ai_result, { title, source, subject }),
            review_result: withSourceMetadata(question.review_result, { title, source, subject }),
          });
          analysisUpdated += 1;
        }
        if (questions.length < 1000) break;
      }
    }

    return NextResponse.json({
      success: true,
      sourceUpdated: true,
      bankUpdated: bankRows.length || bankUpdated,
      analysisUpdated,
      message: `시험지 정보 수정 완료 · 문제은행 ${bankRows.length || bankUpdated}문항 + AI 분석 ${analysisUpdated}문항 동기화`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "시험지 정보 수정에 실패했습니다.",
    }, { status: 500 });
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

    // 문제은행에 등록된 시험지는 AI 등록 화면의 일반 삭제로 지울 수 없다.
    // 작업 실수 한 번으로 운영 중인 문항 전체가 사라지는 것을 서버에서 최종 차단한다.
    if (bankImageRows.length > 0) {
      return NextResponse.json({
        success: false,
        code: "BANK_REGISTERED_SOURCE_PROTECTED",
        message: `문제은행에 ${bankImageRows.length}문항이 등록된 시험지라 삭제할 수 없습니다. 문제은행 문항을 먼저 정리한 뒤 삭제해 주세요.`,
      }, { status: 409, headers: { "Cache-Control": "no-store, max-age=0" } });
    }

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
