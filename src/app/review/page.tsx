"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AnalysisData = Record<string, unknown>;

type ReviewQuestion = {
  id: string;
  question_no: number;
  answer: string | null;
  confidence: number | null;
  ai_result: AnalysisData | null;
  review_result: AnalysisData | null;
  review_reason: string | null;
  question_image_path?: string | null;
  source_analysis?: {
    source_files?: {
      title?: string;
      source?: string;
      grade?: string;
      subject?: string;
    };
  };
};

type FormData = {
  subject: string;
  majorUnit: string;
  middleUnit: string;
  minorUnit: string;
  difficulty: string;
  thinkingType: string;
  requiredSkills: string[];
  coreConcepts: string;
  solutionStrategy: string;
  summary: string;
  answer: string;
};

const DIFFICULTIES = ["A", "B", "C", "D", "E"];
const THINKING_TYPES = ["개념형", "계산형", "추론형", "활용형", "증명형"];
const REQUIRED_SKILLS = [
  "수식 처리형",
  "조건 해석형",
  "대수적 해석형",
  "그래프 해석형",
  "도형 해석형",
  "경우 분류형",
  "자료 해석형",
  "실생활형",
];

function text(data: AnalysisData | null | undefined, ...keys: string[]) {
  for (const key of keys) {
    const item = data?.[key];
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  return "";
}

function stringArray(data: AnalysisData | null | undefined, ...keys: string[]) {
  for (const key of keys) {
    const item = data?.[key];
    if (Array.isArray(item)) return item.filter((value): value is string => typeof value === "string");
    if (typeof item === "string" && item.trim()) {
      return item.split(/[,|]/).map((value) => value.trim()).filter(Boolean);
    }
  }
  return [];
}

function getResult(question: ReviewQuestion) {
  return question.review_result && Object.keys(question.review_result).length > 0
    ? question.review_result
    : question.ai_result ?? {};
}

function toForm(question: ReviewQuestion): FormData {
  const result = getResult(question);
  return {
    subject: text(result, "subject") || question.source_analysis?.source_files?.subject || "",
    majorUnit: text(result, "major_unit", "majorUnit", "unit"),
    middleUnit: text(result, "middle_unit", "middleUnit", "topic"),
    minorUnit: text(result, "minor_unit", "minorUnit"),
    difficulty: text(result, "difficulty") || "C",
    thinkingType: text(result, "thinking_type", "thinkingType"),
    requiredSkills: stringArray(result, "required_skills", "requiredSkills"),
    coreConcepts: stringArray(result, "core_concepts", "coreConcepts").join(", ") || text(result, "core_concepts", "coreConcepts"),
    solutionStrategy: text(result, "solution_strategy", "solutionStrategy", "strategy"),
    summary: text(result, "summary", "one_line_summary", "oneLineSummary"),
    answer: question.answer ?? text(result, "answer"),
  };
}

function toReviewResult(form: FormData): AnalysisData {
  const coreConcepts = form.coreConcepts.split(/[,|]/).map((item) => item.trim()).filter(Boolean);
  return {
    subject: form.subject.trim() || null,
    unit: form.majorUnit.trim() || null,
    topic: form.middleUnit.trim() || null,
    major_unit: form.majorUnit.trim() || null,
    middle_unit: form.middleUnit.trim() || null,
    minor_unit: form.minorUnit.trim() || null,
    difficulty: form.difficulty || "C",
    thinking_type: form.thinkingType || null,
    required_skills: form.requiredSkills,
    core_concepts: coreConcepts,
    solution_strategy: form.solutionStrategy.trim() || null,
    summary: form.summary.trim() || null,
    answer: form.answer.trim() || null,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 7 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: "#4b5563" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "11px 12px",
  borderRadius: 10,
  border: "1px solid #d8d2c3",
  background: "#fff",
  color: "#1f2937",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

export default function ReviewPage() {
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");

  const active = useMemo(
    () => questions.find((question) => question.id === activeId) ?? questions[0] ?? null,
    [activeId, questions],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/review/questions", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "조회 실패");
      const nextQuestions = (payload.questions ?? []) as ReviewQuestion[];
      setQuestions(nextQuestions);
      setActiveId((current) => nextQuestions.some((item) => item.id === current) ? current : nextQuestions[0]?.id ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "검수대기 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!active) {
      setForm(null);
      setImageUrl("");
      return;
    }
    setForm(toForm(active));
    setImageUrl("");
    if (!active.question_image_path) return;

    let cancelled = false;
    void fetch(`/api/review/questions/${active.id}/image`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && payload.success && typeof payload.imageUrl === "string") setImageUrl(payload.imageUrl);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [active]);

  function patch<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }

  function toggleSkill(skill: string) {
    if (!form) return;
    patch("requiredSkills", form.requiredSkills.includes(skill)
      ? form.requiredSkills.filter((item) => item !== skill)
      : [...form.requiredSkills, skill]);
  }

  function applyAiResult() {
    if (!active) return;
    setForm(toForm({ ...active, review_result: null }));
    setMessage("AI 원본 분석값을 다시 적용했습니다.");
  }

  async function saveOnly() {
    if (!active || !form) return false;
    setWorking("save");
    setMessage("");
    try {
      const reviewResult = toReviewResult(form);
      const response = await fetch(`/api/analysis/questions/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: form.answer, review_result: reviewResult }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "저장 실패");
      setQuestions((current) => current.map((item) => item.id === active.id
        ? { ...item, answer: form.answer, review_result: reviewResult }
        : item));
      setMessage("검수 내용을 저장했습니다.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
      return false;
    } finally {
      setWorking("");
    }
  }

  async function finish(action: "approve" | "reject") {
    if (!active || !form) return;
    setWorking(action);
    setMessage("");
    try {
      const response = await fetch(`/api/review/questions/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          answer: form.answer,
          reviewResult: toReviewResult(form),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "처리 실패");
      const next = questions.filter((item) => item.id !== active.id);
      setQuestions(next);
      setActiveId(next[0]?.id ?? null);
      setMessage(action === "approve" ? "문제은행에 등록했습니다." : "문항을 삭제 처리했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "문항 처리에 실패했습니다.");
    } finally {
      setWorking("");
    }
  }

  const source = active?.source_analysis?.source_files;
  const confidence = Math.round(Number(active?.confidence ?? 0) * 100);

  return (
    <main style={{ minHeight: "100vh", background: "#f4f1e8", color: "#1f2937" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, borderBottom: "1px solid #ded6c4", background: "rgba(250,248,242,.96)", backdropFilter: "blur(10px)" }}>
        <div style={{ maxWidth: 1540, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ padding: "5px 9px", borderRadius: 999, background: "#1f2937", color: "#f6d77f", fontSize: 12, fontWeight: 900 }}>MPAI</span>
              <h1 style={{ margin: 0, fontSize: 27, letterSpacing: "-.04em" }}>AI 분석 검수 작업장</h1>
            </div>
            <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>문제의 사고 구조를 확인하고 Problem DNA를 확정합니다.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ padding: "9px 13px", borderRadius: 10, background: "#fff", border: "1px solid #ded6c4" }}>검수대기 {questions.length}</strong>
            <button onClick={() => void load()} disabled={loading} style={{ ...inputStyle, width: "auto", cursor: "pointer", fontWeight: 800 }}>새로고침</button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1540, margin: "0 auto", padding: 22, display: "grid", gridTemplateColumns: "260px minmax(420px, 1fr) minmax(520px, 1.16fr)", gap: 16, alignItems: "start" }}>
        <aside style={{ position: "sticky", top: 104, maxHeight: "calc(100vh - 126px)", overflow: "auto", background: "#fff", border: "1px solid #ded6c4", borderRadius: 16, padding: 10 }}>
          <div style={{ padding: "9px 10px 12px", fontSize: 13, color: "#6b7280", fontWeight: 800 }}>신뢰도 낮은 순</div>
          {loading ? <div style={{ padding: 14 }}>불러오는 중...</div> : null}
          {!loading && questions.length === 0 ? <div style={{ padding: 18, color: "#6b7280", textAlign: "center" }}>검수대기 없음</div> : null}
          <div style={{ display: "grid", gap: 7 }}>
            {questions.map((question) => {
              const itemSource = question.source_analysis?.source_files;
              const percent = Math.round(Number(question.confidence ?? 0) * 100);
              const selected = question.id === active?.id;
              return (
                <button key={question.id} onClick={() => setActiveId(question.id)} style={{ textAlign: "left", border: selected ? "1px solid #b58a2a" : "1px solid #ebe6da", background: selected ? "#fff7df" : "#fff", borderRadius: 12, padding: 12, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>{question.question_no}번</strong>
                    <span style={{ color: percent < 80 ? "#b91c1c" : "#9a6700", fontWeight: 900 }}>{percent}%</span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 12, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{itemSource?.title ?? "시험지"}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <section style={{ position: "sticky", top: 104, background: "#fff", border: "1px solid #ded6c4", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "15px 17px", borderBottom: "1px solid #ebe6da", display: "flex", justifyContent: "space-between", gap: 14 }}>
            <div>
              <strong style={{ fontSize: 18 }}>{source?.title ?? "문항 미선택"}{active ? ` · ${active.question_no}번` : ""}</strong>
              <div style={{ marginTop: 5, fontSize: 13, color: "#6b7280" }}>{[source?.grade, source?.subject, source?.source].filter(Boolean).join(" · ")}</div>
            </div>
            {active ? <span style={{ alignSelf: "start", padding: "7px 10px", borderRadius: 999, background: confidence < 80 ? "#fee2e2" : "#fff1c7", color: confidence < 80 ? "#991b1b" : "#8a5b00", fontWeight: 900 }}>{confidence}%</span> : null}
          </div>
          <div style={{ minHeight: 620, maxHeight: "calc(100vh - 210px)", overflow: "auto", background: "#f5f3ed", display: "grid", placeItems: "center", padding: 16 }}>
            {!active ? <div style={{ color: "#6b7280" }}>검수할 문항이 없습니다.</div> : imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={`${active.question_no}번 문항`} style={{ display: "block", maxWidth: "100%", height: "auto", background: "white", boxShadow: "0 8px 24px rgba(0,0,0,.08)" }} />
            ) : (
              <div style={{ textAlign: "center", color: "#6b7280", lineHeight: 1.7 }}>
                <div style={{ fontSize: 42 }}>▧</div>
                문항 이미지가 아직 생성되지 않았습니다.<br />분석값을 기준으로 검수해 주세요.
              </div>
            )}
          </div>
        </section>

        <section style={{ background: "#fff", border: "1px solid #ded6c4", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "15px 17px", borderBottom: "1px solid #ebe6da", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <strong style={{ fontSize: 18 }}>Problem DNA</strong>
              <div style={{ marginTop: 4, color: "#6b7280", fontSize: 13 }}>{active?.review_reason || "AI 분석 결과를 검수합니다."}</div>
            </div>
            <button onClick={applyAiResult} disabled={!active || Boolean(working)} style={{ ...inputStyle, width: "auto", padding: "9px 12px", cursor: "pointer", fontWeight: 800 }}>AI 분석값 적용</button>
          </div>

          {!form ? <div style={{ minHeight: 600, display: "grid", placeItems: "center", color: "#6b7280" }}>문항을 선택해 주세요.</div> : (
            <div style={{ padding: 17, display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="과목"><input value={form.subject} onChange={(event) => patch("subject", event.target.value)} style={inputStyle} placeholder="공통수학1" /></Field>
                <Field label="정답"><input value={form.answer} onChange={(event) => patch("answer", event.target.value)} style={inputStyle} placeholder="정답" /></Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Field label="대단원"><input value={form.majorUnit} onChange={(event) => patch("majorUnit", event.target.value)} style={inputStyle} /></Field>
                <Field label="중단원"><input value={form.middleUnit} onChange={(event) => patch("middleUnit", event.target.value)} style={inputStyle} /></Field>
                <Field label="소단원"><input value={form.minorUnit} onChange={(event) => patch("minorUnit", event.target.value)} style={inputStyle} /></Field>
              </div>

              <Field label="난이도">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7 }}>
                  {DIFFICULTIES.map((difficulty) => <button key={difficulty} onClick={() => patch("difficulty", difficulty)} style={{ padding: "10px 0", borderRadius: 9, cursor: "pointer", fontWeight: 900, border: form.difficulty === difficulty ? "1px solid #a77913" : "1px solid #ddd6c7", background: form.difficulty === difficulty ? "#f4d77e" : "#fff" }}>{difficulty}</button>)}
                </div>
              </Field>

              <Field label="사고 유형 · 1개 선택">
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {THINKING_TYPES.map((type) => <button key={type} onClick={() => patch("thinkingType", type)} style={{ padding: "9px 12px", borderRadius: 999, cursor: "pointer", border: form.thinkingType === type ? "1px solid #1f2937" : "1px solid #ddd6c7", background: form.thinkingType === type ? "#1f2937" : "#fff", color: form.thinkingType === type ? "#fff" : "#374151", fontWeight: 800 }}>{type}</button>)}
                </div>
              </Field>

              <Field label="요구 능력 · 복수 선택">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {REQUIRED_SKILLS.map((skill) => {
                    const selected = form.requiredSkills.includes(skill);
                    return <button key={skill} onClick={() => toggleSkill(skill)} style={{ textAlign: "left", padding: "10px 11px", borderRadius: 9, cursor: "pointer", border: selected ? "1px solid #b58a2a" : "1px solid #e2ddd2", background: selected ? "#fff7df" : "#fff", fontWeight: selected ? 900 : 600 }}>{selected ? "✓ " : "○ "}{skill}</button>;
                  })}
                </div>
              </Field>

              <Field label="핵심 개념 · 쉼표로 구분"><input value={form.coreConcepts} onChange={(event) => patch("coreConcepts", event.target.value)} style={inputStyle} placeholder="평행조건, 직선의 방정식" /></Field>
              <Field label="풀이 전략"><textarea value={form.solutionStrategy} onChange={(event) => patch("solutionStrategy", event.target.value)} style={{ ...inputStyle, minHeight: 92, resize: "vertical", lineHeight: 1.6 }} /></Field>
              <Field label="핵심 한 줄"><textarea value={form.summary} onChange={(event) => patch("summary", event.target.value)} style={{ ...inputStyle, minHeight: 72, resize: "vertical", lineHeight: 1.6 }} placeholder="평행조건을 이용하여 직선의 방정식을 구하는 문제" /></Field>

              {message ? <div style={{ padding: "11px 13px", borderRadius: 10, background: message.includes("실패") || message.includes("없습니다") ? "#fee2e2" : "#eef7e9", color: message.includes("실패") ? "#991b1b" : "#365314", fontWeight: 700 }}>{message}</div> : null}

              <div style={{ position: "sticky", bottom: 0, margin: "0 -17px -17px", padding: 14, borderTop: "1px solid #e7e1d4", background: "rgba(255,255,255,.97)", display: "flex", justifyContent: "space-between", gap: 9 }}>
                <button onClick={() => void finish("reject")} disabled={Boolean(working)} style={{ padding: "11px 15px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", color: "#991b1b", fontWeight: 800, cursor: "pointer" }}>{working === "reject" ? "처리 중..." : "삭제"}</button>
                <div style={{ display: "flex", gap: 9 }}>
                  <button onClick={() => void saveOnly()} disabled={Boolean(working)} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid #c8ad68", background: "#fff", fontWeight: 800, cursor: "pointer" }}>{working === "save" ? "저장 중..." : "임시 저장"}</button>
                  <button onClick={() => void finish("approve")} disabled={Boolean(working)} style={{ padding: "11px 19px", borderRadius: 10, border: 0, background: "#ad8120", color: "#fff", fontWeight: 900, cursor: "pointer" }}>{working === "approve" ? "등록 중..." : "승인 · 문제은행 등록"}</button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
