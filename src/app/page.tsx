"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

const STORAGE_KEY = "sos-problem-library-v03";

type SupabaseRest = {
  url: string;
  key: string;
};

function getSupabase(): SupabaseRest | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseRequest<T>(
  client: SupabaseRest,
  table: string,
  init: RequestInit = {},
  query = "",
): Promise<{ data: T | null; error: string | null }> {
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
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      return { data: null, error: body?.message ?? `HTTP ${response.status}` };
    }
    return { data: body as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "네트워크 오류" };
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

export default function Home() {
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

  const supabase = useMemo(() => getSupabase(), []);
  const connected = Boolean(supabase);

  const selectedSet = problemSets.find((item) => item.id === selectedId) ?? null;
  const selectedProblems = problems
    .filter((item) => item.problem_set_id === selectedId)
    .sort((a, b) => a.question_number - b.question_number);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");

      if (supabase) {
        const [setResult, problemResult] = await Promise.all([
          supabaseRequest<ProblemSet[]>(supabase, "problem_sets", {}, "?select=*&order=created_at.desc"),
          supabaseRequest<Problem[]>(supabase, "problems", {}, "?select=*&order=question_number.asc"),
        ]);

        if (!setResult.error && !problemResult.error) {
          const loadedSets = setResult.data ?? [];
          setProblemSets(loadedSets);
          setProblems(problemResult.data ?? []);
          setSelectedId(loadedSets[0]?.id ?? null);
          setLoading(false);
          return;
        }

        setMessage("Supabase 테이블을 확인해 주세요. 현재는 로컬 저장으로 실행합니다.");
      }

      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { problemSets: ProblemSet[]; problems: Problem[] };
        setProblemSets(parsed.problemSets);
        setProblems(parsed.problems);
        setSelectedId(parsed.problemSets[0]?.id ?? null);
      }
      setLoading(false);
    }

    void load();
  }, [supabase]);

  useEffect(() => {
    if (loading || connected) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ problemSets, problems }));
  }, [problemSets, problems, loading, connected]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    setSaving(true);
    setMessage("");

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
      const problemsResult = setResult.error
        ? { data: null, error: setResult.error }
        : await supabaseRequest<Problem[]>(supabase, "problems", {
            method: "POST",
            body: JSON.stringify(newProblems),
          });

      if (setResult.error || problemsResult.error) {
        setMessage(`저장 실패: ${setResult.error ?? problemsResult.error ?? "알 수 없는 오류"}`);
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

    if (supabase) {
      const result = await supabaseRequest<unknown>(
        supabase,
        "problem_sets",
        { method: "DELETE" },
        `?id=eq.${problemSet.id}`,
      );
      if (result.error) {
        setMessage(`삭제 실패: ${result.error}`);
        return;
      }
    }

    const nextSets = problemSets.filter((item) => item.id !== problemSet.id);
    setProblemSets(nextSets);
    setProblems((current) => current.filter((item) => item.problem_set_id !== problemSet.id));
    setSelectedId(nextSets[0]?.id ?? null);
    setMessage("시험을 삭제했습니다.");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>SOS</strong>
            <span>Score Optimization System</span>
          </div>
        </div>
        <nav>
          <button className="nav-item">대시보드</button>
          <button className="nav-item active">문제 라이브러리</button>
          <button className="nav-item">학생 관리</button>
          <button className="nav-item">모의고사</button>
          <button className="nav-item">AI 추천</button>
        </nav>
        <div className="sidebar-foot">
          <span className={connected ? "status-dot online" : "status-dot"} />
          {connected ? "Supabase 연결 완료" : "로컬 데모 모드"}
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">SOS v0.3</p>
            <h1>문제 라이브러리</h1>
            <p>시험 한 개를 등록하면 문항 구조가 자동으로 만들어집니다.</p>
          </div>
          <div className={connected ? "connection connected" : "connection"}>
            {connected ? "Supabase 연결 완료" : "환경변수 미설정 · 데모 모드"}
          </div>
        </header>

        {message && <div className="notice">{message}</div>}

        <div className="summary-grid">
          <article className="summary-card">
            <span>등록 시험</span>
            <strong>{problemSets.length}</strong>
          </article>
          <article className="summary-card">
            <span>전체 문항</span>
            <strong>{problems.length}</strong>
          </article>
          <article className="summary-card">
            <span>AI 분석 완료</span>
            <strong>{problems.filter((item) => item.analysis_status === "ready").length}</strong>
          </article>
        </div>

        <div className="workspace">
          <section className="panel create-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">시험 등록</p>
                <h2>새 시험 추가</h2>
              </div>
            </div>
            <form onSubmit={handleCreate}>
              <label>
                시험명
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="예: 2026년 6월 모의평가"
                  required
                />
              </label>
              <div className="form-row">
                <label>
                  시험일
                  <input
                    type="date"
                    value={examDate}
                    onChange={(event) => setExamDate(event.target.value)}
                  />
                </label>
                <label>
                  과목
                  <select value={subject} onChange={(event) => setSubject(event.target.value)}>
                    <option>수학</option>
                    <option>공통수학</option>
                    <option>미적분</option>
                    <option>확률과 통계</option>
                    <option>기하</option>
                  </select>
                </label>
              </div>
              <label>
                문항 수
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={questionCount}
                  onChange={(event) => setQuestionCount(Number(event.target.value))}
                />
              </label>
              <button className="primary-button" disabled={saving}>
                {saving ? "저장 중..." : "시험 및 문항 구조 생성"}
              </button>
            </form>
          </section>

          <section className="panel list-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">시험 목록</p>
                <h2>등록된 시험</h2>
              </div>
            </div>
            {loading ? (
              <div className="empty">불러오는 중...</div>
            ) : problemSets.length === 0 ? (
              <div className="empty">아직 등록된 시험이 없습니다.</div>
            ) : (
              <div className="set-list">
                {problemSets.map((item) => {
                  const progress = item.question_count
                    ? Math.round((item.analysis_count / item.question_count) * 100)
                    : 0;
                  return (
                    <button
                      key={item.id}
                      className={`set-card ${selectedId === item.id ? "selected" : ""}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="set-card-top">
                        <div>
                          <strong>{item.title}</strong>
                          <span>
                            {item.subject} · {item.question_count}문항
                            {item.exam_date ? ` · ${item.exam_date}` : ""}
                          </span>
                        </div>
                        <span className="progress-number">{progress}%</span>
                      </div>
                      <div className="progress-track">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section className="panel problem-panel">
          <div className="panel-heading horizontal">
            <div>
              <p className="eyebrow">문항 구조</p>
              <h2>{selectedSet?.title ?? "시험을 선택하세요"}</h2>
              <p>
                {selectedSet
                  ? `${selectedSet.question_count}개 문항이 독립 객체로 생성되어 있습니다.`
                  : "왼쪽에서 시험을 등록하거나 선택하면 문항이 표시됩니다."}
              </p>
            </div>
            {selectedSet && (
              <button className="danger-button" onClick={() => void handleDelete(selectedSet)}>
                시험 삭제
              </button>
            )}
          </div>

          {selectedSet ? (
            <div className="problem-grid">
              {selectedProblems.map((problem) => (
                <button className="problem-cell" key={problem.id}>
                  <strong>{problem.question_number}</strong>
                  <span>{problem.analysis_status === "ready" ? "분석 완료" : "분석 대기"}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty large">등록된 시험을 선택해 주세요.</div>
          )}
        </section>
      </section>
    </main>
  );
}
