import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { normalizeSubject } from "@/lib/subject";

export const runtime = "nodejs";
// v164: 문항이 많은 시험지를 수정할 때 중간에 끊기지 않도록 실행 시간을 늘린다.
export const maxDuration = 300;
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

/** 문항별 요청을 소량 병렬로 처리해 타임아웃을 피한다. */
async function runInChunks<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(task));
  }
}

function withSourceMetadata(result: Record<string, any> | null | undefined, subject: string) {
  if (!result || typeof result !== "object") return result ?? null;
  const next: Record<string, any> = { ...result };
  if (subject) next.subject = subject;
  const dna = next.problem_dna;
  if (dna && typeof dna === "object") {
    next.problem_dna = {
      ...dna,
      basic: {
        ...(dna.basic && typeof dna.basic === "object" ? dna.basic : {}),
        ...(subject ? { subject } : {}),
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
    const requestedSubject = cleanMetadataText(body.subject);
    // v164: 과목은 반드시 표준 6과목 중 하나로만 저장한다.
    const subject = requestedSubject ? normalizeSubject(requestedSubject) : "";
    if (!title) return NextResponse.json({ success: false, message: "시험지명을 입력해 주세요." }, { status: 400 });
    if (requestedSubject && !subject) {
      return NextResponse.json({
        success: false,
        message: `"${requestedSubject}"은(는) 표준 과목이 아닙니다. 목록에서 과목을 선택해 주세요.`,
      }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    // RLS를 잠근 뒤에는 anon 키로 PATCH하면 아무 행도 바뀌지 않고 성공처럼 보인다.
    // 과목 수정이 "저장은 됐는데 반영이 안 되는" 증상의 원인이므로 service role을 필수로 둔다.
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) return NextResponse.json({ success: false, message: "NEXT_PUBLIC_SUPABASE_URL이 없습니다." }, { status: 500 });
    if (!key) {
      return NextResponse.json({
        success: false,
        message: "SUPABASE_SERVICE_ROLE_KEY가 없습니다. 이 키가 없으면 시험지 수정이 문제은행에 반영되지 않습니다. (.env.local / Vercel 환경변수 확인)",
      }, { status: 500 });
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

    await runInChunks(bankRows, 8, async (row) => {
      const dna = row.problem_dna && typeof row.problem_dna === "object"
        ? {
            ...row.problem_dna,
            basic: {
              ...(row.problem_dna.basic && typeof row.problem_dna.basic === "object" ? row.problem_dna.basic : {}),
              ...(subject ? { subject } : {}),
            },
          }
        : row.problem_dna ?? null;
      await restPatch(url, headers, `problem_bank_questions?id=eq.${encodeURIComponent(row.id)}`, {
        title: `${title} ${row.question_no}번`,
        problem_dna: dna,
        updated_at: new Date().toISOString(),
      });
    });

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
        await runInChunks(questions, 8, async (question) => {
          await restPatch(url, headers, `analysis_questions?id=eq.${encodeURIComponent(question.id)}`, {
            ai_result: withSourceMetadata(question.ai_result, subject),
            review_result: withSourceMetadata(question.review_result, subject),
          });
        });
        analysisUpdated += questions.length;
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
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ success: false, message: "Supabase 환경변수(SUPABASE_SERVICE_ROLE_KEY 포함)가 없습니다." }, { status: 500 });
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
