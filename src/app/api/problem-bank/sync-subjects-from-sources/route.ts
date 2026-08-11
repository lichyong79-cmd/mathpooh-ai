import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { canonicalSubject } from "@/lib/subject";

export const runtime = "nodejs";
// v164: 문항 수천 개를 한 번에 고치므로 실행 시간을 넉넉히 잡는다.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type SourceRow = { id: string; subject?: string | null };
type BankRow = { id: string; problem_dna?: Record<string, any> | null };
type AnalysisRow = { id: string };
type AnalysisQuestionRow = { id: string; ai_result?: Record<string, any> | null; review_result?: Record<string, any> | null };

async function restJson<T>(url: string, headers: Record<string, string>, path: string): Promise<T> {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function restPatch(url: string, headers: Record<string, string>, path: string, body: unknown) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
}

/** 순차 요청이 수천 건이면 타임아웃 난다. 소량 병렬로 나눠 실행한다. */
async function runInChunks<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(task));
  }
}

function patchAnalysisResult(result: Record<string, any> | null | undefined, subject: string) {
  if (!result || typeof result !== "object") return result ?? null;
  const next: Record<string, any> = { ...result, subject };
  if (next.problem_dna && typeof next.problem_dna === "object") {
    next.problem_dna = {
      ...next.problem_dna,
      basic: { ...(next.problem_dna.basic && typeof next.problem_dna.basic === "object" ? next.problem_dna.basic : {}), subject },
    };
  }
  return next;
}

export async function POST() {
  const denied = await requireUser();
  if (denied) return denied;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    // RLS를 잠근 뒤에는 anon 키로는 이 작업이 조용히 실패한다. 반드시 service role을 쓴다.
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) return NextResponse.json({ success: false, message: "NEXT_PUBLIC_SUPABASE_URL이 없습니다." }, { status: 500 });
    if (!key) {
      return NextResponse.json({
        success: false,
        message: "SUPABASE_SERVICE_ROLE_KEY가 없습니다. 이 키가 없으면 과목 동기화가 아무 행도 수정하지 못합니다. (.env.local / Vercel 환경변수 확인)",
      }, { status: 500 });
    }
    const headers = { apikey: key, Authorization: `Bearer ${key}` };

    const sources: SourceRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await restJson<SourceRow[]>(url, headers, `source_files?select=id,subject&order=created_at.asc&offset=${offset}&limit=1000`);
      sources.push(...page);
      if (page.length < 1000) break;
    }

    let sourceCount = 0, bankUpdated = 0, analysisUpdated = 0, skipped = 0;
    const unresolved: string[] = [];

    for (const source of sources) {
      // 표준 6과목으로 확정하지 못하는 값은 건드리지 않는다. (임의로 미분류 처리하지 않음)
      const subject = canonicalSubject(source.subject);
      if (subject === "미분류") {
        skipped += 1;
        if (String(source.subject ?? "").trim()) unresolved.push(String(source.subject));
        continue;
      }
      sourceCount += 1;
      const encodedSourceId = encodeURIComponent(source.id);

      await restPatch(url, headers, `source_files?id=eq.${encodedSourceId}`, { subject });
      await restPatch(url, headers, `problem_bank_questions?source_file_id=eq.${encodedSourceId}`, {
        subject,
        updated_at: new Date().toISOString(),
      });

      const bankRows: BankRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await restJson<BankRow[]>(url, headers, `problem_bank_questions?source_file_id=eq.${encodedSourceId}&select=id,problem_dna&offset=${offset}&limit=1000`);
        bankRows.push(...page);
        if (page.length < 1000) break;
      }
      bankUpdated += bankRows.length;
      await runInChunks(bankRows, 8, async (row) => {
        const dna = row.problem_dna && typeof row.problem_dna === "object"
          ? { ...row.problem_dna, basic: { ...(row.problem_dna.basic && typeof row.problem_dna.basic === "object" ? row.problem_dna.basic : {}), subject } }
          : row.problem_dna ?? null;
        await restPatch(url, headers, `problem_bank_questions?id=eq.${encodeURIComponent(row.id)}`, {
          problem_dna: dna,
          updated_at: new Date().toISOString(),
        });
      });

      const analyses = await restJson<AnalysisRow[]>(url, headers, `source_analysis?source_file_id=eq.${encodedSourceId}&select=id`);
      for (const analysis of analyses) {
        for (let offset = 0; ; offset += 1000) {
          const questions = await restJson<AnalysisQuestionRow[]>(
            url, headers,
            `analysis_questions?analysis_id=eq.${encodeURIComponent(analysis.id)}&select=id,ai_result,review_result&offset=${offset}&limit=1000`,
          );
          await runInChunks(questions, 8, async (question) => {
            await restPatch(url, headers, `analysis_questions?id=eq.${encodeURIComponent(question.id)}`, {
              ai_result: patchAnalysisResult(question.ai_result, subject),
              review_result: patchAnalysisResult(question.review_result, subject),
            });
          });
          analysisUpdated += questions.length;
          if (questions.length < 1000) break;
        }
      }
    }

    const unresolvedNote = unresolved.length
      ? ` 표준 과목으로 인식하지 못한 시험지 ${skipped}개는 건너뛰었습니다: ${[...new Set(unresolved)].slice(0, 5).join(", ")}`
      : "";
    return NextResponse.json({
      success: true, sourceCount, bankUpdated, analysisUpdated, skipped,
      message: `과목 재동기화 완료 · 시험지 ${sourceCount}개 기준 · 문제은행 ${bankUpdated}문항 · AI 분석 ${analysisUpdated}문항${unresolvedNote}`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "과목 재동기화에 실패했습니다." }, { status: 500 });
  }
}
