"use client";

import {
  FormEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SourceFile = {
  id: string;
  created_at: string;
  title: string;
  source: string | null;
  grade: string | null;
  subject: string | null;
  status: string;
  error_message: string | null;
};

type Analysis = {
  id: string;
  status: string;
  progress: number | null;
  current_step: string | null;
  total_questions: number | null;
} | null;

type Question = {
  id: string;
  question_no: number;
  page_no: number | null;
  answer: string | null;
  status: string;
  confidence: number | null;
  ai_result: Record<string, unknown> | null;
  review_result: Record<string, unknown> | null;
  crop_x: number | null;
  crop_y: number | null;
  crop_width: number | null;
  crop_height: number | null;
  question_image_path: string | null;
};

type Workspace = {
  source: SourceFile;
  analysis: Analysis;
  questions: Question[];
  examUrl: string | null;
  solutionUrl: string | null;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const statusText: Record<string, string> = {
  uploaded: "업로드 완료",
  PENDING: "분석 대기",
  WAITING: "분석 대기",
  RUNNING: "AI 분석 중",
  REVIEW: "검수 필요",
  APPROVED: "검수 완료",
  AUTO_REGISTERED: "자동 등록",
  DONE: "분석 완료",
  FAILED: "분석 실패",
  completed: "분석 완료",
};

function valueOf(question: Question, key: string) {
  const review = question.review_result ?? {};
  const ai = question.ai_result ?? {};
  return String(review[key] ?? ai[key] ?? "");
}

function hasValidCrop(question: Question | null) {
  if (!question) return false;
  return (
    Number(question.page_no) >= 1 &&
    Number(question.crop_width) > 0 &&
    Number(question.crop_height) > 0
  );
}

export default function AnalysisWorkspacePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [sources, setSources] = useState<SourceFile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState("");

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNo, setPageNo] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [preview, setPreview] = useState("");

  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("저장됨");
  const [aiHealth, setAiHealth] = useState<{ checking: boolean; success: boolean | null; message: string; model?: string }>({
    checking: false,
    success: null,
    message: "AI 연결 확인 전",
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const questions = workspace?.questions ?? [];
  const activeQuestion =
    questions.find((item) => item.id === activeQuestionId) ?? questions[0] ?? null;


  const checkAiHealth = useCallback(async () => {
    setAiHealth((current) => ({ ...current, checking: true, message: "AI 연결 확인 중..." }));
    try {
      const response = await fetch("/api/analysis/health", { cache: "no-store" });
      const payload = await response.json();
      setAiHealth({
        checking: false,
        success: Boolean(response.ok && payload.success),
        message: payload.message || (response.ok ? "AI 연결 정상" : "AI 연결 실패"),
        model: payload.model,
      });
    } catch (caught) {
      setAiHealth({
        checking: false,
        success: false,
        message: caught instanceof Error ? caught.message : "AI 연결 확인 실패",
      });
    }
  }, []);

  const loadSources = useCallback(async () => {
    const result = await supabase
      .from("source_files")
      .select("id,created_at,title,source,grade,subject,status,error_message")
      .order("created_at", { ascending: false });

    if (result.error) throw result.error;
    const rows = (result.data ?? []) as SourceFile[];
    setSources(rows);
    return rows;
  }, [supabase]);

  const loadWorkspace = useCallback(async (sourceId: string) => {
    if (!sourceId) return;
    setBusy("load");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/analysis/source/${sourceId}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "분석화면을 불러오지 못했습니다.");
      }

      const nextWorkspace = payload as Workspace & { success: true };
      setWorkspace(nextWorkspace);
      setSelectedId(sourceId);
      setActiveQuestionId(nextWorkspace.questions?.[0]?.id ?? "");
    } catch (caught) {
      setWorkspace(null);
      setPdfDoc(null);
      setError(
        caught instanceof Error ? caught.message : "분석화면을 불러오지 못했습니다.",
      );
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    void checkAiHealth();
    void (async () => {
      try {
        const rows = await loadSources();
        if (rows.length > 0) await loadWorkspace(rows[0].id);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "시험지 목록을 불러오지 못했습니다.",
        );
      }
    })();
  }, [checkAiHealth, loadSources, loadWorkspace]);

  useEffect(() => {
    if (!workspace?.examUrl) {
      setPdfDoc(null);
      setPageCount(0);
      return;
    }

    let cancelled = false;
    setBusy("pdf");
    setError("");

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const response = await fetch(workspace.examUrl!, { cache: "no-store" });
        if (!response.ok) throw new Error("시험지 PDF를 불러오지 못했습니다.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const document = await pdfjs.getDocument({ data: bytes }).promise;

        if (!cancelled) {
          setPdfDoc(document);
          setPageCount(document.numPages);
        }
      } catch (caught) {
        if (!cancelled) {
          setPdfDoc(null);
          setPageCount(0);
          setError(caught instanceof Error ? caught.message : "PDF를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setBusy((current) => (current === "pdf" ? "" : current));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspace?.examUrl]);

  useEffect(() => {
    if (!activeQuestion) {
      setSelection(null);
      setPreview("");
      return;
    }

    if (hasValidCrop(activeQuestion)) {
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

  const updatePreview = useCallback((rect: Rect | null) => {
    const canvas = canvasRef.current;
    if (!canvas || !rect || rect.width <= 0 || rect.height <= 0) {
      setPreview("");
      return;
    }

    const sx = Math.floor((canvas.width * rect.x) / 100);
    const sy = Math.floor((canvas.height * rect.y) / 100);
    const sw = Math.max(1, Math.ceil((canvas.width * rect.width) / 100));
    const sh = Math.max(1, Math.ceil((canvas.height * rect.height) / 100));

    const output = document.createElement("canvas");
    output.width = sw;
    output.height = sh;
    const context = output.getContext("2d");
    if (!context) return;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, sw, sh);
    context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    setPreview(output.toDataURL("image/webp", 0.92));
  }, []);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    void (async () => {
      try {
        const page = await pdfDoc.getPage(pageNo);
        const base = page.getViewport({ scale: 1 });
        const targetWidth = Math.min(1050, Math.max(650, window.innerWidth - 760));
        const viewport = page.getViewport({ scale: targetWidth / base.width });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (!cancelled) updatePreview(selection);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "PDF 페이지를 표시하지 못했습니다.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNo, selection, updatePreview]);

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

  async function startAnalysis() {
    if (!workspace) return;
    setBusy("analysis");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/analysis/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFileId: workspace.source.id }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "AI 분석에 실패했습니다.");
      }

      setMessage(`AI 분석 완료 · ${payload.questionCount ?? 0}문항`);
      await loadWorkspace(workspace.source.id);
      await loadSources();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 분석에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function saveCrop() {
    if (!workspace?.analysis?.id || !activeQuestion || !selection || !preview) {
      setError("시험지에서 문항 영역을 먼저 드래그해 주세요.");
      return;
    }

    setBusy("crop");
    setError("");
    setMessage("");

    try {
      const blob = await (await fetch(preview)).blob();
      const form = new FormData();
      form.append("image", blob, `${String(activeQuestion.question_no).padStart(3, "0")}.webp`);
      form.append("analysisId", workspace.analysis.id);
      form.append("sourceFileId", workspace.source.id);
      form.append("questionId", activeQuestion.id);
      form.append("questionNo", String(activeQuestion.question_no));
      form.append("pageNo", String(pageNo));
      form.append("cropX", String(selection.x));
      form.append("cropY", String(selection.y));
      form.append("cropWidth", String(selection.width));
      form.append("cropHeight", String(selection.height));

      const response = await fetch("/api/problem-bank/materialize", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "문항 이미지 저장에 실패했습니다.");
      }

      setWorkspace((current) =>
        current
          ? {
              ...current,
              questions: current.questions.map((item) =>
                item.id === activeQuestion.id
                  ? {
                      ...item,
                      page_no: pageNo,
                      crop_x: selection.x,
                      crop_y: selection.y,
                      crop_width: selection.width,
                      crop_height: selection.height,
                      question_image_path: payload.path ?? item.question_image_path,
                    }
                  : item,
              ),
            }
          : current,
      );
      setMessage(`${activeQuestion.question_no}번 문항 이미지 저장 완료`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문항 이미지 저장에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeQuestion) return;

    const form = new FormData(event.currentTarget);
    const previousReview = activeQuestion.review_result ?? {};
    const reviewResult = {
      ...previousReview,
      question_type: String(form.get("question_type") ?? "unknown"),
      subject: String(form.get("subject") ?? ""),
      unit: String(form.get("unit") ?? ""),
      topic: String(form.get("topic") ?? ""),
      difficulty: String(form.get("difficulty") ?? "중"),
      summary: String(form.get("summary") ?? ""),
    };

    setSaveState("저장 중...");
    setBusy("save");
    setError("");

    try {
      const response = await fetch(`/api/analysis/questions/${activeQuestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer: String(form.get("answer") ?? ""),
          page_no: Number(form.get("page_no") ?? pageNo),
          review_result: reviewResult,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "문항 저장에 실패했습니다.");
      }

      setWorkspace((current) =>
        current
          ? {
              ...current,
              questions: current.questions.map((item) =>
                item.id === activeQuestion.id ? payload.question : item,
              ),
            }
          : current,
      );
      setSaveState("저장됨");
      setMessage(`${activeQuestion.question_no}번 분석 결과 저장 완료`);
    } catch (caught) {
      setSaveState("저장 실패");
      setError(caught instanceof Error ? caught.message : "문항 저장에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function analyzeOneQuestion() {
    if (!activeQuestion) return;
    setBusy("one");
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/analysis/questions/${activeQuestion.id}/analyze`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "문항 분석에 실패했습니다.");
      }

      setWorkspace((current) =>
        current
          ? {
              ...current,
              questions: current.questions.map((item) =>
                item.id === activeQuestion.id ? payload.question : item,
              ),
            }
          : current,
      );
      setMessage(`${activeQuestion.question_no}번 문항 재분석 완료`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문항 분석에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  function moveQuestion(direction: -1 | 1) {
    if (!activeQuestion) return;
    const currentIndex = questions.findIndex((item) => item.id === activeQuestion.id);
    const next = questions[currentIndex + direction];
    if (next) setActiveQuestionId(next.id);
  }

  const analysisStatus = workspace?.analysis?.status ?? workspace?.source.status ?? "uploaded";
  const progress = Math.max(0, Math.min(100, Number(workspace?.analysis?.progress ?? 0)));
  const croppedCount = questions.filter((question) => hasValidCrop(question)).length;

  return (
    <main className="analysis-page">
      <header className="page-header">
        <div>
          <button className="back-button" onClick={() => router.push("/problem-bank")}>← 문제은행</button>
          <small>AI ANALYSIS WORKSPACE</small>
          <h1>AI 문항 분석 · 자르기 검수</h1>
          <p>원본 PDF에서 문항 영역을 확인하고, 잘못 잘린 문항만 다시 지정한 뒤 분석 결과를 검수합니다.</p>
        </div>
        <div className="header-actions">
          <span className="save-state">{saveState}</span>
          <button className="primary" onClick={() => void startAnalysis()} disabled={!workspace || !!busy}>
            {busy === "analysis" ? "AI 분석 중..." : questions.length ? "전체 재분석" : "AI 분석 시작"}
          </button>
        </div>
      </header>

      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="source-bar">
        <label>
          분석할 시험지
          <select
            value={selectedId}
            onChange={(event) => void loadWorkspace(event.target.value)}
            disabled={busy === "load"}
          >
            {sources.length === 0 ? <option value="">등록된 시험지가 없습니다.</option> : null}
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title} · {source.grade || "학년 미정"} · {source.subject || "과목 미정"}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void loadWorkspace(selectedId)} disabled={!selectedId || !!busy}>새로고침</button>
        {workspace?.solutionUrl ? <a href={workspace.solutionUrl} target="_blank" rel="noreferrer">해설지 보기</a> : null}
      </section>

      <section className={`ai-health ${aiHealth.success === true ? "ok" : aiHealth.success === false ? "fail" : "idle"}`}>
        <div>
          <span className="health-dot" />
          <div>
            <small>AI 연결 상태</small>
            <strong>{aiHealth.message}</strong>
          </div>
        </div>
        <button onClick={() => void checkAiHealth()} disabled={aiHealth.checking}>
          {aiHealth.checking ? "확인 중..." : "연결 다시 확인"}
        </button>
      </section>

      {!workspace ? (
        <section className="empty-panel">
          {busy === "load" ? "분석화면을 불러오는 중입니다..." : "분석할 시험지를 선택해 주세요."}
        </section>
      ) : (
        <>
          <section className="status-panel">
            <div><small>시험지</small><strong>{workspace.source.title}</strong></div>
            <div><small>상태</small><strong>{statusText[analysisStatus] ?? analysisStatus}</strong></div>
            <div><small>현재 단계</small><strong>{workspace.analysis?.current_step || "AI 분석 전"}</strong></div>
            <div><small>문항</small><strong>{questions.length}문항</strong></div>
            <div><small>자르기 완료</small><strong>{croppedCount}/{questions.length}</strong></div>
            <div className="progress-wrap"><span style={{ width: `${progress}%` }} /></div>
          </section>

          <section className="workspace-grid">
            <aside className="question-list">
              <div className="panel-title"><h2>문항 번호</h2><span>{questions.length}</span></div>
              <div className="number-grid">
                {questions.map((question) => (
                  <button
                    key={question.id}
                    className={`${question.id === activeQuestion?.id ? "active" : ""} ${hasValidCrop(question) ? "cropped" : ""}`}
                    onClick={() => setActiveQuestionId(question.id)}
                  >
                    {question.question_no}
                  </button>
                ))}
              </div>
              <div className="legend">
                <span><i className="done-dot" />자르기 저장</span>
                <span><i className="active-dot" />현재 문항</span>
              </div>
            </aside>

            <section className="pdf-panel">
              <div className="pdf-toolbar">
                <button disabled={pageNo <= 1} onClick={() => setPageNo((value) => value - 1)}>이전 페이지</button>
                <b>{pageCount ? `${pageNo} / ${pageCount}` : "PDF 로딩"}</b>
                <button disabled={!pageCount || pageNo >= pageCount} onClick={() => setPageNo((value) => value + 1)}>다음 페이지</button>
                <span>{activeQuestion ? `${activeQuestion.question_no}번 영역을 드래그` : "문항을 선택하세요"}</span>
                {workspace.examUrl ? <a href={workspace.examUrl} target="_blank" rel="noreferrer">원본 새 창</a> : null}
              </div>

              <div className="canvas-shell">
                {busy === "pdf" ? <div className="loading">시험지를 불러오는 중입니다.</div> : null}
                <canvas ref={canvasRef} />
                {pdfDoc ? (
                  <div
                    ref={overlayRef}
                    className="overlay"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    {selection ? (
                      <div
                        className="crop-box selected"
                        style={{
                          left: `${selection.x}%`,
                          top: `${selection.y}%`,
                          width: `${selection.width}%`,
                          height: `${selection.height}%`,
                        }}
                      >
                        <b>{activeQuestion?.question_no}</b>
                      </div>
                    ) : null}
                    {draft ? (
                      <div
                        className="crop-box draft"
                        style={{
                          left: `${draft.x}%`,
                          top: `${draft.y}%`,
                          width: `${draft.width}%`,
                          height: `${draft.height}%`,
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="review-panel">
              {activeQuestion ? (
                <>
                  <div className="review-sticky-head">
                    <div>
                      <small>현재 문항</small>
                      <h2>{activeQuestion.question_no}번</h2>
                    </div>
                    <div className="question-nav">
                      <button onClick={() => moveQuestion(-1)}>←</button>
                      <button onClick={() => moveQuestion(1)}>→</button>
                    </div>
                  </div>

                  <div className="preview-card">
                    <div className="preview-title">
                      <strong>잘린 문항 미리보기</strong>
                      <span>{hasValidCrop(activeQuestion) ? "저장됨" : "미저장"}</span>
                    </div>
                    <div className="preview-image">
                      {preview ? <img src={preview} alt={`${activeQuestion.question_no}번 미리보기`} /> : <span>원본에서 문항 영역을 드래그하세요.</span>}
                    </div>
                    <div className="crop-actions">
                      <button className="crop-save" onClick={() => void saveCrop()} disabled={busy === "crop" || !selection}>
                        {busy === "crop" ? "저장 중..." : "문항 자르기 저장"}
                      </button>
                      <button onClick={() => { setSelection(null); setPreview(""); }}>다시 선택</button>
                    </div>
                  </div>

                  <form key={activeQuestion.id} onSubmit={saveQuestion} className="analysis-form">
                    <div className="form-head">
                      <strong>AI 분석 결과</strong>
                      <button type="button" onClick={() => void analyzeOneQuestion()} disabled={busy === "one"}>
                        {busy === "one" ? "재분석 중..." : "이 문항 재분석"}
                      </button>
                    </div>

                    <div className="two-columns">
                      <label>페이지<input name="page_no" type="number" min="1" defaultValue={activeQuestion.page_no ?? pageNo} /></label>
                      <label>정답<input name="answer" defaultValue={activeQuestion.answer ?? ""} /></label>
                    </div>

                    <label>문항 유형
                      <select name="question_type" defaultValue={valueOf(activeQuestion, "question_type") || "unknown"}>
                        <option value="unknown">미분류</option>
                        <option value="multiple_choice">객관식</option>
                        <option value="short_answer">단답형</option>
                        <option value="essay">서술형</option>
                      </select>
                    </label>

                    <label>과목<input name="subject" defaultValue={valueOf(activeQuestion, "subject")} /></label>
                    <label>단원<input name="unit" defaultValue={valueOf(activeQuestion, "unit")} /></label>
                    <label>세부 유형<input name="topic" defaultValue={valueOf(activeQuestion, "topic")} /></label>
                    <label>난이도
                      <select name="difficulty" defaultValue={valueOf(activeQuestion, "difficulty") || "중"}>
                        <option value="하">하</option>
                        <option value="중">중</option>
                        <option value="상">상</option>
                        <option value="최상">최상</option>
                      </select>
                    </label>
                    <label>AI 요약<textarea name="summary" rows={4} defaultValue={valueOf(activeQuestion, "summary")} /></label>

                    <div className="confidence-row">
                      <span>AI 신뢰도</span>
                      <strong>{activeQuestion.confidence == null ? "-" : `${Math.round(Number(activeQuestion.confidence) * 100)}%`}</strong>
                    </div>

                    <button className="analysis-save" type="submit" disabled={busy === "save"}>
                      {busy === "save" ? "저장 중..." : "분석 결과 저장"}
                    </button>
                  </form>
                </>
              ) : (
                <div className="no-question">분석된 문항이 없습니다. 먼저 AI 분석을 실행하세요.</div>
              )}
            </aside>
          </section>
        </>
      )}

      <style jsx>{`
        *{box-sizing:border-box}.analysis-page{min-height:100vh;background:#f3f5f9;padding:20px;font-family:Arial,"Pretendard",sans-serif;color:#202433}.page-header{max-width:1880px;margin:0 auto 14px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.back-button{border:0;background:transparent;padding:0 0 8px;color:#5f687a;font-weight:800;cursor:pointer}.page-header small{display:block;color:#566bdc;font-weight:900;letter-spacing:.08em}.page-header h1{margin:5px 0;font-size:30px}.page-header p{margin:0;color:#71798a}.header-actions{display:flex;align-items:center;gap:12px}.save-state{font-size:13px;color:#7a8291}.primary{border:0;background:#5369df;color:#fff;border-radius:11px;padding:13px 20px;font-weight:900}.primary:disabled{opacity:.5}.notice{max-width:1880px;margin:0 auto 12px;padding:12px 15px;border-radius:10px;font-weight:800}.notice.success{background:#eaf8f1;color:#23795a}.notice.error{background:#fff0f0;color:#a83c3c}.source-bar{max-width:1880px;margin:0 auto 12px;background:#fff;border:1px solid #dde2ec;border-radius:13px;padding:12px 14px;display:flex;align-items:end;gap:10px}.source-bar label{flex:1;font-size:12px;color:#697285;font-weight:800}.source-bar select{display:block;width:100%;height:42px;margin-top:5px;border:1px solid #d8dde7;border-radius:9px;padding:0 11px;background:#fff;font-weight:700}.source-bar button,.source-bar a{height:42px;border:1px solid #d8dde7;background:#fff;border-radius:9px;padding:0 15px;display:inline-flex;align-items:center;color:#3d4658;text-decoration:none;font-weight:800}.ai-health{max-width:1880px;margin:0 auto 12px;border:1px solid #dde2ec;border-radius:13px;padding:11px 14px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px}.ai-health>div{display:flex;align-items:center;gap:10px}.ai-health small{display:block;color:#7b8392;font-weight:800}.ai-health strong{display:block;margin-top:2px;font-size:14px}.health-dot{width:11px;height:11px;border-radius:50%;background:#a0a7b4;box-shadow:0 0 0 4px rgba(160,167,180,.15)}.ai-health.ok{border-color:#a9d9c5;background:#f2fbf7}.ai-health.ok .health-dot{background:#35a874;box-shadow:0 0 0 4px rgba(53,168,116,.15)}.ai-health.fail{border-color:#efb4b4;background:#fff6f6}.ai-health.fail .health-dot{background:#df5151;box-shadow:0 0 0 4px rgba(223,81,81,.15)}.ai-health button{height:36px;border:1px solid #d7dce7;background:#fff;border-radius:9px;padding:0 13px;font-weight:900}.ai-health button:disabled{opacity:.55}.empty-panel{max-width:1880px;height:420px;margin:auto;background:#fff;border:1px solid #dde2ec;border-radius:14px;display:grid;place-items:center;color:#737c8d}.status-panel{max-width:1880px;margin:0 auto 12px;background:#fff;border:1px solid #dde2ec;border-radius:13px;padding:12px 15px;display:grid;grid-template-columns:minmax(260px,1.6fr) repeat(4,minmax(100px,.7fr));gap:10px;position:relative;overflow:hidden}.status-panel div{display:grid;gap:3px}.status-panel small{color:#7b8392}.status-panel strong{font-size:14px}.progress-wrap{position:absolute!important;left:0;right:0;bottom:0;height:4px;background:#e8ebf2}.progress-wrap span{display:block;height:100%;background:#5369df;transition:width .25s}.workspace-grid{max-width:1880px;margin:auto;display:grid;grid-template-columns:205px minmax(650px,1fr) 390px;gap:14px;align-items:start}.question-list,.pdf-panel,.review-panel{background:#fff;border:1px solid #dde2ec;border-radius:14px}.question-list,.review-panel{position:sticky;top:10px;max-height:calc(100vh - 20px);overflow:auto}.question-list{padding:14px}.panel-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.panel-title h2{font-size:17px;margin:0}.panel-title span{font-size:12px;color:#7b8392}.number-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.number-grid button{height:37px;border:1px solid #d9dee8;border-radius:8px;background:#fff;font-weight:900;cursor:pointer}.number-grid button.cropped{background:#eaf8f1;border-color:#a8d7c4;color:#267b5d}.number-grid button.active{background:#5369df;border-color:#5369df;color:#fff}.legend{display:grid;gap:7px;margin-top:14px;color:#747d8d;font-size:12px}.legend span{display:flex;align-items:center;gap:7px}.legend i{width:10px;height:10px;border-radius:50%}.done-dot{background:#62b391}.active-dot{background:#5369df}.pdf-panel{overflow:hidden}.pdf-toolbar{min-height:54px;border-bottom:1px solid #e4e8ef;padding:8px 12px;display:flex;align-items:center;gap:8px}.pdf-toolbar button,.pdf-toolbar a{border:1px solid #d7dce7;background:#fff;border-radius:9px;padding:9px 12px;text-decoration:none;color:#414a5b;font-weight:800}.pdf-toolbar button:disabled{opacity:.45}.pdf-toolbar span{margin-left:auto;color:#5369df;font-weight:900}.canvas-shell{position:relative;width:min(100%,1050px);margin:12px auto;background:#fff;min-height:520px}.canvas-shell canvas{display:block;width:100%;height:auto}.loading{position:absolute;inset:0;display:grid;place-items:center;background:#fff;color:#737c8d;z-index:3}.overlay{position:absolute;inset:0;cursor:crosshair;touch-action:none}.crop-box{position:absolute;pointer-events:none;border:2px solid #e24444;background:rgba(226,68,68,.09)}.crop-box.selected b{position:absolute;left:-2px;top:-25px;background:#e24444;color:#fff;padding:3px 8px;border-radius:6px 6px 0 0}.crop-box.draft{border-color:#5369df;border-style:dashed;background:rgba(83,105,223,.08)}.review-panel{padding:14px}.review-sticky-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:11px;border-bottom:1px solid #e6e9ef}.review-sticky-head small{color:#7b8392}.review-sticky-head h2{margin:2px 0 0;font-size:24px}.question-nav{display:flex;gap:6px}.question-nav button{width:38px;height:36px;border:1px solid #d7dce7;background:#fff;border-radius:8px;font-weight:900}.preview-card{padding:13px 0;border-bottom:1px solid #e6e9ef}.preview-title{display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px}.preview-title span{color:#748092}.preview-image{min-height:190px;max-height:360px;overflow:auto;border:1px dashed #cbd2de;border-radius:10px;background:#fafbfd;display:grid;place-items:center;color:#7a8392}.preview-image img{display:block;max-width:100%}.crop-actions{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:8px}.crop-actions button{height:40px;border:1px solid #d7dce7;background:#fff;border-radius:9px;font-weight:900}.crop-actions .crop-save{background:#283247;border-color:#283247;color:#fff}.analysis-form{padding-top:13px;display:grid;gap:10px}.form-head{display:flex;justify-content:space-between;align-items:center}.form-head button{border:1px solid #d7dce7;background:#fff;border-radius:8px;padding:8px 10px;font-weight:800}.analysis-form label{display:grid;gap:5px;font-size:12px;color:#687184;font-weight:800}.analysis-form input,.analysis-form select,.analysis-form textarea{width:100%;border:1px solid #d6dce7;border-radius:8px;background:#fff;padding:10px;color:#252b37;font:inherit}.analysis-form textarea{resize:vertical}.two-columns{display:grid;grid-template-columns:1fr 1fr;gap:8px}.confidence-row{display:flex;justify-content:space-between;padding:10px 12px;background:#f6f7fa;border-radius:8px;color:#646d7d}.analysis-save{height:44px;border:0;border-radius:9px;background:#5369df;color:#fff;font-weight:900}.analysis-save:disabled{opacity:.5}.no-question{min-height:400px;display:grid;place-items:center;text-align:center;color:#737c8c;padding:20px}@media(max-width:1450px){.workspace-grid{grid-template-columns:185px minmax(580px,1fr) 350px}.page-header h1{font-size:27px}}@media(max-width:1150px){.workspace-grid{grid-template-columns:180px minmax(0,1fr)}.review-panel{grid-column:1/-1;position:static;max-height:none}.status-panel{grid-template-columns:1fr 1fr 1fr}.question-list{position:sticky}.preview-image{max-height:500px}}@media(max-width:760px){.analysis-page{padding:9px}.page-header{align-items:flex-start;flex-direction:column}.header-actions{width:100%;justify-content:space-between}.source-bar{align-items:stretch;flex-direction:column}.source-bar button,.source-bar a{justify-content:center}.status-panel{grid-template-columns:1fr 1fr}.workspace-grid{grid-template-columns:1fr}.question-list{position:static;max-height:none}.number-grid{grid-template-columns:repeat(8,1fr)}.pdf-toolbar{flex-wrap:wrap}.pdf-toolbar span{width:100%;margin-left:0}.review-panel{grid-column:auto}.canvas-shell{min-height:360px}}
      `}</style>
    </main>
  );
}
