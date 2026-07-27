"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SourceFile = {
  id: string;
  created_at: string;
  title: string;
  source: string | null;
  grade: string | null;
  subject: string | null;
  original_hwp_name: string | null;
  exam_pdf_name: string | null;
  solution_pdf_name: string | null;
  status: string;
  error_message: string | null;
};

type UploadResponse = { success: boolean; message: string; data?: SourceFile };
type AnalysisResponse = { success?: boolean; message?: string; analysisId?: string };

type BundleFiles = {
  hwpFile: File | null;
  examPdf: File | null;
  solutionPdf: File | null;
};

const statusLabel: Record<string, string> = {
  uploaded: "업로드 완료",
  splitting: "PDF 분리 중",
  pages_created: "페이지 생성 완료",
  analyzing: "AI 분석 중",
  RUNNING: "AI 분석 중",
  completed: "분석 완료",
  COMPLETED: "분석 완료",
  failed: "실패",
  FAILED: "실패",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function fileIsPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function fileIsHwp(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".hwp") || name.endsWith(".hwpx");
}

export default function AiAnalysisWorkspacePage() {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [grade, setGrade] = useState("고1");
  const [subject, setSubject] = useState("공통수학1");
  const [files, setFiles] = useState<BundleFiles>({ hwpFile: null, examPdf: null, solutionPdf: null });
  const [items, setItems] = useState<SourceFile[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadSourceFiles = useCallback(async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from("source_files")
      .select("id,created_at,title,source,grade,subject,original_hwp_name,exam_pdf_name,solution_pdf_name,status,error_message")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(`목록 조회 실패: ${error.message}`);
      setLoadingList(false);
      return;
    }
    setItems((data ?? []) as SourceFile[]);
    setLoadingList(false);
  }, [supabase]);

  useEffect(() => { void loadSourceFiles(); }, [loadSourceFiles]);

  function selectFile(kind: keyof BundleFiles, event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setMessage("");
    setErrorMessage("");
    if (!selected) return setFiles((current) => ({ ...current, [kind]: null }));
    const valid = kind === "hwpFile" ? fileIsHwp(selected) : fileIsPdf(selected);
    if (!valid) {
      event.target.value = "";
      setErrorMessage(kind === "hwpFile" ? "한글 원본은 .hwp 또는 .hwpx만 가능합니다." : "PDF 파일만 선택할 수 있습니다.");
      return;
    }
    if (selected.size > 50 * 1024 * 1024) {
      event.target.value = "";
      setErrorMessage("파일 크기는 각각 50MB 이하여야 합니다.");
      return;
    }
    setFiles((current) => ({ ...current, [kind]: selected }));
    if (!title.trim() && kind === "examPdf") setTitle(selected.name.replace(/\.pdf$/i, ""));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");
    if (!title.trim()) return setErrorMessage("시험지명을 입력해 주세요.");
    if (!files.hwpFile || !files.examPdf || !files.solutionPdf) return setErrorMessage("한글 원본, 시험지 PDF, 해설지 PDF를 모두 선택해 주세요.");

    setUploading(true);
    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("source", source.trim());
      form.append("grade", grade);
      form.append("subject", subject);
      form.append("hwpFile", files.hwpFile);
      form.append("examPdf", files.examPdf);
      form.append("solutionPdf", files.solutionPdf);
      const response = await fetch("/api/source-files/upload", { method: "POST", body: form });
      const result = await response.json() as UploadResponse;
      if (!response.ok || !result.success) throw new Error(result.message || "시험지 세트 등록에 실패했습니다.");
      setMessage("시험지 세트를 등록했습니다. 아래에서 AI 문항분리를 시작하세요.");
      setTitle("");
      setSource("");
      setFiles({ hwpFile: null, examPdf: null, solutionPdf: null });
      for (const id of ["hwp-file", "exam-pdf", "solution-pdf"]) {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) input.value = "";
      }
      await loadSourceFiles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "등록 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  }

  async function startAnalysis(item: SourceFile) {
    setWorkingId(item.id);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/analysis/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFileId: item.id }),
      });
      const result = await response.json() as AnalysisResponse;
      if (!response.ok || !result.success) throw new Error(result.message || "AI 분석에 실패했습니다.");
      setMessage(`${item.title}: AI가 문항 번호·영역·내용을 분석했습니다. 이제 문항 영역을 검수하세요.`);
      await loadSourceFiles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AI 분석 중 오류가 발생했습니다.");
    } finally {
      setWorkingId(null);
    }
  }

  const allFilesReady = Boolean(files.hwpFile && files.examPdf && files.solutionPdf);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-bold text-amber-600">MATHPOOH SOS · QUESTION FACTORY</p>
            <h1 className="text-3xl font-black">AI 분석 작업장</h1>
            <p className="mt-2 text-sm text-slate-500">PDF를 AI가 문항별로 나누고, 잘못 잡힌 영역만 사람이 수정한 뒤 문제은행으로 보냅니다.</p>
          </div>
          <button className="rounded-xl border bg-white px-4 py-2 font-bold" onClick={() => { window.location.href = "/problem-bank"; }}>문제은행 보기</button>
        </header>

        <section className="mb-6 grid gap-3 md:grid-cols-4">
          {["1. 시험지 세트 등록", "2. AI 문항 자동분리", "3. 문항 영역 검수", "4. 문제은행 등록"].map((step, index) => (
            <div key={step} className={`rounded-2xl border p-4 font-bold ${index === 2 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>{step}</div>
          ))}
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">새 시험지 세트 등록</h2>
          <form onSubmit={handleSubmit} className="mt-5 grid gap-4 lg:grid-cols-4">
            <label className="grid gap-2"><span className="text-sm font-bold">시험지명</span><input className="h-11 rounded-xl border px-4" value={title} onChange={(e) => setTitle(e.target.value)} disabled={uploading} /></label>
            <label className="grid gap-2"><span className="text-sm font-bold">출처</span><input className="h-11 rounded-xl border px-4" value={source} onChange={(e) => setSource(e.target.value)} disabled={uploading} /></label>
            <label className="grid gap-2"><span className="text-sm font-bold">학년</span><select className="h-11 rounded-xl border px-3" value={grade} onChange={(e) => setGrade(e.target.value)} disabled={uploading}>{["중1","중2","중3","고1","고2","고3"].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label className="grid gap-2"><span className="text-sm font-bold">과목</span><select className="h-11 rounded-xl border px-3" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={uploading}>{["중등수학","공통수학1","공통수학2","대수","미적분Ⅰ","확률과 통계"].map((v) => <option key={v}>{v}</option>)}</select></label>

            <label className="rounded-xl border border-dashed p-4"><span className="block text-sm font-black">① 한글 원본</span><input id="hwp-file" className="mt-3 block w-full text-sm" type="file" accept=".hwp,.hwpx" onChange={(e) => selectFile("hwpFile", e)} disabled={uploading} /><small className="mt-2 block text-slate-500">{files.hwpFile?.name || ".hwp / .hwpx"}</small></label>
            <label className="rounded-xl border border-dashed p-4"><span className="block text-sm font-black">② 시험지 PDF</span><input id="exam-pdf" className="mt-3 block w-full text-sm" type="file" accept=".pdf,application/pdf" onChange={(e) => selectFile("examPdf", e)} disabled={uploading} /><small className="mt-2 block text-slate-500">{files.examPdf?.name || "문제가 있는 PDF"}</small></label>
            <label className="rounded-xl border border-dashed p-4"><span className="block text-sm font-black">③ 해설지 PDF</span><input id="solution-pdf" className="mt-3 block w-full text-sm" type="file" accept=".pdf,application/pdf" onChange={(e) => selectFile("solutionPdf", e)} disabled={uploading} /><small className="mt-2 block text-slate-500">{files.solutionPdf?.name || "정답·해설 PDF"}</small></label>
            <div className="flex items-end"><button className="h-12 w-full rounded-xl bg-slate-900 px-6 font-black text-white disabled:opacity-40" type="submit" disabled={uploading || !allFilesReady}>{uploading ? "등록 중..." : "시험지 세트 등록"}</button></div>
          </form>
          {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-700">{message}</p>}
          {errorMessage && <p className="mt-4 rounded-xl bg-red-50 p-3 font-semibold text-red-700">{errorMessage}</p>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-lg font-black">분석 대기·진행 목록 ({items.length})</h2><button className="rounded-lg border px-3 py-2 text-sm font-bold" onClick={() => void loadSourceFiles()} disabled={loadingList}>새로고침</button></div>
          {loadingList ? <div className="p-10 text-center">목록을 불러오는 중입니다.</div> : items.length === 0 ? <div className="p-10 text-center text-slate-500">등록된 시험지가 없습니다.</div> : (
            <div className="divide-y">
              {items.map((item) => (
                <article key={item.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><strong className="text-lg">{item.title}</strong><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{item.grade || "학년 미입력"}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{item.subject || "과목 미입력"}</span></div>
                    <p className="mt-2 text-sm text-slate-500">{item.source || "출처 미입력"} · {formatDate(item.created_at)}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.exam_pdf_name || "시험지 PDF"} / {item.solution_pdf_name || "해설지 PDF"}</p>
                    {item.error_message ? <p className="mt-2 text-sm font-semibold text-red-600">{item.error_message}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <span className="self-center rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">{statusLabel[item.status] ?? item.status}</span>
                    <button className="rounded-xl bg-slate-900 px-4 py-2.5 font-bold text-white disabled:opacity-40" disabled={workingId === item.id} onClick={() => void startAnalysis(item)}>{workingId === item.id ? "AI 분석 중..." : "AI 문항분리 시작"}</button>
                    <button className="rounded-xl border border-amber-500 bg-amber-50 px-4 py-2.5 font-black text-amber-800" onClick={() => { window.location.href = `/problem-bank/crop?sourceFileId=${encodeURIComponent(item.id)}`; }}>문항 영역 검수</button>
                    <button className="rounded-xl border px-4 py-2.5 font-bold" onClick={() => { window.location.href = "/review"; }}>내용 검수·등록</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
