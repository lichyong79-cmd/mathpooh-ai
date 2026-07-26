"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SourceFile = {
  id: string;
  created_at: string;
  title: string;
  source: string | null;
  storage_path: string;
  page_count: number;
  status: string;
  error_message: string | null;
};

type UploadResponse = {
  success: boolean;
  message: string;
  data?: SourceFile;
};

const statusLabel: Record<string, string> = {
  uploaded: "업로드 완료",
  splitting: "PDF 분리 중",
  pages_created: "페이지 생성 완료",
  analyzing: "AI 분석 중",
  completed: "분석 완료",
  failed: "실패",
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

function getOriginalFileName(storagePath: string) {
  const lastPart = storagePath.split("/").pop() ?? storagePath;
  const separatorIndex = lastPart.indexOf("-");
  return separatorIndex === -1 ? lastPart : lastPart.slice(separatorIndex + 1);
}

export default function AiUploadPage() {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<SourceFile[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadSourceFiles = useCallback(async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from("source_files")
      .select("id, created_at, title, source, storage_path, page_count, status, error_message")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(`목록 조회 실패: ${error.message}`);
      setLoadingList(false);
      return;
    }

    setItems((data ?? []) as SourceFile[]);
    setLoadingList(false);
  }, [supabase]);

  useEffect(() => {
    void loadSourceFiles();
  }, [loadSourceFiles]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    setErrorMessage("");
    setMessage("");

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const isPdf = selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      event.target.value = "";
      setFile(null);
      setErrorMessage("PDF 파일만 등록할 수 있습니다.");
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      event.target.value = "";
      setFile(null);
      setErrorMessage("파일 크기는 50MB 이하여야 합니다.");
      return;
    }

    setFile(selectedFile);
    if (!title.trim()) setTitle(selectedFile.name.replace(/\.pdf$/i, ""));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (!title.trim()) return setErrorMessage("시험지 제목을 입력해 주세요.");
    if (!file) return setErrorMessage("등록할 PDF를 선택해 주세요.");

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("source", source.trim());
      formData.append("file", file);

      const response = await fetch("/api/source-files/upload", { method: "POST", body: formData });
      const result = (await response.json()) as UploadResponse;
      if (!response.ok || !result.success) throw new Error(result.message || "PDF 등록에 실패했습니다.");

      setMessage(result.message);
      setTitle("");
      setSource("");
      setFile(null);
      const input = document.getElementById("source-pdf-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadSourceFiles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "PDF 등록 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <p className="mb-1 text-sm font-semibold text-amber-600">Mathpooh SOS</p>
          <h1 className="text-2xl font-bold text-slate-900">AI 문제등록</h1>
          <p className="mt-2 text-sm text-slate-500">한글에서 만든 시험지를 PDF로 업로드합니다.</p>
        </header>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">새 시험지 등록</h2>
          <form onSubmit={handleSubmit} className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr_auto]">
            <input className="h-11 rounded-xl border px-4" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="시험지 제목" disabled={uploading} />
            <input className="h-11 rounded-xl border px-4" value={source} onChange={(e) => setSource(e.target.value)} placeholder="출처" disabled={uploading} />
            <input id="source-pdf-file" className="lg:col-span-2" type="file" accept=".pdf,application/pdf" onChange={handleFileChange} disabled={uploading} />
            <button className="h-11 rounded-xl bg-slate-900 px-6 font-bold text-white" type="submit" disabled={uploading}>
              {uploading ? "업로드 중..." : "PDF 등록"}
            </button>
          </form>
          {file && <p className="mt-4 text-sm">선택 파일: {file.name}</p>}
          {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-emerald-700">{message}</p>}
          {errorMessage && <p className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{errorMessage}</p>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-lg font-bold">업로드 목록 ({items.length})</h2>
            <button onClick={() => void loadSourceFiles()} disabled={loadingList}>새로고침</button>
          </div>
          {loadingList ? (
            <div className="p-10 text-center">목록을 불러오는 중입니다.</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center">등록된 PDF가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-3 text-left">등록일</th>
                    <th className="px-5 py-3 text-left">제목</th>
                    <th className="px-5 py-3 text-left">출처</th>
                    <th className="px-5 py-3 text-left">파일명</th>
                    <th className="px-5 py-3 text-center">페이지</th>
                    <th className="px-5 py-3 text-center">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-4">{formatDate(item.created_at)}</td>
                      <td className="px-5 py-4 font-semibold">{item.title}</td>
                      <td className="px-5 py-4">{item.source || "-"}</td>
                      <td className="px-5 py-4">{getOriginalFileName(item.storage_path)}</td>
                      <td className="px-5 py-4 text-center">{item.page_count || "-"}</td>
                      <td className="px-5 py-4 text-center">{statusLabel[item.status] ?? item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
