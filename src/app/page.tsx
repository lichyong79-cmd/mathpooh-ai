"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type MenuKey = "dashboard" | "library" | "students" | "exams" | "recommendations";
type ProblemSet = {
  id: string;
  title: string;
  exam_date: string | null;
  subject: string;
  question_count: number;
  analysis_count: number;
  created_at: string;
};
type Problem = {
  id: string;
  problem_set_id: string;
  question_number: number;
  analysis_status: "pending" | "ready";
};
type SupabaseRest = { url: string; key: string };
type ApiResult<T> = {
  data: T | null;
  error: string | null;
  code: string | null;
  status: number | null;
};
type DiagnosticItem = {
  label: string;
  ok: boolean;
  detail: string;
  code?: string | null;
};

const STORAGE_KEY = "sos-problem-library-v031";

function getSupabase(): SupabaseRest | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )?.trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseRequest<T>(
  client: SupabaseRest,
  table: string,
  init: RequestInit = {},
  query = "",
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${client.url}/rest/v1/${table}${query}`, {
      ...init,
      headers: {
        apikey: client.key,
        Authorization: `Bearer ${client.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      const errorBody = typeof body === "object" && body !== null ? body as Record<string, unknown> : null;
      return {
        data: null,
        error: String(errorBody?.message ?? errorBody?.details ?? body ?? `HTTP ${response.status}`),
        code: errorBody?.code ? String(errorBody.code) : null,
        status: response.status,
      };
    }

    return { data: body as T, error: null, code: null, status: response.status };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "네트워크 오류",
      code: "NETWORK_ERROR",
      status: null,
    };
  }
}

function createProblems(problemSetId: string, count: number): Problem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${problemSetId}-${index + 1}`,
    problem_set_id: problemSetId,
    question_number: index + 1,
    analysis_status: "pending" as const,
  }));
}

const menuLabels: Record<MenuKey, string> = {
  dashboard: "대시보드",
  library: "문제 라이브러리",
  students: "학생 관리",
  exams: "모의고사",
  recommendations: "AI 추천",
};

export default function Home() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>("library");
  const [problemSets, setProblemSets] = useState<ProblemSet[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [subject, setSubject] = useState("수학");
  const [questionCount, setQuestionCount] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [fatalError, setFatalError] = useState("");
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [diagnosing, setDiagnosing] = useState(false);

  const supabase = useMemo(() => getSupabase(), []);
  const connected = Boolean(supabase);
  const selectedSet = problemSets.find((item) => item.id === selectedId) ?? null;
  const selectedProblems = problems
    .filter((item) => item.problem_set_id === selectedId)
    .sort((a, b) => a.question_number - b.question_number);

  const runDiagnostics = useCallback(async () => {
    setDiagnosing(true);
    const results: DiagnosticItem[] = [];

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )?.trim();

    results.push({
      label: "환경변수 URL",
      ok: Boolean(url),
      detail: url ? "설정됨" : "NEXT_PUBLIC_SUPABASE_URL 없음",
    });
    results.push({
      label: "환경변수 API Key",
      ok: Boolean(key),
      detail: key ? "설정됨" : "ANON_KEY 또는 PUBLISHABLE_KEY 없음",
    });

    if (!supabase) {
      setDiagnostics(results);
      setDiagnosing(false);
      return;
    }

    const setResult = await supabaseRequest<ProblemSet[]>(supabase, "problem_sets", {}, "?select=id&limit=1");
    results.push({
      label: "problem_sets",
      ok: !setResult.error,
      detail: setResult.error ?? "조회 정상",
      code: setResult.code,
    });

    const problemResult = await supabaseRequest<Problem[]>(supabase, "problems", {}, "?select=id&limit=1");
    results.push({
      label: "problems",
      ok: !problemResult.error,
      detail: problemResult.error ?? "조회 정상",
      code: problemResult.code,
    });

    setDiagnostics(results);
    setDiagnosing(false);
  }, [supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setFatalError("");

    if (supabase) {
      const [setResult, problemResult] = await Promise.all([
        supabaseRequest<ProblemSet[]>(supabase, "problem_sets", {}, "?select=*&order=created_at.desc"),
        supabaseRequest<Problem[]>(supabase, "problems", {}, "?select=*&order=question_number.asc"),
      ]);

      if (!setResult.error && !problemResult.error) {
        const loadedSets = setResult.data ?? [];
        setProblemSets(loadedSets);
        setProblems(problemResult.data ?? []);
        setSelectedId((current) => current ?? loadedSets[0]?.id ?? null);
        setLoading(false);
        return;
      }

      const exact = [
        setResult.error ? `problem_sets: ${setResult.error}${setResult.code ? ` (${setResult.code})` : ""}` : "",
        problemResult.error ? `problems: ${problemResult.error}${problemResult.code ? ` (${problemResult.code})` : ""}` : "",
      ].filter(Boolean).join(" / ");
      setFatalError(exact || "알 수 없는 Supabase 오류");
      await runDiagnostics();
      setLoading(false);
      return;
    }

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { problemSets: ProblemSet[]; problems: Problem[] };
        setProblemSets(parsed.problemSets);
        setProblems(parsed.problems);
        setSelectedId(parsed.problemSets[0]?.id ?? null);
      } catch {
        setMessage("로컬 저장 데이터를 읽지 못했습니다.");
      }
    }
    setLoading(false);
  }, [runDiagnostics, supabase]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (loading || connected) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ problemSets, problems }));
  }, [problemSets, problems, loading, connected]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || questionCount < 1 || questionCount > 100) return;

    setSaving(true);
    setMessage("");
    setFatalError("");

    const id = crypto.randomUUID();
    const newSet: ProblemSet = {
      id,
      title: cleanTitle,
      exam_date: examDate || null,
      subject,
      question_count: questionCount,
      analysis_count: 0,
      created_at: new Date().toISOString(),
    };
    const newProblems = createProblems(id, questionCount);

    if (supabase) {
      const setResult = await supabaseRequest<ProblemSet[]>(supabase, "problem_sets", {
        method: "POST",
        body: JSON.stringify(newSet),
      });
      if (setResult.error) {
        setFatalError(`problem_sets 저장 실패: ${setResult.error}${setResult.code ? ` (${setResult.code})` : ""}`);
        setSaving(false);
        return;
      }

      const problemsResult = await supabaseRequest<Problem[]>(supabase, "problems", {
        method: "POST",
        body: JSON.stringify(newProblems),
      });
      if (problemsResult.error) {
        await supabaseRequest<unknown>(supabase, "problem_sets", { method: "DELETE" }, `?id=eq.${id}`);
        setFatalError(`problems 저장 실패: ${problemsResult.error}${problemsResult.code ? ` (${problemsResult.code})` : ""}`);
        setSaving(false);
        return;
      }
    }

    setProblemSets((current) => [newSet, ...current]);
    setProblems((current) => [...current, ...newProblems]);
    setSelectedId(id);
    setTitle("");
    setExamDate("");
    setQuestionCount(30);
    setMessage(`${questionCount}문항 구조를 자동 생성했습니다.`);
    setSaving(false);
  }

  async function handleDelete(problemSet: ProblemSet) {
    if (!window.confirm(`'${problemSet.title}' 시험을 삭제할까요?`)) return;
    setFatalError("");

    if (supabase) {
      const result = await supabaseRequest<unknown>(supabase, "problem_sets", { method: "DELETE" }, `?id=eq.${problemSet.id}`);
      if (result.error) {
        setFatalError(`삭제 실패: ${result.error}${result.code ? ` (${result.code})` : ""}`);
        return;
      }
    }

    const nextSets = problemSets.filter((item) => item.id !== problemSet.id);
    setProblemSets(nextSets);
    setProblems((current) => current.filter((item) => item.problem_set_id !== problemSet.id));
    setSelectedId(nextSets[0]?.id ?? null);
    setMessage("시험을 삭제했습니다.");
  }

  function renderReadyPage(menu: Exclude<MenuKey, "library">) {
    const descriptions: Record<Exclude<MenuKey, "library">, string> = {
      dashboard: "문제·학생·모의고사 진행 현황을 한눈에 보는 화면입니다.",
      students: "학생 등록과 관리 기능이 다음 단계에서 연결됩니다.",
      exams: "주간 모의고사 등록과 응시 기능이 다음 단계에서 연결됩니다.",
      recommendations: "공략문항을 기준으로 진단 3→3, 훈련 10→10을 추천합니다.",
    };
    return (
      <section className="panel ready-page">
        <span className="ready-badge">준비 중</span>
        <h2>{menuLabels[menu]}</h2>
        <p>{descriptions[menu]}</p>
        <button className="secondary-button" onClick={() => setActiveMenu("library")}>문제 라이브러리로 이동</button>
      </section>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div><strong>SOS</strong><span>Score Optimization System</span></div>
        </div>
        <nav>
          {(Object.keys(menuLabels) as MenuKey[]).map((menu) => (
            <button key={menu} className={`nav-item ${activeMenu === menu ? "active" : ""}`} onClick={() => setActiveMenu(menu)}>
              {menuLabels[menu]}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className={connected ? "status-dot online" : "status-dot"} />
          {connected ? "Supabase 환경변수 설정" : "로컬 데모 모드"}
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">SOS v0.3.1</p>
            <h1>{menuLabels[activeMenu]}</h1>
            <p>{activeMenu === "library" ? "시험을 등록하면 문항 구조가 자동으로 생성됩니다." : "메뉴 이동은 정상 작동하며 해당 기능은 순차 개발합니다."}</p>
          </div>
          <div className="top-actions">
            <button className="developer-button" onClick={() => { setDeveloperOpen((open) => !open); if (!developerOpen) void runDiagnostics(); }}>
              개발자 진단
            </button>
            <div className={connected ? "connection connected" : "connection"}>
              {connected ? "Supabase 환경변수 설정" : "환경변수 미설정 · 데모 모드"}
            </div>
          </div>
        </header>

        {developerOpen && (
          <section className="developer-panel">
            <div className="developer-head">
              <div><strong>Developer Diagnostics</strong><span>실제 오류를 숨기지 않고 그대로 표시합니다.</span></div>
              <button onClick={() => void runDiagnostics()} disabled={diagnosing}>{diagnosing ? "확인 중..." : "다시 확인"}</button>
            </div>
            <div className="diagnostic-grid">
              {diagnostics.map((item) => (
                <article key={item.label} className={item.ok ? "diagnostic ok" : "diagnostic fail"}>
                  <strong>{item.ok ? "✓" : "✕"} {item.label}</strong>
                  <span>{item.detail}</span>
                  {item.code && <code>CODE: {item.code}</code>}
                </article>
              ))}
            </div>
          </section>
        )}

        {fatalError && <div className="error-notice"><strong>Supabase 오류</strong><span>{fatalError}</span><button onClick={() => setDeveloperOpen(true)}>진단 열기</button></div>}
        {message && <div className="notice">{message}</div>}

        {activeMenu !== "library" ? renderReadyPage(activeMenu) : (
          <>
            <div className="summary-grid">
              <article className="summary-card"><span>등록 시험</span><strong>{problemSets.length}</strong></article>
              <article className="summary-card"><span>전체 문항</span><strong>{problems.length}</strong></article>
              <article className="summary-card"><span>AI 분석 완료</span><strong>{problems.filter((item) => item.analysis_status === "ready").length}</strong></article>
            </div>

            <div className="workspace">
              <section className="panel create-panel">
                <div className="panel-heading"><div><p className="eyebrow">시험 등록</p><h2>새 시험 추가</h2></div></div>
                <form onSubmit={handleCreate}>
                  <label>시험명<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 2026년 6월 모의평가" required /></label>
                  <div className="form-row">
                    <label>시험일<input type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} /></label>
                    <label>과목<select value={subject} onChange={(event) => setSubject(event.target.value)}><option>수학</option><option>공통수학</option><option>미적분</option><option>확률과 통계</option><option>기하</option></select></label>
                  </div>
                  <label>문항 수<input type="number" min={1} max={100} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} /></label>
                  <button className="primary-button" disabled={saving || Boolean(fatalError)}>{saving ? "저장 중..." : "시험 및 문항 구조 생성"}</button>
                </form>
              </section>

              <section className="panel list-panel">
                <div className="panel-heading"><div><p className="eyebrow">시험 목록</p><h2>등록된 시험</h2></div></div>
                {loading ? <div className="empty">불러오는 중...</div> : problemSets.length === 0 ? <div className="empty">아직 등록된 시험이 없습니다.</div> : (
                  <div className="set-list">{problemSets.map((item) => {
                    const progress = item.question_count ? Math.round((item.analysis_count / item.question_count) * 100) : 0;
                    return <button key={item.id} className={`set-card ${selectedId === item.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}>
                      <div className="set-card-top"><div><strong>{item.title}</strong><span>{item.subject} · {item.question_count}문항{item.exam_date ? ` · ${item.exam_date}` : ""}</span></div><span className="progress-number">{progress}%</span></div>
                      <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                    </button>;
                  })}</div>
                )}
              </section>
            </div>

            <section className="panel problem-panel">
              <div className="panel-heading horizontal">
                <div><p className="eyebrow">문항 구조</p><h2>{selectedSet?.title ?? "시험을 선택하세요"}</h2><p>{selectedSet ? `${selectedSet.question_count}개 문항이 독립 객체로 생성되어 있습니다.` : "시험을 등록하거나 선택하면 문항이 표시됩니다."}</p></div>
                {selectedSet && <button className="danger-button" onClick={() => void handleDelete(selectedSet)}>시험 삭제</button>}
              </div>
              {selectedSet ? <div className="problem-grid">{selectedProblems.map((problem) => <button className="problem-cell" key={problem.id}><strong>{problem.question_number}</strong><span>{problem.analysis_status === "ready" ? "분석 완료" : "분석 대기"}</span></button>)}</div> : <div className="empty large">등록된 시험을 선택해 주세요.</div>}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
