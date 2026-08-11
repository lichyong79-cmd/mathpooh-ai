import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SourceRow = { id: string; subject?: string | null };
type BankRow = { id: string; problem_dna?: Record<string, any> | null };
type AnalysisRow = { id: string };
type AnalysisQuestionRow = { id: string; ai_result?: Record<string, any> | null; review_result?: Record<string, any> | null };

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

function normalizeSubject(value: unknown) {
  const subject = clean(value);
  const aliases: Record<string, string> = {
    "미적분Ⅰ": "미적분 I",
    "미적분1": "미적분 I",
    "확통": "확률과 통계",
    "공통수학Ⅰ": "공통수학1",
    "공통수학 1": "공통수학1",
    "공통수학Ⅱ": "공통수학2",
    "공통수학 2": "공통수학2",
  };
  return aliases[subject] ?? subject;
}

async function restJson<T>(url: string, headers: Record<string,string>, path: string): Promise<T> {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function restPatch(url: string, headers: Record<string,string>, path: string, body: unknown) {
  const response = await fetch(`${url}/rest/v1/${path}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(body), cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
}

function patchAnalysisResult(result: Record<string, any> | null | undefined, subject: string) {
  if (!result || typeof result !== "object") return result ?? null;
  const next: Record<string, any> = { ...result, subject };
  if (next.problem_dna && typeof next.problem_dna === "object") {
    next.problem_dna = { ...next.problem_dna, basic: { ...(next.problem_dna.basic && typeof next.problem_dna.basic === "object" ? next.problem_dna.basic : {}), subject } };
  }
  return next;
}

export async function POST() {
  const denied = await requireUser();
  if (denied) return denied;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ success:false, message:"Supabase 환경변수가 없습니다." }, { status:500 });
    const headers = { apikey:key, Authorization:`Bearer ${key}` };
    const sources: SourceRow[] = [];
    for (let offset=0;;offset+=1000) {
      const page = await restJson<SourceRow[]>(url, headers, `source_files?select=id,subject&order=created_at.asc&offset=${offset}&limit=1000`);
      sources.push(...page);
      if (page.length < 1000) break;
    }
    let sourceCount=0, bankUpdated=0, analysisUpdated=0, skipped=0;
    for (const source of sources) {
      const subject = normalizeSubject(source.subject);
      if (!subject) { skipped++; continue; }
      sourceCount++;
      // Canonicalize source itself.
      await restPatch(url, headers, `source_files?id=eq.${encodeURIComponent(source.id)}`, { subject });
      // Direct display/search field for every linked bank question.
      await restPatch(url, headers, `problem_bank_questions?source_file_id=eq.${encodeURIComponent(source.id)}`, { subject, updated_at:new Date().toISOString() });
      const bankRows: BankRow[] = [];
      for (let offset=0;;offset+=1000) {
        const page = await restJson<BankRow[]>(url, headers, `problem_bank_questions?source_file_id=eq.${encodeURIComponent(source.id)}&select=id,problem_dna&offset=${offset}&limit=1000`);
        bankRows.push(...page);
        if (page.length < 1000) break;
      }
      bankUpdated += bankRows.length;
      for (const row of bankRows) {
        const dna = row.problem_dna && typeof row.problem_dna === "object" ? { ...row.problem_dna, basic:{ ...(row.problem_dna.basic && typeof row.problem_dna.basic === "object" ? row.problem_dna.basic : {}), subject } } : row.problem_dna ?? null;
        await restPatch(url, headers, `problem_bank_questions?id=eq.${encodeURIComponent(row.id)}`, { problem_dna:dna, updated_at:new Date().toISOString() });
      }
      const analyses = await restJson<AnalysisRow[]>(url, headers, `source_analysis?source_file_id=eq.${encodeURIComponent(source.id)}&select=id`);
      for (const analysis of analyses) {
        for (let offset=0;;offset+=1000) {
          const questions = await restJson<AnalysisQuestionRow[]>(url, headers, `analysis_questions?analysis_id=eq.${encodeURIComponent(analysis.id)}&select=id,ai_result,review_result&offset=${offset}&limit=1000`);
          for (const q of questions) {
            await restPatch(url, headers, `analysis_questions?id=eq.${encodeURIComponent(q.id)}`, { ai_result:patchAnalysisResult(q.ai_result,subject), review_result:patchAnalysisResult(q.review_result,subject) });
            analysisUpdated++;
          }
          if (questions.length < 1000) break;
        }
      }
    }
    return NextResponse.json({ success:true, sourceCount, bankUpdated, analysisUpdated, skipped, message:`과목 재동기화 완료 · 시험지 ${sourceCount}개 기준 · 문제은행 ${bankUpdated}문항 · AI 분석 ${analysisUpdated}문항` });
  } catch (error) {
    return NextResponse.json({ success:false, message:error instanceof Error ? error.message : "과목 재동기화에 실패했습니다." }, { status:500 });
  }
}
