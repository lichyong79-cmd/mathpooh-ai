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
  confidence?: number | null;
  review_reason?: string | null;
};

type Rect = { x: number; y: number; width: number; height: number };
type ViewMode = "single" | "all";

type PrepareResult = {
  success?: boolean;
  message?: string;
  analysisId?: string;
  sourceFileId?: string;
  pdfUrl?: string;
  questions?: CropQuestion[];
};

const MIN_CROP_SIZE = 0.8;
const PAGE_RENDER_WIDTH = 1050;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function hasCrop(question: CropQuestion) {
  return Number(question.crop_width) > 0 && Number(question.crop_height) > 0;
}

function questionRect(question: CropQuestion): Rect | null {
  if (!hasCrop(question)) return null;
  return {
    x: Number(question.crop_x ?? 0),
    y: Number(question.crop_y ?? 0),
    width: Number(question.crop_width ?? 0),
    height: Number(question.crop_height ?? 0),
  };
}

/**
 * AI가 잡은 넓은 박스 안에서 실제 잉크 픽셀만 찾아 흰 여백을 정리한다.
 * 수식·도형·보기 상자처럼 가는 선은 살리고, 단독 먼지 픽셀은 무시한다.
 */
function trimRectByPixels(canvas: HTMLCanvasElement, rect: Rect): Rect {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return rect;

  const sx = clamp(Math.floor(canvas.width * rect.x / 100), 0, canvas.width - 1);
  const sy = clamp(Math.floor(canvas.height * rect.y / 100), 0, canvas.height - 1);
  const sw = clamp(Math.ceil(canvas.width * rect.width / 100), 1, canvas.width - sx);
  const sh = clamp(Math.ceil(canvas.height * rect.height / 100), 1, canvas.height - sy);
  if (sw < 12 || sh < 12) return rect;

  const pixels = context.getImageData(sx, sy, sw, sh).data;
  const rowInk = new Uint32Array(sh);
  const colInk = new Uint32Array(sw);

  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const index = (y * sw + x) * 4;
      const alpha = pixels[index + 3];
      if (alpha < 20) continue;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      // 검정 글자뿐 아니라 연한 회색 표·그래프 선과 컬러 인쇄도 내용으로 인정한다.
      if (luminance < 244 || chroma > 18) {
        rowInk[y] += 1;
        colInk[x] += 1;
      }
    }
  }

  const rowThreshold = Math.max(2, Math.floor(sw * 0.0022));
  const colThreshold = Math.max(2, Math.floor(sh * 0.0022));
  const rowWindow = Math.max(2, Math.round(sh * 0.006));
  const colWindow = Math.max(2, Math.round(sw * 0.006));

  const hasDenseRowNear = (center: number) => {
    let total = 0;
    for (let y = Math.max(0, center - rowWindow); y <= Math.min(sh - 1, center + rowWindow); y += 1) total += rowInk[y];
    return total >= rowThreshold * Math.max(2, rowWindow);
  };
  const hasDenseColNear = (center: number) => {
    let total = 0;
    for (let x = Math.max(0, center - colWindow); x <= Math.min(sw - 1, center + colWindow); x += 1) total += colInk[x];
    return total >= colThreshold * Math.max(2, colWindow);
  };

  let top = 0;
  while (top < sh && !hasDenseRowNear(top)) top += 1;
  let bottom = sh - 1;
  while (bottom > top && !hasDenseRowNear(bottom)) bottom -= 1;
  let left = 0;
  while (left < sw && !hasDenseColNear(left)) left += 1;
  let right = sw - 1;
  while (right > left && !hasDenseColNear(right)) right -= 1;

  if (top >= bottom || left >= right) return rect;

  // 분수, 지수, 근호, 문항번호 및 선택지 끝이 잘리지 않도록 안전 여백을 둔다.
  const marginX = Math.max(8, Math.round(sw * 0.018));
  const marginTop = Math.max(9, Math.round(sh * 0.018));
  const marginBottom = Math.max(14, Math.round(sh * 0.028));
  left = Math.max(0, left - marginX);
  right = Math.min(sw - 1, right + marginX);
  top = Math.max(0, top - marginTop);
  bottom = Math.min(sh - 1, bottom + marginBottom);

  const absoluteX = sx + left;
  const absoluteY = sy + top;
  const absoluteRight = sx + right + 1;
  const absoluteBottom = sy + bottom + 1;

  return {
    x: absoluteX / canvas.width * 100,
    y: absoluteY / canvas.height * 100,
    width: (absoluteRight - absoluteX) / canvas.width * 100,
    height: (absoluteBottom - absoluteY) / canvas.height * 100,
  };
}

function cropCanvasToDataUrl(canvas: HTMLCanvasElement, rect: Rect, quality = 0.9) {
  const sx = Math.floor(canvas.width * rect.x / 100);
  const sy = Math.floor(canvas.height * rect.y / 100);
  const sw = Math.max(1, Math.ceil(canvas.width * rect.width / 100));
  const sh = Math.max(1, Math.ceil(canvas.height * rect.height / 100));
  const output = document.createElement("canvas");
  output.width = sw;
  output.height = sh;
  const context = output.getContext("2d");
  if (!context) return "";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, sw, sh);
  context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return output.toDataURL("image/webp", quality);
}

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
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [trimmedRects, setTrimmedRects] = useState<Record<string, Rect>>({});
  const [thumbnailProgress, setThumbnailProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const autoTrimmedRef = useRef(new Set<string>());

  const activeQuestion = useMemo(
    () => questions.find((question) => question.question_no === activeNo) ?? null,
    [questions, activeNo],
  );

  const reviewCount = useMemo(
    () => questions.filter((question) => Boolean(question.review_reason) || Number(question.confidence ?? 1) < 0.82).length,
    [questions],
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
        setQuestions((result.questions ?? []).sort((a, b) => a.question_no - b.question_no));

        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
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
    const trimmed = trimmedRects[activeQuestion.id];
    const saved = trimmed ?? questionRect(activeQuestion);
    if (saved) {
      setPageNo(Math.max(1, Number(activeQuestion.page_no ?? 1)));
      setSelection(saved);
    } else {
      setSelection(null);
      setPreview("");
    }
  }, [activeQuestion, trimmedRects]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || viewMode !== "single") return;
    let cancelled = false;
    void (async () => {
      const page = await pdfDoc.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(PAGE_RENDER_WIDTH, Math.max(620, window.innerWidth - 520));
      const viewport = page.getViewport({ scale: targetWidth / base.width });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      if (cancelled) return;

      let nextRect = selection;
      if (activeQuestion && activeQuestion.page_no === pageNo && nextRect && !autoTrimmedRef.current.has(activeQuestion.id)) {
        nextRect = trimRectByPixels(canvas, nextRect);
        autoTrimmedRef.current.add(activeQuestion.id);
        setTrimmedRects((current) => ({ ...current, [activeQuestion.id]: nextRect as Rect }));
        setSelection(nextRect);
      }
      updatePreview(nextRect);
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNo, viewMode, activeQuestion?.id]);

  useEffect(() => { updatePreview(selection); }, [selection]);

  useEffect(() => {
    if (viewMode !== "all" || !pdfDoc || !questions.length) return;
    let cancelled = false;

    void (async () => {
      setThumbnailProgress(0);
      const pageCache = new Map<number, HTMLCanvasElement>();
      const nextThumbs: Record<string, string> = {};
      const nextRects: Record<string, Rect> = {};

      for (let index = 0; index < questions.length; index += 1) {
        if (cancelled) return;
        const question = questions[index];
        const rawRect = trimmedRects[question.id] ?? questionRect(question);
        const qPageNo = Math.max(1, Number(question.page_no ?? 1));
        if (!rawRect) {
          setThumbnailProgress(index + 1);
          continue;
        }

        let pageCanvas = pageCache.get(qPageNo);
        if (!pageCanvas) {
          const page = await pdfDoc.getPage(qPageNo);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: 900 / base.width });
          pageCanvas = document.createElement("canvas");
          pageCanvas.width = Math.ceil(viewport.width);
          pageCanvas.height = Math.ceil(viewport.height);
          const context = pageCanvas.getContext("2d", { willReadFrequently: true });
          if (!context) continue;
          await page.render({ canvas: pageCanvas, canvasContext: context, viewport }).promise;
          pageCache.set(qPageNo, pageCanvas);
        }

        const trimmed = trimRectByPixels(pageCanvas, rawRect);
        nextRects[question.id] = trimmed;
        nextThumbs[question.id] = cropCanvasToDataUrl(pageCanvas, trimmed, 0.82);
        setThumbnailProgress(index + 1);
      }

      if (!cancelled) {
        setTrimmedRects((current) => ({ ...current, ...nextRects }));
        setThumbnails(nextThumbs);
      }
    })();

    return () => { cancelled = true; };
  }, [viewMode, pdfDoc, questions]);

  function pointerPosition(event: PointerEvent<HTMLDivElement>) {
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
      y: clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
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
    if (draft && draft.width >= MIN_CROP_SIZE && draft.height >= MIN_CROP_SIZE) {
      setSelection(draft);
      if (activeQuestion) {
        autoTrimmedRef.current.add(activeQuestion.id);
        setTrimmedRects((current) => ({ ...current, [activeQuestion.id]: draft }));
      }
    }
    setDraft(null);
    startRef.current = null;
  }

  function updatePreview(rect: Rect | null) {
    const canvas = canvasRef.current;
    if (!canvas || !rect || rect.width <= 0 || rect.height <= 0) {
      setPreview("");
      return;
    }
    setPreview(cropCanvasToDataUrl(canvas, rect, 0.92));
  }

  async function autoTrimCurrent() {
    if (!activeQuestion || !selection || !canvasRef.current) return;
    setTrimming(true);
    try {
      const trimmed = trimRectByPixels(canvasRef.current, selection);
      autoTrimmedRef.current.add(activeQuestion.id);
      setTrimmedRects((current) => ({ ...current, [activeQuestion.id]: trimmed }));
      setSelection(trimmed);
      setMessage(`${activeNo}번 문항의 흰 여백을 자동 정리했습니다.`);
    } finally {
      setTrimming(false);
    }
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
      setThumbnails((current) => ({ ...current, [activeQuestion.id]: preview }));
      setMessage(`${activeNo}번 문항 이미지를 저장했습니다.`);
      const next = questions.find((question) => question.question_no > activeNo);
      if (next) setActiveNo(next.question_no);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문항 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function openQuestion(question: CropQuestion) {
    setActiveNo(question.question_no);
    setViewMode("single");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="crop-page">
      <header>
        <div><small>AI ANALYSIS · CROP REVIEW</small><h1>문항 영역 검수</h1><p>AI 영역을 픽셀로 정리하고, 전체 결과에서 이상한 문항만 골라 수정하세요.</p></div>
        <div className="header-buttons">
          <div className="mode-switch">
            <button className={viewMode === "single" ? "selected-mode" : ""} onClick={() => setViewMode("single")}>한 문항 보기</button>
            <button className={viewMode === "all" ? "selected-mode" : ""} onClick={() => setViewMode("all")}>전체 잘린 결과</button>
          </div>
          <button onClick={() => { window.location.href = "/problem-bank/ai-upload"; }}>AI 분석 작업장으로</button>
          {viewMode === "single" ? <button className="primary" onClick={() => void saveQuestion()} disabled={saving}>{saving ? "저장 중..." : `${activeNo}번 저장`}</button> : null}
        </div>
      </header>

      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      {viewMode === "all" ? (
        <section className="all-view">
          <div className="all-summary">
            <div><b>전체 {questions.length}문항</b><span>AI 재확인 권장 {reviewCount}문항</span></div>
            <div>{thumbnailProgress < questions.length ? `픽셀 여백 정리 중 ${thumbnailProgress}/${questions.length}` : "전체 미리보기 준비 완료"}</div>
          </div>
          <div className="thumbnail-grid">
            {questions.map((question) => {
              const needsReview = Boolean(question.review_reason) || Number(question.confidence ?? 1) < 0.82;
              return (
                <button key={question.id} className={`thumbnail-card ${needsReview ? "needs-review" : ""} ${question.question_image_path ? "saved-card" : ""}`} onClick={() => openQuestion(question)}>
                  <div className="thumb-head"><b>{question.question_no}번</b><span>{needsReview ? "확인" : question.question_image_path ? "저장" : "자동"}</span></div>
                  <div className="thumb-image">
                    {thumbnails[question.id] ? <img src={thumbnails[question.id]} alt={`${question.question_no}번 잘린 결과`} /> : <em>{hasCrop(question) ? "이미지 생성 중" : "영역 없음"}</em>}
                  </div>
                  {question.review_reason ? <p>{question.review_reason}</p> : null}
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="workspace">
          <aside className="questions">
            <h2>문항 번호</h2>
            <div className="number-grid">{questions.map((question) => (
              <button key={question.id} className={`${question.question_no === activeNo ? "active" : ""} ${question.question_image_path ? "saved" : ""} ${(Boolean(question.review_reason) || Number(question.confidence ?? 1) < 0.82) ? "warn" : ""}`} onClick={() => setActiveNo(question.question_no)}>
                {question.question_no}
              </button>
            ))}</div>
            <div className="legend"><span><i className="saved-dot" />저장 완료</span><span><i className="active-dot" />현재 문항</span><span><i className="warn-dot" />확인 권장</span></div>
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
            <button className="trim-button" onClick={() => void autoTrimCurrent()} disabled={trimming || !selection}>{trimming ? "정리 중..." : "흰 여백 자동 정리"}</button>
            <button className="save-button" onClick={() => void saveQuestion()} disabled={saving || !selection}>{saving ? "저장 중..." : "문항 이미지 저장"}</button>
            <button className="reset-button" onClick={() => {
              setSelection(null);
              setPreview("");
              if (activeQuestion) {
                autoTrimmedRef.current.add(activeQuestion.id);
                setTrimmedRects((current) => {
                  const next = { ...current };
                  delete next[activeQuestion.id];
                  return next;
                });
              }
            }}>영역 다시 선택</button>
          </aside>
        </section>
      )}

      <style jsx>{`
        *{box-sizing:border-box}.crop-page{min-height:100vh;background:#f4f6fa;padding:22px;font-family:Arial,"Pretendard",sans-serif;color:#202433}header{max-width:1750px;margin:0 auto 16px;display:flex;justify-content:space-between;align-items:center;gap:20px}header small{font-weight:900;color:#5268e8}header h1{margin:5px 0;font-size:30px}header p{margin:0;color:#727b8d}.header-buttons{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.header-buttons button,.toolbar button{border:1px solid #d7dce7;background:white;border-radius:10px;padding:11px 16px;font-weight:800}.header-buttons .primary{background:#5268e8;color:white;border-color:#5268e8}.mode-switch{display:flex;background:#e9edf7;border-radius:11px;padding:3px}.mode-switch button{border:0;background:transparent;padding:8px 12px}.mode-switch .selected-mode{background:#fff;color:#4258d7;box-shadow:0 2px 8px rgba(35,49,91,.12)}.notice{max-width:1750px;margin:0 auto 12px;padding:12px 15px;border-radius:10px;font-weight:800}.notice.success{background:#eaf8f1;color:#257b5c}.notice.error{background:#fff0f0;color:#ad3c3c}.workspace{max-width:1750px;margin:auto;display:grid;grid-template-columns:235px minmax(600px,1fr) 330px;gap:15px;align-items:start}.questions,.viewer,.preview,.all-view{background:#fff;border:1px solid #dfe4ee;border-radius:15px}.questions,.preview{padding:16px;position:sticky;top:12px}.questions h2,.preview h2{font-size:18px;margin:0 0 14px}.number-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.number-grid button{height:38px;border:1px solid #dce1eb;background:#fff;border-radius:8px;font-weight:900}.number-grid button.saved{background:#eaf8f1;border-color:#a8d8c5;color:#267b5c}.number-grid button.warn{box-shadow:inset 0 0 0 2px #f0ad4e}.number-grid button.active{background:#5268e8;border-color:#5268e8;color:white;box-shadow:none}.legend{display:grid;gap:8px;margin-top:16px;font-size:13px;color:#747d8e}.legend span{display:flex;align-items:center;gap:7px}.legend i{width:11px;height:11px;border-radius:50%}.saved-dot{background:#65b494}.active-dot{background:#5268e8}.warn-dot{background:#f0ad4e}.viewer{overflow:hidden}.toolbar{height:55px;border-bottom:1px solid #e5e9f0;padding:0 14px;display:flex;gap:10px;align-items:center}.toolbar span{margin-left:auto;color:#5268e8;font-weight:900}.canvas-shell{position:relative;width:min(100%,1050px);margin:14px auto;background:white}.canvas-shell canvas{display:block;width:100%;height:auto}.loading{height:500px;display:grid;place-items:center;color:#7b8495}.overlay{position:absolute;inset:0;cursor:crosshair;touch-action:none}.box{position:absolute;pointer-events:none;border:2px solid #e04343;background:rgba(224,67,67,.1)}.box.selected b{position:absolute;left:-2px;top:-25px;background:#e04343;color:white;padding:3px 8px;border-radius:6px 6px 0 0}.box.draft{border-style:dashed;background:rgba(82,104,232,.08);border-color:#5268e8}.preview-image{min-height:310px;max-height:620px;overflow:auto;border:1px dashed #cbd2df;border-radius:10px;background:#fafbfd;display:grid;place-items:center;color:#7c8494}.preview-image img{display:block;max-width:100%}.save-button,.reset-button,.trim-button{width:100%;height:44px;border-radius:9px;font-weight:900;margin-top:10px}.save-button{border:0;background:#5268e8;color:white}.trim-button{border:1px solid #8ca0f1;background:#eef1ff;color:#4258d7}.save-button:disabled,.trim-button:disabled{opacity:.45}.reset-button{border:1px solid #d8dde8;background:#fff;color:#555f73}.all-view{max-width:1750px;margin:auto;padding:18px}.all-summary{display:flex;justify-content:space-between;gap:15px;align-items:center;padding:2px 2px 16px;color:#657087}.all-summary div:first-child{display:flex;gap:18px;align-items:center}.all-summary b{font-size:20px;color:#202433}.thumbnail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.thumbnail-card{text-align:left;border:1px solid #dfe4ee;background:#fff;border-radius:13px;padding:0;overflow:hidden;cursor:pointer;transition:.16s transform,.16s box-shadow}.thumbnail-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(44,56,95,.12)}.thumbnail-card.needs-review{border:2px solid #efa43d}.thumbnail-card.saved-card .thumb-head span{background:#e8f7f0;color:#23765a}.thumb-head{height:43px;padding:0 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #edf0f5}.thumb-head span{font-size:12px;font-weight:900;padding:4px 8px;border-radius:999px;background:#eef1ff;color:#4258d7}.needs-review .thumb-head span{background:#fff1dd;color:#a76100}.thumb-image{height:270px;background:#f8f9fc;display:grid;place-items:center;overflow:auto;padding:8px}.thumb-image img{display:block;max-width:100%;max-height:100%;object-fit:contain}.thumb-image em{font-style:normal;color:#8b94a5}.thumbnail-card p{margin:0;padding:9px 12px;font-size:12px;color:#a76100;border-top:1px solid #f1e0c6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:1350px){.thumbnail-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:1250px){.workspace{grid-template-columns:210px minmax(0,1fr)}.preview{grid-column:1/-1;position:static}.preview-image{min-height:220px}}@media(max-width:900px){.thumbnail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.crop-page{padding:10px}header{align-items:flex-start;flex-direction:column}.workspace{grid-template-columns:1fr}.questions{position:static}.number-grid{grid-template-columns:repeat(6,1fr)}.toolbar span{display:none}.thumbnail-grid{grid-template-columns:1fr}.all-summary{align-items:flex-start;flex-direction:column}}
      `}</style>
    </main>
  );
}
