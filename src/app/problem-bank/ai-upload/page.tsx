"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
};

type Workspace = {
  source: SourceFile;
  analysis: Analysis;
  questions: Question[];
  examUrl: string | null;
  solutionUrl: string | null;
};

const statusText: Record<string, string> = {
  uploaded: "업로드 완료",
  PENDING: "분석 대기",
  RUNNING: "AI 분석 중",
  REVIEW: "검수 필요",
  DONE: "분석 완료",
  FAILED: "분석 실패",
  completed: "분석 완료",
};

function valueOf(question: Question, key: string) {
  const review = question.review_result ?? {};
  const ai = question.ai_result ?? {};
  return String(review[key] ?? ai[key] ?? "");
}

export default function AnalysisWorkspacePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [sources, setSources] = useState<SourceFile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("저장됨");

  const questions = workspace?.questions ?? [];
  const activeQuestion = questions.find((item) => item.id === activeQuestionId) ?? questions[0] ?? null;

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
    try {
      const response = await fetch(`/api/analysis/source/${sourceId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "분석화면을 불러오지 못했습니다.");

      const nextWorkspace = payload as Workspace & { success: true };
      setWorkspace(nextWorkspace);
      setSelectedId(sourceId);
      setActiveQuestionId(nextWorkspace.questions?.[0]?.id ?? "");
    } catch (caught) {
      setWorkspace(null);
      setError(caught instanceof Error ? caught.message : "분석화면을 불러오지 못했습니다.");
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await loadSources();
        if (rows.length > 0) await loadWorkspace(rows[0].id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "시험지 목록을 불러오지 못했습니다.");
      }
    })();
  }, [loadSources, loadWorkspace]);

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
      if (!response.ok || !payload.success) throw new Error(payload.message || "AI 분석에 실패했습니다.");

      setMessage(`AI 분석 완료 · ${payload.questionCount ?? 0}문항`);
      await loadWorkspace(workspace.source.id);
      await loadSources();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 분석에 실패했습니다.");
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
    setError("");
    try {
      const response = await fetch(`/api/analysis/questions/${activeQuestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer: String(form.get("answer") ?? ""),
          page_no: Number(form.get("page_no") ?? 1),
          review_result: reviewResult,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "문항 저장에 실패했습니다.");

      setWorkspace((current) => current ? {
        ...current,
        questions: current.questions.map((item) => item.id === activeQuestion.id ? payload.question : item),
      } : current);
      setSaveState("저장됨");
      setMessage(`${activeQuestion.question_no}번 문항 저장 완료`);
    } catch (caught) {
      setSaveState("저장 실패");
      setError(caught instanceof Error ? caught.message : "문항 저장에 실패했습니다.");
    }
  }

  async function analyzeOneQuestion() {
    if (!activeQuestion) return;
    setBusy("one");
    setError("");
    try {
      const response = await fetch(`/api/analysis/questions/${activeQuestion.id}/analyze`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "문항 분석에 실패했습니다.");

      setWorkspace((current) => current ? {
        ...current,
        questions: current.questions.map((item) => item.id === activeQuestion.id ? payload.question : item),
      } : current);
      setMessage(`${activeQuestion.question_no}번 문항 재분석 완료`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문항 분석에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  const analysisStatus = workspace?.analysis?.status ?? workspace?.source.status ?? "uploaded";
  const progress = Math.max(0, Math.min(100, Number(workspace?.analysis?.progress ?? 0)));

  return (
    <main className="analysis-page">
      <header className="page-header">
        <div>
          <button className="back-button" onClick={() => router.push("/problem-bank")}>← 문제은행</button>
          <h1>AI 문항 분석</h1>
          <p>시험지 원본을 확인하고 AI 분석 결과를 문항별로 검수합니다.</p>
        </div>
        <div className="header-actions">
          <span>{saveState}</span>
          <button className="primary" onClick={startAnalysis} disabled={!workspace || !!busy}>
            {busy === "analysis" ? "AI 분석 중..." : questions.length ? "전체 재분석" : "AI 분석 시작"}
          </button>
        </div>
      </header>

      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}

      <section className="source-bar">
        <label>
          분석할 시험지
          <select
            value={selectedId}
            onChange={(event) => void loadWorkspace(event.target.value)}
            disabled={busy === "load"}
          >
            {sources.length === 0 && <option value="">등록된 시험지가 없습니다.</option>}
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title} · {source.grade || "학년 미정"} · {source.subject || "과목 미정"}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void loadWorkspace(selectedId)} disabled={!selectedId || !!busy}>새로고침</button>
      </section>

      {!workspace ? (
        <section className="empty-panel">{busy === "load" ? "분석화면을 불러오는 중입니다..." : "분석할 시험지를 선택해 주세요."}</section>
      ) : (
        <>
          <section className="status-panel">
            <div><small>시험지</small><strong>{workspace.source.title}</strong></div>
            <div><small>상태</small><strong>{statusText[analysisStatus] ?? analysisStatus}</strong></div>
            <div><small>현재 단계</small><strong>{workspace.analysis?.current_step || "AI 분석 전"}</strong></div>
            <div><small>문항 수</small><strong>{questions.length}문항</strong></div>
            <div className="progress-wrap">
              <span style={{ width: `${progress}%` }} />
            </div>
          </section>

          <section className="workspace-grid">
            <div className="pdf-panel">
              <div className="panel-title">
                <h2>시험지 원본</h2>
                <div>
                  {workspace.examUrl && <a href={workspace.examUrl} target="_blank" rel="noreferrer">새 창에서 보기</a>}
                  {workspace.solutionUrl && <a href={workspace.solutionUrl} target="_blank" rel="noreferrer">해설지 보기</a>}
                </div>
              </div>
              {workspace.examUrl ? (
                <iframe title="시험지 PDF" src={`${workspace.examUrl}#toolbar=1&navpanes=0`} />
              ) : (
                <div className="pdf-empty">시험지 PDF가 없습니다.</div>
              )}
            </div>

            <aside className="question-panel">
              <div className="panel-title">
                <h2>문항 분석 결과</h2>
                <span>{questions.length}문항</span>
              </div>

              {questions.length === 0 ? (
                <div className="question-empty">
                  아직 분석된 문항이 없습니다.<br />위의 <b>AI 분석 시작</b>을 눌러 주세요.
                </div>
              ) : (
                <>
                  <div className="question-numbers">
                    {questions.map((question) => (
                      <button
                        key={question.id}
                        className={question.id === activeQuestion?.id ? "active" : ""}
                        onClick={() => setActiveQuestionId(question.id)}
                      >
                        {question.question_no}
                      </button>
                    ))}
                  </div>

                  {activeQuestion && (
                    <form key={activeQuestion.id} className="question-form" onSubmit={saveQuestion}>
                      <div className="form-heading">
                        <div>
                          <strong>{activeQuestion.question_no}번 문항</strong>
                          <span>신뢰도 {Math.round(Number(activeQuestion.confidence ?? 0) * 100)}%</span>
                        </div>
                        <button type="button" onClick={analyzeOneQuestion} disabled={!!busy}>
                          {busy === "one" ? "분석 중..." : "이 문항 재분석"}
                        </button>
                      </div>

                      <div className="two-columns">
                        <label>페이지<input name="page_no" type="number" min="1" defaultValue={activeQuestion.page_no ?? 1} /></label>
                        <label>정답<input name="answer" defaultValue={activeQuestion.answer ?? ""} /></label>
                      </div>

                      <label>문항 유형
                        <select name="question_type" defaultValue={valueOf(activeQuestion, "question_type") || "unknown"}>
                          <option value="objective">객관식</option>
                          <option value="subjective">주관식</option>
                          <option value="unknown">미분류</option>
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
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                          <option value="D">D</option>
                          <option value="E">E</option>
                        </select>
                      </label>

                      <label>핵심 내용<textarea name="summary" defaultValue={valueOf(activeQuestion, "summary")} /></label>
                      <button className="save-button" type="submit">문항 수정 저장</button>
                    </form>
                  )}
                </>
              )}
            </aside>
          </section>
        </>
      )}

      <style jsx>{`
        *{box-sizing:border-box}.analysis-page{min-height:100vh;background:#f3f5f8;color:#172033;padding:24px;font-family:Arial,"Pretendard",sans-serif}.page-header{max-width:1800px;margin:0 auto 16px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.back-button{border:0;background:transparent;padding:0;color:#677084;font-weight:800}.page-header h1{font-size:32px;margin:8px 0 4px}.page-header p{margin:0;color:#6f788a}.header-actions{display:flex;align-items:center;gap:12px}.header-actions span{font-size:13px;color:#6f788a}.analysis-page button,.analysis-page input,.analysis-page select,.analysis-page textarea{font:inherit}.analysis-page button{cursor:pointer}.primary{height:44px;padding:0 20px;border:0;border-radius:10px;background:#b88922;color:white;font-weight:900}.primary:disabled{opacity:.5;cursor:not-allowed}.notice{max-width:1800px;margin:0 auto 12px;padding:12px 16px;border-radius:10px;font-weight:800}.notice.success{background:#e9f8ef;color:#166d44}.notice.error{background:#fff0f0;color:#b42318}.source-bar{max-width:1800px;margin:0 auto 12px;padding:14px;background:white;border:1px solid #dfe4ec;border-radius:14px;display:flex;align-items:flex-end;gap:10px}.source-bar label{flex:1;font-size:12px;font-weight:900;color:#697386}.source-bar select{display:block;width:100%;height:44px;margin-top:6px;border:1px solid #d7dde7;border-radius:9px;padding:0 12px;background:white}.source-bar button{height:44px;padding:0 18px;border:1px solid #d7dde7;border-radius:9px;background:white;font-weight:800}.empty-panel{max-width:1800px;margin:auto;padding:90px;text-align:center;background:white;border:1px solid #dfe4ec;border-radius:14px;color:#737d8e}.status-panel{max-width:1800px;margin:0 auto 12px;padding:15px 18px;background:white;border:1px solid #dfe4ec;border-radius:14px;display:grid;grid-template-columns:2fr 1fr 2fr 1fr;gap:18px;position:relative;overflow:hidden}.status-panel small{display:block;color:#7a8393;font-weight:800;margin-bottom:4px}.status-panel strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.progress-wrap{position:absolute;left:0;right:0;bottom:0;height:4px;background:#edf0f4}.progress-wrap span{display:block;height:100%;background:#b88922}.workspace-grid{max-width:1800px;margin:auto;display:grid;grid-template-columns:minmax(650px,1.4fr) minmax(420px,.6fr);gap:12px;align-items:start}.pdf-panel,.question-panel{background:white;border:1px solid #dfe4ec;border-radius:14px;overflow:hidden}.panel-title{height:58px;padding:0 16px;border-bottom:1px solid #e5e9ef;display:flex;align-items:center;justify-content:space-between}.panel-title h2{font-size:18px;margin:0}.panel-title div{display:flex;gap:12px}.panel-title a{font-size:13px;color:#8a651a;font-weight:900;text-decoration:none}.panel-title span{font-size:13px;color:#737d8e;font-weight:800}.pdf-panel iframe{display:block;width:100%;height:calc(100vh - 225px);min-height:720px;border:0;background:#eee}.pdf-empty,.question-empty{padding:80px 20px;text-align:center;color:#747e8e}.question-panel{max-height:calc(100vh - 145px);overflow:auto;position:sticky;top:12px}.question-numbers{padding:12px;display:grid;grid-template-columns:repeat(10,1fr);gap:6px;border-bottom:1px solid #e5e9ef}.question-numbers button{height:34px;border:1px solid #d9dfe8;border-radius:8px;background:white;font-weight:900}.question-numbers button.active{background:#172033;color:white;border-color:#172033}.question-form{padding:16px}.form-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.form-heading div{display:flex;flex-direction:column}.form-heading strong{font-size:20px}.form-heading span{margin-top:3px;font-size:12px;color:#737d8e}.form-heading button{height:36px;border:1px solid #d5dce6;border-radius:8px;background:white;font-weight:800}.question-form label{display:block;margin-bottom:10px;font-size:12px;color:#5f6879;font-weight:900}.question-form input,.question-form select,.question-form textarea{display:block;width:100%;margin-top:5px;border:1px solid #d7dde7;border-radius:9px;background:white;padding:0 11px}.question-form input,.question-form select{height:42px}.question-form textarea{min-height:90px;padding:10px;resize:vertical}.two-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.save-button{width:100%;height:44px;border:0;border-radius:9px;background:#172033;color:white;font-weight:900}@media(max-width:1100px){.workspace-grid{grid-template-columns:1fr}.question-panel{position:static;max-height:none}.pdf-panel iframe{height:650px;min-height:0}}@media(max-width:700px){.analysis-page{padding:10px}.page-header,.source-bar{align-items:stretch;flex-direction:column}.header-actions{justify-content:space-between}.status-panel{grid-template-columns:1fr 1fr}.question-numbers{grid-template-columns:repeat(5,1fr)}}
      `}</style>
    </main>
  );
}
