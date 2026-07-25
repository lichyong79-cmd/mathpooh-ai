"use client";

import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseConfig } from "@/lib/supabase";

type Rect = { x: number; y: number; w: number; h: number };
type QuestionRegion = Rect & { number: number; page: number; answer: string; type: "choice" | "short" };
type PdfJs = typeof import("pdfjs-dist");

const EMPTY_REGIONS: QuestionRegion[] = Array.from({ length: 30 }, (_, i) => ({
  number: i + 1,
  page: 1,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  answer: "",
  type: i < 22 ? "choice" : "short",
}));

export default function PdfMapperPage() {
  const [examCode, setExamCode] = useState("SOS_A_01");
  const [examPdf, setExamPdf] = useState<File | null>(null);
  const [solutionPdf, setSolutionPdf] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [activeNumber, setActiveNumber] = useState(1);
  const [regions, setRegions] = useState<QuestionRegion[]>(EMPTY_REGIONS);
  const [autoNext, setAutoNext] = useState(true);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loadingRegisteredPdf, setLoadingRegisteredPdf] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const pdfjsRef = useRef<PdfJs | null>(null);

  const activeRegion = regions[activeNumber - 1];
  const completed = regions.filter(r => r.w > 0 && r.h > 0).length;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const examId = params.get("exam");
    const questionCount = Math.max(1, Number(params.get("questions") || 30));
    setRegions(Array.from({ length: questionCount }, (_, i) => ({ number: i + 1, page: 1, x: 0, y: 0, w: 0, h: 0, answer: "", type: i < 21 ? "choice" : "short" })));
    if (!examId || examId === "new") { setLoadingRegisteredPdf(false); return; }
    const config = getSupabaseConfig();
    if (!config) { setLoadingRegisteredPdf(false); return; }
    (async () => {
      try {
        const response = await fetch(`${config.url}/rest/v1/exams?id=eq.${encodeURIComponent(examId)}&select=exam_code,test_file_name,test_file_path`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, cache: "no-store" });
        if (!response.ok) throw new Error(await response.text());
        const exam = (await response.json())[0];
        if (!exam?.test_file_path) throw new Error("등록된 시험지 PDF가 없습니다.");
        setExamCode(exam.exam_code || "SOS");
        const url = `${config.url}/storage/v1/object/public/exam-files/${exam.test_file_path}`;
        const pdfResponse = await fetch(url, { cache: "no-store" });
        if (!pdfResponse.ok) throw new Error("등록 시험지를 불러오지 못했습니다.");
        const blob = await pdfResponse.blob();
        const file = new File([blob], exam.test_file_name || "시험지.pdf", { type: "application/pdf" });
        const pdfjs = pdfjsRef.current ?? await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        setExamPdf(file); setPdfDoc(doc); setPageCount(doc.numPages); setPage(1);
      } catch (error) {
        console.error(error); alert(error instanceof Error ? error.message : "등록 시험지를 불러오지 못했습니다.");
      } finally { setLoadingRegisteredPdf(false); }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      if (!cancelled) pdfjsRef.current = pdfjs;
    })();
    return () => { cancelled = true; };
  }, []);

  async function uploadExam(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return alert("PDF 파일만 선택하세요.");
    const pdfjs = pdfjsRef.current ?? await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    setExamPdf(file);
    setPdfDoc(doc);
    setPageCount(doc.numPages);
    setPage(1);
    setRegions(EMPTY_REGIONS);
    setActiveNumber(1);
  }

  function uploadSolution(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return alert("PDF 파일만 선택하세요.");
    setSolutionPdf(file);
  }

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const pdfPage = await pdfDoc.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      const maxWidth = 900;
      const scale = Math.min(1.65, maxWidth / base.width);
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current!;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      await pdfPage.render({ canvasContext: context, viewport }).promise;
      if (!cancelled) makePreview(regions[activeNumber - 1]);
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, page]);

  useEffect(() => {
    if (activeRegion.page && activeRegion.page !== page && activeRegion.w > 0) {
      setPage(activeRegion.page);
    } else {
      makePreview(activeRegion);
    }
  }, [activeNumber]);

  function point(e: PointerEvent<HTMLDivElement>) {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!pdfDoc) return;
    startRef.current = point(e);
    setDraft({ ...startRef.current, w: 0, h: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return;
    const p = point(e);
    setDraft({
      x: Math.min(startRef.current.x, p.x),
      y: Math.min(startRef.current.y, p.y),
      w: Math.abs(p.x - startRef.current.x),
      h: Math.abs(p.y - startRef.current.y),
    });
  }

  function pointerUp() {
    if (!draft || draft.w < 2 || draft.h < 2) {
      startRef.current = null;
      setDraft(null);
      return;
    }
    const next = regions.map(r => r.number === activeNumber ? { ...r, ...draft, page } : r);
    setRegions(next);
    makePreview(next[activeNumber - 1]);
    startRef.current = null;
    setDraft(null);
    if (autoNext && activeNumber < 30) setActiveNumber(activeNumber + 1);
  }

  function makePreview(region: QuestionRegion) {
    const canvas = canvasRef.current;
    if (!canvas || !region || region.w <= 0 || region.page !== page) {
      setPreviewUrl("");
      return;
    }
    const sx = Math.round(canvas.width * region.x / 100);
    const sy = Math.round(canvas.height * region.y / 100);
    const sw = Math.max(1, Math.round(canvas.width * region.w / 100));
    const sh = Math.max(1, Math.round(canvas.height * region.h / 100));
    const crop = document.createElement("canvas");
    crop.width = sw;
    crop.height = sh;
    crop.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    setPreviewUrl(crop.toDataURL("image/png"));
  }

  function updateActive(patch: Partial<QuestionRegion>) {
    setRegions(prev => prev.map(r => r.number === activeNumber ? { ...r, ...patch } : r));
  }

  function clearActive() {
    updateActive({ x: 0, y: 0, w: 0, h: 0, page });
    setPreviewUrl("");
  }

  function exportJson() {
    if (!examPdf) return alert("시험지 PDF를 먼저 등록하세요.");
    const payload = {
      examCode,
      minutes: 100,
      examPdfName: examPdf.name,
      solutionPdfName: solutionPdf?.name ?? "",
      questions: regions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${examCode}_mapping.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pageRegions = useMemo(() => regions.filter(r => r.page === page && r.w > 0), [regions, page]);

  return (
    <main className="mapper-shell">
      <header className="mapper-header">
        <div><span>SOS PDF MAPPER</span><h1>문항 영역 지정</h1><p>시험 등록 단계에서 올린 PDF를 자동으로 불러와 사용합니다.</p></div>
        <button className="primary" onClick={exportJson}>영역정보 저장</button>
      </header>

      <section className="meta-card">
        <label>시험코드<input value={examCode} onChange={e => setExamCode(e.target.value)} /></label>
        <label>시험시간<input value="100분 (고정)" disabled /></label>
        <label className="file-box">등록 시험지<span>{loadingRegisteredPdf ? "불러오는 중..." : examPdf?.name ?? "등록 시험지 없음"}</span></label>
        <label className="file-box">시험지 변경(예외)<input type="file" accept="application/pdf" onChange={uploadExam} /><span>필요할 때만 직접 선택</span></label>
      </section>

      <div className="mapper-grid">
        <aside className="side-card">
          <div className="side-title"><h2>문항 번호</h2><b>{completed}/30</b></div>
          <label className="check"><input type="checkbox" checked={autoNext} onChange={e => setAutoNext(e.target.checked)} /> 지정 후 다음 번호 자동선택</label>
          <div className="number-grid">
            {regions.map(r => <button key={r.number} className={`${activeNumber === r.number ? "active" : ""} ${r.w > 0 ? "done" : ""}`} onClick={() => setActiveNumber(r.number)}>{r.number}</button>)}
          </div>
          <div className="answer-editor">
            <h3>{activeNumber}번 설정</h3>
            <label>유형<select value={activeRegion.type} onChange={e => updateActive({ type: e.target.value as "choice" | "short", answer: "" })}><option value="choice">객관식</option><option value="short">단답형</option></select></label>
            {activeRegion.type === "choice" ? <div className="choices">{[1,2,3,4,5].map(n => <button key={n} className={activeRegion.answer === String(n) ? "active" : ""} onClick={() => updateActive({ answer: String(n) })}>{n}</button>)}</div> : <label>정답<input value={activeRegion.answer} onChange={e => updateActive({ answer: e.target.value })} /></label>}
            <button className="clear" onClick={clearActive}>영역 다시 지정</button>
          </div>
        </aside>

        <section className="viewer-card">
          <div className="viewer-toolbar"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>이전</button><b>{pageCount ? `${page} / ${pageCount} 페이지` : "PDF 미등록"}</b><button disabled={!pageCount || page >= pageCount} onClick={() => setPage(p => p + 1)}>다음</button><span>현재 {activeNumber}번 지정 중</span></div>
          <div className="canvas-wrap">
            {!pdfDoc && <div className="empty">{loadingRegisteredPdf ? "등록된 시험지 PDF를 불러오는 중입니다." : "등록된 시험지 PDF가 없습니다."}</div>}
            <canvas ref={canvasRef} className={!pdfDoc ? "hidden" : ""} />
            {pdfDoc && <div ref={overlayRef} className="overlay" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}>
              {pageRegions.map(r => <button key={r.number} className={`region ${r.number === activeNumber ? "active" : ""}`} style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setActiveNumber(r.number); }}>{r.number}</button>)}
              {draft && <div className="region draft" style={{ left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%` }} />}
            </div>}
          </div>
        </section>

        <aside className="preview-card">
          <div><span>문항 미리보기</span><h2>{activeNumber}번</h2><p>{activeRegion.w > 0 ? `${activeRegion.page}페이지에서 지정됨` : "아직 영역을 지정하지 않았습니다."}</p></div>
          <div className="preview-area">{previewUrl ? <img src={previewUrl} alt={`${activeNumber}번 문항 미리보기`} /> : <span>영역 지정 후 실제 잘린 문항이 표시됩니다.</span>}</div>
          <div className="coords"><span>X {activeRegion.x.toFixed(1)}%</span><span>Y {activeRegion.y.toFixed(1)}%</span><span>W {activeRegion.w.toFixed(1)}%</span><span>H {activeRegion.h.toFixed(1)}%</span></div>
        </aside>
      </div>

      <style jsx>{`
        *{box-sizing:border-box}.mapper-shell{min-height:100vh;background:#f4f6f9;padding:28px;color:#15171a;font-family:Arial,"Pretendard",sans-serif}.mapper-header{display:flex;justify-content:space-between;gap:24px;align-items:center;max-width:1600px;margin:0 auto 18px}.mapper-header span{font-size:12px;font-weight:800;letter-spacing:.12em;color:#89712e}.mapper-header h1{margin:5px 0 6px;font-size:30px}.mapper-header p{margin:0;color:#6d7279}.primary{border:0;background:#151515;color:#fff;border-radius:10px;padding:13px 20px;font-weight:800;cursor:pointer}.meta-card,.side-card,.viewer-card,.preview-card{background:#fff;border:1px solid #e2e5e9;border-radius:16px;box-shadow:0 5px 20px rgba(0,0,0,.05)}.meta-card{max-width:1600px;margin:0 auto 18px;padding:16px;display:grid;grid-template-columns:1fr 1fr 1.4fr 1.4fr;gap:12px}.meta-card label,.answer-editor label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:800}.meta-card input,.answer-editor input,.answer-editor select{height:42px;border:1px solid #d9dde2;border-radius:9px;padding:0 11px;background:#fff}.file-box input{display:none}.file-box span{height:42px;border:1px dashed #bfc4ca;border-radius:9px;display:flex;align-items:center;padding:0 11px;font-weight:500;color:#5e646b;cursor:pointer}.mapper-grid{max-width:1600px;margin:auto;display:grid;grid-template-columns:255px minmax(620px,1fr) 310px;gap:18px;align-items:start}.side-card,.preview-card{padding:17px;position:sticky;top:16px}.side-title{display:flex;justify-content:space-between;align-items:center}.side-title h2,.preview-card h2{margin:0}.side-title b{color:#8c742d}.check{font-size:12px;color:#60666d;display:flex;gap:7px;margin:13px 0}.number-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.number-grid button{height:34px;border:1px solid #dce0e5;background:#fff;border-radius:8px;font-weight:800;cursor:pointer}.number-grid button.done{border-color:#a88b35;background:#fff9e7}.number-grid button.active{background:#151515;color:#fff;border-color:#151515}.answer-editor{border-top:1px solid #eceef1;margin-top:16px;padding-top:15px}.answer-editor h3{margin:0 0 12px}.choices{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:10px 0}.choices button{height:34px;border:1px solid #d8dce1;background:#fff;border-radius:8px;font-weight:800}.choices button.active{background:#a88b35;color:#fff;border-color:#a88b35}.clear{width:100%;margin-top:12px;height:38px;border:1px solid #e0b5b5;background:#fff6f6;color:#a23d3d;border-radius:8px;font-weight:800;cursor:pointer}.viewer-card{overflow:hidden}.viewer-toolbar{height:55px;padding:0 15px;border-bottom:1px solid #e8eaed;display:flex;align-items:center;gap:10px}.viewer-toolbar button{border:1px solid #d8dce1;background:#fff;border-radius:8px;padding:7px 11px}.viewer-toolbar span{margin-left:auto;color:#8c742d;font-size:13px;font-weight:800}.canvas-wrap{position:relative;margin:16px auto;width:max-content;max-width:calc(100% - 32px);box-shadow:0 2px 14px rgba(0,0,0,.12);background:#fff}.canvas-wrap canvas{display:block;max-width:100%;height:auto}.canvas-wrap .hidden{display:none}.overlay{position:absolute;inset:0;cursor:crosshair;touch-action:none}.region{position:absolute;border:2px solid #b4912f;background:rgba(228,194,95,.14);color:#111;font-weight:900;display:flex;align-items:flex-start;justify-content:flex-start;padding:3px;cursor:pointer}.region.active{border-color:#e04444;background:rgba(224,68,68,.12)}.region.draft{pointer-events:none;border-style:dashed}.empty{height:700px;width:650px;display:flex;align-items:center;justify-content:center;color:#8a9097}.preview-card span{font-size:12px;color:#8c742d;font-weight:800}.preview-card p{font-size:13px;color:#757b82}.preview-area{min-height:270px;border:1px dashed #cfd4da;border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:auto;background:#fafafa}.preview-area img{max-width:100%;display:block}.preview-area span{padding:24px;text-align:center;color:#8b9198}.coords{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:12px}.coords span{background:#f3f4f6;padding:8px;border-radius:7px;color:#565c63}@media(max-width:1200px){.mapper-grid{grid-template-columns:230px 1fr}.preview-card{grid-column:1/-1;position:static}.meta-card{grid-template-columns:1fr 1fr}}@media(max-width:800px){.mapper-shell{padding:14px}.mapper-grid,.meta-card{grid-template-columns:1fr}.side-card,.preview-card{position:static}.mapper-header{align-items:flex-start}.empty{width:90vw}.viewer-toolbar span{display:none}}
      `}</style>
    </main>
  );
}
