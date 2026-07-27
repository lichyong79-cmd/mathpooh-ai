"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";

type CropQuestion = {
  id: string;
  question_no: number;
  page_no: number | null;
  crop_x: number | null;
  crop_y: number | null;
  crop_width: number | null;
  crop_height: number | null;
  question_image_path?: string | null;
};

type Rect = { x: number; y: number; width: number; height: number };

type PrepareResult = {
  success?: boolean;
  message?: string;
  analysisId?: string;
  sourceFileId?: string;
  pdfUrl?: string;
  questions?: CropQuestion[];
};

export default function QuestionCropPage() {
  const [analysisId, setAnalysisId] = useState("");
  const [sourceFileId, setSourceFileId] = useState("");
  const [questions, setQuestions] = useState<CropQuestion[]>([]);
  const [activeNo, setActiveNo] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNo, setPageNo] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const activeQuestion = useMemo(
    () => questions.find((question) => question.question_no === activeNo) ?? null,
    [questions, activeNo],
  );

  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const source = params.get("sourceFileId") ?? "";
      const initialNo = Math.max(1, Number(params.get("questionNo") ?? 1));
      if (!source) {
        setError("시험지 ID가 없습니다.");
        setLoading(false);
        return;
      }

      setActiveNo(initialNo);
      setSourceFileId(source);
      try {
        const response = await fetch("/api/problem-bank/materialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceFileId: source, allowEmptyCrop: true }),
        });
        const result = await response.json() as PrepareResult;
        if (!response.ok || !result.success || !result.pdfUrl || !result.analysisId) {
          throw new Error(result.message || "시험지를 불러오지 못했습니다.");
        }

        setAnalysisId(result.analysisId);
        setQuestions(result.questions ?? []);

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const bytes = new Uint8Array(await (await fetch(result.pdfUrl, { cache: "no-store" })).arrayBuffer());
        const document = await pdfjs.getDocument({ data: bytes }).promise;
        setPdfDoc(document);
        setPageCount(document.numPages);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "시험지를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeQuestion) return;
    const saved = Number(activeQuestion.crop_width) > 0 && Number(activeQuestion.crop_height) > 0;
    if (saved) {
      setPageNo(Math.max(1, Number(activeQuestion.page_no ?? 1)));
      setSelection({
        x: Number(activeQuestion.crop_x ?? 0),
        y: Number(activeQuestion.crop_y ?? 0),
        width: Number(activeQuestion.crop_width ?? 0),
        height: Number(activeQuestion.crop_height ?? 0),
      });
    } else {
      setSelection(null);
      setPreview("");
    }
  }, [activeQuestion]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    void (async () => {
      const page = await pdfDoc.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(1050, Math.max(620, window.innerWidth - 520));
      const viewport = page.getViewport({ scale: targetWidth / base.width });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      if (!cancelled) updatePreview(selection);
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNo]);

  useEffect(() => { updatePreview(selection); }, [selection]);

  function pointerPosition(event: PointerEvent<HTMLDivElement>) {
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)),
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const point = pointerPosition(event);
    startRef.current = point;
    setDraft({ x: point.x, y: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return;
    const point = pointerPosition(event);
    setDraft({
      x: Math.min(startRef.current.x, point.x),
      y: Math.min(startRef.current.y, point.y),
      width: Math.abs(point.x - startRef.current.x),
      height: Math.abs(point.y - startRef.current.y),
    });
  }

  function handlePointerUp() {
    if (draft && draft.width >= 1 && draft.height >= 1) setSelection(draft);
    setDraft(null);
    startRef.current = null;
  }

  function updatePreview(rect: Rect | null) {
    const canvas = canvasRef.current;
    if (!canvas || !rect || rect.width <= 0 || rect.height <= 0) {
      setPreview("");
      return;
    }
    const sx = Math.floor(canvas.width * rect.x / 100);
    const sy = Math.floor(canvas.height * rect.y / 100);
    const sw = Math.max(1, Math.ceil(canvas.width * rect.width / 100));
    const sh = Math.max(1, Math.ceil(canvas.height * rect.height / 100));
    const output = document.createElement("canvas");
    output.width = sw;
    output.height = sh;
    const context = output.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, sw, sh);
    context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    setPreview(output.toDataURL("image/webp", 0.92));
  }

  async function saveQuestion() {
    if (!activeQuestion || !selection || !preview) {
      setError("시험지에서 문항 영역을 먼저 드래그해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const blob = await (await fetch(preview)).blob();
      const form = new FormData();
      form.append("image", blob, `${String(activeNo).padStart(3, "0")}.webp`);
      form.append("analysisId", analysisId);
      form.append("sourceFileId", sourceFileId);
      form.append("questionId", activeQuestion.id);
      form.append("questionNo", String(activeNo));
      form.append("pageNo", String(pageNo));
      form.append("cropX", String(selection.x));
      form.append("cropY", String(selection.y));
      form.append("cropWidth", String(selection.width));
      form.append("cropHeight", String(selection.height));

      const response = await fetch("/api/problem-bank/materialize", { method: "POST", body: form });
      const result = await response.json() as { success?: boolean; message?: string; path?: string };
      if (!response.ok || !result.success) throw new Error(result.message || "문항 저장에 실패했습니다.");

      setQuestions((current) => current.map((question) => question.id === activeQuestion.id ? {
        ...question,
        page_no: pageNo,
        crop_x: selection.x,
        crop_y: selection.y,
        crop_width: selection.width,
        crop_height: selection.height,
        question_image_path: result.path ?? question.question_image_path,
      } : question));
      setMessage(`${activeNo}번 문항 이미지를 저장했습니다.`);
      const next = questions.find((question) => question.question_no > activeNo);
      if (next) setActiveNo(next.question_no);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문항 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="crop-page">
      <header>
        <div><small>AI ANALYSIS · CROP REVIEW</small><h1>문항 영역 검수</h1><p>AI가 잡은 영역을 확인하고, 잘못된 문항만 다시 드래그해 수정하세요.</p></div>
        <div className="header-buttons"><button onClick={() => { window.location.href = "/problem-bank/ai-upload"; }}>AI 분석 작업장으로</button><button className="primary" onClick={() => void saveQuestion()} disabled={saving}>{saving ? "저장 중..." : `${activeNo}번 저장`}</button></div>
      </header>

      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="workspace">
        <aside className="questions">
          <h2>문항 번호</h2>
          <div className="number-grid">{questions.map((question) => (
            <button key={question.id} className={`${question.question_no === activeNo ? "active" : ""} ${question.question_image_path ? "saved" : ""}`} onClick={() => setActiveNo(question.question_no)}>
              {question.question_no}
            </button>
          ))}</div>
          <div className="legend"><span><i className="saved-dot" />저장 완료</span><span><i className="active-dot" />현재 문항</span></div>
        </aside>

        <section className="viewer">
          <div className="toolbar"><button disabled={pageNo <= 1} onClick={() => setPageNo((value) => value - 1)}>이전 페이지</button><b>{pageCount ? `${pageNo} / ${pageCount}` : "PDF 로딩"}</b><button disabled={!pageCount || pageNo >= pageCount} onClick={() => setPageNo((value) => value + 1)}>다음 페이지</button><span>{activeNo}번 영역을 드래그</span></div>
          <div className="canvas-shell">
            {loading ? <div className="loading">시험지를 불러오는 중입니다.</div> : null}
            <canvas ref={canvasRef} />
            {pdfDoc ? <div ref={overlayRef} className="overlay" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
              {selection ? <div className="box selected" style={{ left: `${selection.x}%`, top: `${selection.y}%`, width: `${selection.width}%`, height: `${selection.height}%` }}><b>{activeNo}</b></div> : null}
              {draft ? <div className="box draft" style={{ left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.width}%`, height: `${draft.height}%` }} /> : null}
            </div> : null}
          </div>
        </section>

        <aside className="preview">
          <h2>{activeNo}번 미리보기</h2>
          <div className="preview-image">{preview ? <img src={preview} alt={`${activeNo}번 문항 미리보기`} /> : <span>시험지에서 문항을 드래그하세요.</span>}</div>
          <button className="save-button" onClick={() => void saveQuestion()} disabled={saving || !selection}>{saving ? "저장 중..." : "문항 이미지 저장"}</button>
          <button className="reset-button" onClick={() => { setSelection(null); setPreview(""); }}>영역 다시 선택</button>
        </aside>
      </section>

      <style jsx>{`
        *{box-sizing:border-box}.crop-page{min-height:100vh;background:#f4f6fa;padding:22px;font-family:Arial,"Pretendard",sans-serif;color:#202433}header{max-width:1750px;margin:0 auto 16px;display:flex;justify-content:space-between;align-items:center;gap:20px}header small{font-weight:900;color:#5268e8}header h1{margin:5px 0;font-size:30px}header p{margin:0;color:#727b8d}.header-buttons{display:flex;gap:9px}.header-buttons button,.toolbar button{border:1px solid #d7dce7;background:white;border-radius:10px;padding:11px 16px;font-weight:800}.header-buttons .primary{background:#5268e8;color:white;border-color:#5268e8}.notice{max-width:1750px;margin:0 auto 12px;padding:12px 15px;border-radius:10px;font-weight:800}.notice.success{background:#eaf8f1;color:#257b5c}.notice.error{background:#fff0f0;color:#ad3c3c}.workspace{max-width:1750px;margin:auto;display:grid;grid-template-columns:235px minmax(600px,1fr) 330px;gap:15px;align-items:start}.questions,.viewer,.preview{background:#fff;border:1px solid #dfe4ee;border-radius:15px}.questions,.preview{padding:16px;position:sticky;top:12px}.questions h2,.preview h2{font-size:18px;margin:0 0 14px}.number-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.number-grid button{height:38px;border:1px solid #dce1eb;background:#fff;border-radius:8px;font-weight:900}.number-grid button.saved{background:#eaf8f1;border-color:#a8d8c5;color:#267b5c}.number-grid button.active{background:#5268e8;border-color:#5268e8;color:white}.legend{display:grid;gap:8px;margin-top:16px;font-size:13px;color:#747d8e}.legend span{display:flex;align-items:center;gap:7px}.legend i{width:11px;height:11px;border-radius:50%}.saved-dot{background:#65b494}.active-dot{background:#5268e8}.viewer{overflow:hidden}.toolbar{height:55px;border-bottom:1px solid #e5e9f0;padding:0 14px;display:flex;gap:10px;align-items:center}.toolbar span{margin-left:auto;color:#5268e8;font-weight:900}.canvas-shell{position:relative;width:min(100%,1050px);margin:14px auto;background:white}.canvas-shell canvas{display:block;width:100%;height:auto}.loading{height:500px;display:grid;place-items:center;color:#7b8495}.overlay{position:absolute;inset:0;cursor:crosshair;touch-action:none}.box{position:absolute;pointer-events:none;border:2px solid #e04343;background:rgba(224,67,67,.1)}.box.selected b{position:absolute;left:-2px;top:-25px;background:#e04343;color:white;padding:3px 8px;border-radius:6px 6px 0 0}.box.draft{border-style:dashed;background:rgba(82,104,232,.08);border-color:#5268e8}.preview-image{min-height:310px;max-height:620px;overflow:auto;border:1px dashed #cbd2df;border-radius:10px;background:#fafbfd;display:grid;place-items:center;color:#7c8494}.preview-image img{display:block;max-width:100%}.save-button,.reset-button{width:100%;height:44px;border-radius:9px;font-weight:900;margin-top:10px}.save-button{border:0;background:#5268e8;color:white}.save-button:disabled{opacity:.45}.reset-button{border:1px solid #d8dde8;background:#fff;color:#555f73}@media(max-width:1250px){.workspace{grid-template-columns:210px minmax(0,1fr)}.preview{grid-column:1/-1;position:static}.preview-image{min-height:220px}}@media(max-width:760px){.crop-page{padding:10px}header{align-items:flex-start;flex-direction:column}.workspace{grid-template-columns:1fr}.questions{position:static}.number-grid{grid-template-columns:repeat(6,1fr)}.toolbar span{display:none}}
      `}</style>
    </main>
  );
}
