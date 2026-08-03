"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseConfig } from "@/lib/supabase";
import { authHeaders } from "@/lib/supabase/rest";
import { ProblemDnaCard } from "@/components/problem-dna-card";
import type { ProblemDNA } from "@/lib/problem-dna";
import AdminPortalShell from "@/components/admin-portal-sidebar";

type Problem = {
  id: string;
  source_file_id: string;
  analysis_question_id: string;
  question_no: number;
  problem_code: string;
  title: string;
  grade: string;
  subject: string;
  unit: string;
  topic: string;
  difficulty: string;
  question_type: string;
  answer: string;
  summary: string;
  source_name: string;
  confidence: number | null;
  status: "ACTIVE" | "HOLD" | "ARCHIVED";
  created_at: string;
  updated_at: string;
  question_image_path: string | null;
  page_no: number | null;
  problem_dna: ProblemDNA | null;
  analysis_version: string | null;
  content_role?: "TRAINING" | "REFERENCE";
  training_course?: string;
};

type Draft = Pick<Problem, "title" | "grade" | "subject" | "unit" | "topic" | "difficulty" | "question_type" | "answer" | "summary" | "source_name" | "status">;

const emptyDraft: Draft = {
  title: "",
  grade: "",
  subject: "",
  unit: "",
  topic: "",
  difficulty: "2",
  question_type: "unknown",
  answer: "",
  summary: "",
  source_name: "",
  status: "ACTIVE",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }).format(date);
}

function escapeLike(value: string) {
  return value.replace(/[,%()]/g, " ").trim();
}

function confidencePercent(value: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  const number = Number(value);
  return `${Math.round(number <= 1 ? number * 100 : number)}%`;
}

function normalizeDifficulty(value: unknown) {
  const raw = String(value ?? "").trim();
  return ({ A: "1", B: "2", C: "3", D: "4", E: "5", 하: "1", 중: "2", 상: "4", 최상: "5" } as Record<string, string>)[raw] ?? (/^[1-5]$/.test(raw) ? raw : "2");
}

function questionTypeLabel(value: string) {
  return ({ multiple_choice: "객관식", short_answer: "단답형", essay: "서술형", unknown: "미분류" } as Record<string, string>)[value] ?? value;
}

export default function ProblemBankPage() {
  const [items, setItems] = useState<Problem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [grade, setGrade] = useState("전체");
  const [subject, setSubject] = useState("전체");
  const [unit, setUnit] = useState("전체");
  const [difficulty, setDifficulty] = useState("전체");
  const [questionType, setQuestionType] = useState("전체");
  const [sourceFileId, setSourceFileId] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [solutionImageUrl, setSolutionImageUrl] = useState<string | null>(null);
  const [solutionImageLoading, setSolutionImageLoading] = useState(false);
  const [assetMode, setAssetMode] = useState<"question" | "solution">("question");
  const [detailTab, setDetailTab] = useState<"basic" | "dna">("basic");

  const loadProblems = useCallback(async () => {
    const config = getSupabaseConfig();
    if (!config) {
      setError("Supabase 환경변수를 확인해 주세요.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const fields = [
        "id", "source_file_id", "analysis_question_id", "question_no", "problem_code", "title",
        "grade", "subject", "unit", "topic", "difficulty", "question_type", "answer", "summary",
        "source_name", "confidence", "status", "content_role", "training_course", "created_at", "updated_at", "question_image_path", "page_no", "problem_dna", "analysis_version",
      ].join(",");
      const response = await fetch(
        `${config.url}/rest/v1/problem_bank_questions?select=${fields}&order=created_at.desc`,
        { headers: { ...(await authHeaders()) }, cache: "no-store" },
      );
      if (!response.ok) throw new Error(await response.text());
      const rows = ((await response.json()) as Problem[]).map((item) => ({ ...item, difficulty: normalizeDifficulty(item.difficulty) }));
      setItems(rows);
      setSelectedId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문제은행을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProblems(); }, [loadProblems]);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setDraft(emptyDraft);
      setImageUrl(null);
      setSolutionImageUrl(null);
      return;
    }

    setDraft({
      title: selected.title,
      grade: selected.grade,
      subject: selected.subject,
      unit: selected.unit,
      topic: selected.topic,
      difficulty: selected.difficulty,
      question_type: selected.question_type,
      answer: selected.answer,
      summary: selected.summary,
      source_name: selected.source_name,
      status: selected.status,
    });

    setImageUrl(null);
    setImageLoading(true);
    setSolutionImageUrl(null);
    setSolutionImageLoading(true);
    setAssetMode("question");
    setDetailTab("basic");
    void (async () => {
      try {
        const response = await fetch(`/api/problem-bank/questions/${selected.id}/image`, { cache: "no-store" });
        const result = await response.json() as { success?: boolean; imageUrl?: string; message?: string };
        if (!response.ok || !result.success) throw new Error(result.message || "문항 이미지를 불러오지 못했습니다.");
        setImageUrl(result.imageUrl ?? null);
      } catch {
        setImageUrl(null);
      } finally {
        setImageLoading(false);
      }
    })();
    void (async () => {
      try {
        const response = await fetch(`/api/problem-bank/questions/${selected.id}/solution-image`, { cache: "no-store" });
        const result = await response.json() as { success?: boolean; imageUrl?: string };
        setSolutionImageUrl(response.ok && result.success ? result.imageUrl ?? null : null);
      } catch { setSolutionImageUrl(null); }
      finally { setSolutionImageLoading(false); }
    })();
  }, [selected]);

  const grades = useMemo(() => Array.from(new Set(items.map((item) => item.grade).filter(Boolean))).sort(), [items]);
  const subjects = useMemo(() => Array.from(new Set(items.map((item) => item.subject).filter(Boolean))).sort(), [items]);
  const units = useMemo(() => Array.from(new Set(items.map((item) => item.unit).filter(Boolean))).sort(), [items]);
  const difficulties = useMemo(() => Array.from(new Set(items.map((item) => item.difficulty).filter(Boolean))), [items]);
  const questionTypes = useMemo(() => Array.from(new Set(items.map((item) => item.question_type).filter(Boolean))).sort(), [items]);
  const sources = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) if (!map.has(item.source_file_id)) map.set(item.source_file_id, item.title.replace(/\s+\d+번$/, ""));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "ko"));
  }, [items]);

  const filtered = useMemo(() => {
    const q = escapeLike(keyword).toLowerCase();
    return items.filter((item) => {
      const dnaText = item.problem_dna ? JSON.stringify(item.problem_dna) : "";
      const haystack = [item.problem_code, item.title, item.subject, item.unit, item.topic, item.summary, item.answer, item.source_name, questionTypeLabel(item.question_type), dnaText].join(" ").toLowerCase();
      return (!q || haystack.includes(q))
        && (grade === "전체" || item.grade === grade)
        && (subject === "전체" || item.subject === subject)
        && (unit === "전체" || item.unit === unit)
        && (difficulty === "전체" || item.difficulty === difficulty)
        && (questionType === "전체" || item.question_type === questionType)
        && (sourceFileId === "전체" || item.source_file_id === sourceFileId);
    });
  }, [items, keyword, grade, subject, unit, difficulty, questionType, sourceFileId]);

  const resetFilters = () => {
    setKeyword(""); setGrade("전체"); setSubject("전체"); setUnit("전체");
    setDifficulty("전체"); setQuestionType("전체"); setSourceFileId("전체");
  };

  const save = async () => {
    if (!selected) return;
    const config = getSupabaseConfig();
    if (!config) return setError("Supabase 환경변수를 확인해 주세요.");
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${config.url}/rest/v1/problem_bank_questions?id=eq.${selected.id}`, {
        method: "PATCH",
        headers: {
          ...(await authHeaders()),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ ...draft, updated_at: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error(await response.text());
      const rows = (await response.json()) as Problem[];
      const updated = rows[0];
      if (updated) setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage("수정 내용을 저장했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (scope: "question" | "source") => {
    if (!selected) return;
    const sourceTitle = selected.title.replace(/\s+\d+번$/, "");
    const expected = scope === "source" ? sourceTitle : selected.title;
    const warning = scope === "source"
      ? `이 시험지의 문제은행 문항을 전부 삭제합니다.\n원본·Crop·해설은 보존되고 AI 분석 3단계로 돌아갑니다.\n\n삭제하려면 시험지명을 정확히 입력하세요:\n${expected}`
      : `${selected.question_no}번을 문제은행에서 삭제합니다.\n원본·Crop·해설은 보존되고 AI 분석 3단계로 돌아갑니다.\n\n삭제하려면 문항명을 정확히 입력하세요:\n${expected}`;
    const confirmation = window.prompt(warning);
    if (confirmation === null) return;
    if (confirmation.trim() !== expected) return setError("삭제 확인 문구가 일치하지 않아 취소했습니다.");
    setDeleting(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/problem-bank/questions/${selected.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, confirmation }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "삭제에 실패했습니다.");
      await loadProblems();
      setMessage(payload.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };


  return (
    <AdminPortalShell current="sos-bank">
    <main className="bank-page">
      <header className="bank-header">
        <div>
          <button
            className="back-button"
            type="button"
            onClick={() => {
              window.location.href = "/admin";
            }}
          >
            ← 관리자
          </button>
          <p>MATSPU SOS</p>
          <h1>문제은행</h1>
          <span>등록 문항 {items.length}개 · 검색 결과 {filtered.length}개</span>
        </div>
        <button className="refresh-button" type="button" onClick={() => void loadProblems()} disabled={loading}>{loading ? "불러오는 중" : "새로고침"}</button>
      </header>

      <section className="filter-bar">
        <label className="filter-search"><span>통합 검색</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="코드·단원·세부주제·핵심개념·요약 검색" /></label>
        <label><span>시험지</span><select value={sourceFileId} onChange={(event) => setSourceFileId(event.target.value)}><option value="전체">전체 시험지</option>{sources.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
        <label><span>학년</span><select value={grade} onChange={(event) => setGrade(event.target.value)}><option>전체</option>{grades.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>과목</span><select value={subject} onChange={(event) => setSubject(event.target.value)}><option>전체</option>{subjects.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>단원</span><select value={unit} onChange={(event) => setUnit(event.target.value)}><option>전체</option>{units.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>난이도</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="전체">전체</option>{difficulties.map((value) => <option key={value} value={value}>{value}단계</option>)}</select></label>
        <label><span>문항 유형</span><select value={questionType} onChange={(event) => setQuestionType(event.target.value)}><option value="전체">전체</option>{questionTypes.map((value) => <option key={value} value={value}>{questionTypeLabel(value)}</option>)}</select></label>
        <button type="button" className="filter-reset" onClick={resetFilters}>필터 초기화</button>
      </section>

      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="bank-layout">
        <aside className="problem-list">
          <div className="list-head"><span>문항</span><span>단원 · 유형</span><span>난이도</span></div>
          {loading ? <div className="empty">문제은행을 불러오는 중입니다.</div> : filtered.length === 0 ? <div className="empty">조건에 맞는 문항이 없습니다.</div> : filtered.map((item) => (
            <button key={item.id} type="button" className={`problem-row ${selectedId === item.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}>
              <div><strong>{item.question_no}번</strong><small>{item.problem_code}</small></div>
              <div title={`${item.unit || "단원 미분류"}\n${item.topic || item.title}`}><b>{item.unit || "단원 미분류"}</b><small>{item.topic || item.title}</small></div>
              <span className={`difficulty-chip difficulty-${item.difficulty || "unknown"}`}>{item.difficulty || "-"}</span>
            </button>
          ))}
        </aside>

        <section className="problem-detail">
          {!selected ? <div className="empty large">왼쪽에서 문항을 선택해 주세요.</div> : <>
            <div className="pdf-panel">
              <div className="pdf-head">
                <div><strong>{selected.title}</strong><span>{selected.source_name || "출처 미입력"} · {formatDate(selected.created_at)}</span></div>
                <div className="asset-tabs"><button type="button" className={assetMode === "question" ? "active" : ""} onClick={() => setAssetMode("question")}>문제</button><button type="button" className={assetMode === "solution" ? "active" : ""} onClick={() => setAssetMode("solution")}>공식 해설</button></div>
              </div>
              <div className="question-viewer">
                {assetMode === "question" ? (imageLoading ? <span>문항 이미지를 불러오는 중입니다.</span> : imageUrl ? <img src={imageUrl} alt={`${selected.question_no}번 문항`} /> : <div className="no-image"><b>개별 문항 이미지가 없습니다.</b><span>AI 분석관리에서 문항 박스를 검수한 뒤 등록해 주세요.</span></div>) : (solutionImageLoading ? <span>공식 해설 이미지를 불러오는 중입니다.</span> : solutionImageUrl ? <img src={solutionImageUrl} alt={`${selected.question_no}번 공식 해설`} /> : <div className="no-image"><b>문항별 공식 해설 이미지가 없습니다.</b><span>AI 분석관리에서 해당 문항을 재분석해 주세요.</span></div>)}
              </div>
            </div>

            <form className="edit-panel" onSubmit={(event) => { event.preventDefault(); void save(); }}>
              <div className="edit-head"><div><strong>{selected.question_no}번 분석 정보</strong><span>신뢰도 {confidencePercent(selected.confidence)} · {selected.analysis_version || "legacy"}</span></div><code>{selected.problem_code}</code></div>
              <div className="detail-tabs"><button type="button" className={detailTab === "basic" ? "active" : ""} onClick={() => setDetailTab("basic")}>기본정보 수정</button><button type="button" className={detailTab === "dna" ? "active" : ""} onClick={() => setDetailTab("dna")}>문항 DNA</button></div>
              {detailTab === "basic" ? <div className="edit-grid">
                <label className="wide"><span>문항명</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
                <label><span>학년</span><input value={draft.grade} onChange={(event) => setDraft({ ...draft, grade: event.target.value })} /></label>
                <label><span>과목</span><input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></label>
                <label><span>단원</span><input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} /></label>
                <label><span>유형</span><input value={draft.topic} onChange={(event) => setDraft({ ...draft, topic: event.target.value })} /></label>
                <label><span>난이도</span><select value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value })}><option value="1">1단계 · 개념 확인</option><option value="2">2단계 · 기본 유형</option><option value="3">3단계 · 응용 유형</option><option value="4">4단계 · 준킬러</option><option value="5">5단계 · 최상위·킬러</option></select></label>
                <label><span>문항 형식</span><select value={draft.question_type} onChange={(event) => setDraft({ ...draft, question_type: event.target.value })}><option value="multiple_choice">객관식</option><option value="short_answer">단답형</option><option value="essay">서술형</option><option value="unknown">미분류</option></select></label>
                <label><span>정답</span><input value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} /></label>
                <label><span>출처</span><input value={draft.source_name} onChange={(event) => setDraft({ ...draft, source_name: event.target.value })} /></label>
                <label className="wide"><span>문항 요약</span><textarea rows={4} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
                <label><span>상태</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft["status"] })}><option value="ACTIVE">사용</option><option value="HOLD">보류</option><option value="ARCHIVED">보관</option></select></label>
              </div> : <div className="dna-panel">{selected.problem_dna ? <ProblemDnaCard dna={selected.problem_dna} questionNo={selected.question_no} /> : <div className="no-dna">문항 DNA가 없습니다. AI 분석관리에서 재분석해 주세요.</div>}</div>}
              <div className="edit-actions"><button type="button" className="delete-button" onClick={() => void remove("question")} disabled={deleting || saving}>{deleting ? "삭제 중" : "이 문항 삭제"}</button><button type="button" className="delete-source-button" onClick={() => void remove("source")} disabled={deleting || saving}>시험지 전체 삭제</button><button type="submit" className="save-button" disabled={saving || deleting}>{saving ? "저장 중" : "수정 저장"}</button></div>
            </form>
          </>}
        </section>
      </section>

      <style jsx>{`
        .bank-page{min-height:100vh;background:#f4f6fa;color:#315f39;padding:24px;font-family:Arial,"Noto Sans KR",sans-serif}.bank-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;max-width:1800px;margin:0 auto 18px}.bank-header p{margin:8px 0 2px;color:#2f6937;font-size:12px;font-weight:900;letter-spacing:.08em}.bank-header h1{margin:0;font-size:32px}.bank-header span{display:block;margin-top:6px;color:#7b8497;font-size:13px}.back-button,.refresh-button{border:1px solid #d9deea;background:#fff;border-radius:11px;padding:10px 13px;font-weight:800;color:#44506d;cursor:pointer}.filter-bar{max-width:1800px;margin:0 auto 14px;display:grid;grid-template-columns:minmax(280px,1.5fr) repeat(4,minmax(130px,.55fr));gap:10px;padding:14px;background:#fff;border:1px solid #e0e4ed;border-radius:15px}.filter-bar input,.filter-bar select{height:44px;border:1px solid #d8deea;border-radius:10px;background:#fff;padding:0 12px;font:inherit;color:#426b48}.notice{max-width:1800px;margin:0 auto 12px;padding:12px 14px;border-radius:11px;font-size:13px;font-weight:800}.notice.success{background:#eaf8f1;color:#17805b}.notice.error{background:#fff0f1;color:#b84451}.bank-layout{max-width:1800px;margin:0 auto;display:grid;grid-template-columns:minmax(440px,.72fr) minmax(760px,1.28fr);gap:14px}.problem-list,.problem-detail{background:#fff;border:1px solid #e0e4ed;border-radius:16px;overflow:hidden;min-width:0}.problem-list{max-height:calc(100vh - 190px);overflow:auto}.list-head,.problem-row{display:grid;grid-template-columns:105px minmax(220px,1fr) 70px;gap:12px;align-items:center}.list-head{position:sticky;top:0;z-index:2;padding:13px 16px;background:#f7f8fb;color:#7b8497;font-size:12px;font-weight:900;border-bottom:1px solid #e5e8ef}.problem-row{width:100%;padding:14px 16px;border:0;border-bottom:1px solid #edf0f5;background:#fff;text-align:left;color:inherit;cursor:pointer}.problem-row:hover{background:#f8f9ff}.problem-row.selected{background:#f3f7f3;box-shadow:inset 4px 0 0 #2f6937}.problem-row div{display:flex;flex-direction:column;gap:4px;min-width:0}.problem-row strong{font-size:15px}.problem-row b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.problem-row small{color:#8a92a3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.problem-row>span{justify-self:start;padding:5px 8px;border-radius:999px;background:#f0f2f7;font-size:12px;font-weight:900}.problem-detail{display:grid;grid-template-columns:minmax(420px,1.15fr) minmax(360px,.85fr);min-height:720px}.pdf-panel{min-width:0;border-right:1px solid #e2e6ee}.pdf-head,.edit-head{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px;border-bottom:1px solid #e4e7ee}.pdf-head>div:first-child,.edit-head>div{display:flex;flex-direction:column;gap:4px}.pdf-head span,.edit-head span{font-size:12px;color:#7b8497}.asset-tabs,.detail-tabs{display:flex;gap:6px}.asset-tabs button,.detail-tabs button{border:1px solid #d7ddea;background:#fff;color:#64708a;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:900;cursor:pointer}.asset-tabs button.active,.detail-tabs button.active{border-color:#2f6937;background:#2f6937;color:#fff}.detail-tabs{padding:10px 16px 0}.question-viewer{height:calc(100vh - 280px);min-height:650px;background:#eef1f5;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:28px;color:#7b8497;font-weight:800}.question-viewer img{display:block;max-width:100%;height:auto;background:#fff;box-shadow:0 8px 28px rgba(47,105,55,.12)}.no-image{min-height:520px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center}.no-image span{font-size:13px;font-weight:600}.edit-panel{min-width:0;background:#fbfcff;display:flex;flex-direction:column;max-height:calc(100vh - 190px);overflow:auto}.edit-head code{font-size:11px;color:#2f6937;background:#f3f7f3;padding:7px 9px;border-radius:8px;max-width:180px;overflow:hidden;text-overflow:ellipsis}.edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px;padding:16px}.edit-grid label{display:flex;flex-direction:column;gap:6px}.edit-grid label.wide{grid-column:1/-1}.edit-grid label span{font-size:12px;font-weight:900;color:#6d778b}.edit-grid input,.edit-grid select,.edit-grid textarea{width:100%;border:1px solid #d8deea;border-radius:10px;background:#fff;padding:0 11px;color:#315f39;font:inherit;font-weight:700;box-sizing:border-box}.edit-grid input,.edit-grid select{height:42px}.edit-grid textarea{padding:11px;resize:vertical;line-height:1.5}.dna-panel{padding:14px 16px}.no-dna{padding:60px 20px;text-align:center;color:#8a92a3}.edit-actions{margin-top:auto;display:flex;justify-content:flex-end;gap:9px;padding:14px 16px;border-top:1px solid #e4e7ee;background:#fff;position:sticky;bottom:0}.edit-actions button{min-width:110px;height:42px;border-radius:10px;font-weight:900;cursor:pointer}.delete-button{border:1px solid #edc8cc;background:#fff;color:#b84451}.save-button{border:1px solid #2f6937;background:#2f6937;color:#fff}.edit-actions button:disabled{opacity:.5;cursor:not-allowed}.empty{padding:70px 20px;text-align:center;color:#8a92a3}.empty.large{grid-column:1/-1;display:grid;place-items:center;min-height:600px}@media(max-width:1250px){.bank-layout{grid-template-columns:390px minmax(0,1fr)}.problem-detail{grid-template-columns:1fr}.pdf-panel{border-right:0;border-bottom:1px solid #e2e6ee}.question-viewer{height:600px;min-height:0}.edit-panel{max-height:none}}@media(max-width:900px){.bank-page{padding:12px}.filter-bar{grid-template-columns:1fr 1fr}.filter-bar input{grid-column:1/-1}.bank-layout{grid-template-columns:1fr}.problem-list{max-height:440px}.bank-header{align-items:stretch;flex-direction:column}.refresh-button{align-self:flex-start}}@media(max-width:560px){.filter-bar{grid-template-columns:1fr}.filter-bar input{grid-column:auto}.list-head,.problem-row{grid-template-columns:80px minmax(150px,1fr) 55px}.edit-grid{grid-template-columns:1fr}.edit-grid label.wide{grid-column:auto}.pdf-head{align-items:flex-start;flex-direction:column}.question-viewer{height:500px}}
      `}</style>
      <style jsx>{`
        .bank-page{--navy:#285c31;--navy2:#285c31;--gold:#4d7d46;--gold-soft:#f3f7f3;--line:#dfe4ed;background:linear-gradient(180deg,#edf1f7 0,#f7f8fb 360px);padding:18px 22px 28px}
        .bank-header{max-width:1920px;min-height:104px;margin-bottom:12px;padding:18px 22px;border-radius:18px;background:linear-gradient(112deg,#2f6937 0%,#4d8346 54%,#91b866 100%);box-shadow:0 12px 30px rgba(47,105,55,.16);align-items:center}
        .bank-header p{color:#e8f2e8;margin:0 0 4px}.bank-header h1{color:#fff;font-size:30px;letter-spacing:-.04em}.bank-header span{color:rgba(255,255,255,.78)}.back-button{border-color:rgba(255,255,255,.38);background:rgba(255,255,255,.1);color:#fff}.refresh-button{border-color:#fff;background:#fff;color:#2f6937;padding:12px 18px}
        .filter-bar{max-width:1920px;margin-bottom:12px;padding:11px;border-radius:14px;box-shadow:0 5px 18px rgba(47,105,55,.06);display:flex;align-items:flex-end;flex-wrap:wrap;gap:8px}.filter-bar label{display:grid;gap:5px;min-width:112px;flex:1}.filter-bar label.filter-search{min-width:300px;flex:2}.filter-bar label:nth-child(2){min-width:240px;flex:1.4}.filter-bar label>span{padding-left:3px;color:#728099;font-size:10px;font-weight:900}.filter-bar input,.filter-bar select{width:100%;height:42px;border-color:#d9dfea;background:#fbfcfe;font-size:13px;font-weight:700;box-sizing:border-box}.filter-bar input:focus,.filter-bar select:focus{outline:3px solid rgba(47,105,55,.16);border-color:var(--gold)}.filter-reset{height:42px;padding:0 14px;border:1px solid #d9dfea;border-radius:9px;background:#fff;color:#56637b;font-weight:900;cursor:pointer}.filter-reset:hover{border-color:var(--gold);color:#4d7d46}
        .bank-layout{max-width:1920px;grid-template-columns:390px minmax(0,1fr);gap:12px}.problem-list,.problem-detail{border-radius:16px;border-color:#dce2eb;box-shadow:0 8px 26px rgba(47,105,55,.07)}.problem-list{max-height:calc(100vh - 184px);background:#f8fafc}.list-head,.problem-row{grid-template-columns:58px minmax(0,1fr) 42px}.list-head{padding:12px 13px;background:var(--navy);color:#dbe2ef;border:0}.problem-row{padding:12px 13px;background:#fff;border-bottom-color:#e9edf3;min-height:76px}.problem-row:hover{background:#f3f7f3}.problem-row.selected{background:var(--gold-soft);box-shadow:inset 5px 0 0 var(--gold)}.problem-row strong{font-size:15px;color:var(--navy)}.problem-row b{font-size:13px;color:#253654}.problem-row small{font-size:10px;color:#8a94a5}.problem-row>span{padding:0;background:transparent}.difficulty-chip{display:grid!important;place-items:center;width:31px;height:31px;border-radius:50%!important;font-size:12px!important;color:#fff!important;background:#748097!important}.difficulty-1{background:#37815f!important}.difficulty-2{background:#55835d!important}.difficulty-3{background:#6f985c!important}.difficulty-4{background:#cf6f45!important}.difficulty-5{background:#a34d5a!important}
        .problem-detail{grid-template-columns:minmax(500px,1.22fr) minmax(430px,.78fr);min-height:calc(100vh - 184px);background:#fff}.pdf-panel{background:#edf0f4;border-right-color:#dce1e9}.pdf-head,.edit-head{min-height:64px;background:#fff;padding:11px 16px}.pdf-head strong{font-size:14px;color:var(--navy)}.asset-tabs{padding:3px;border-radius:10px;background:#eef1f6}.asset-tabs button{border:0;background:transparent;color:#667289}.asset-tabs button.active{background:var(--navy);color:#fff;box-shadow:0 3px 9px rgba(47,105,55,.2)}.question-viewer{height:calc(100vh - 248px);min-height:580px;padding:30px;background:radial-gradient(circle at 50% 20%,#f6f7f9,#e4e8ed);align-items:flex-start}.question-viewer img{border-radius:4px;box-shadow:0 18px 45px rgba(47,105,55,.22)}
        .edit-panel{max-height:calc(100vh - 184px);background:#f8f9fc}.edit-head{position:sticky;top:0;z-index:4;background:var(--navy);border:0}.edit-head strong{color:#fff;font-size:15px}.edit-head span{color:#bec8da}.edit-head code{color:#e5f0e6;background:rgba(255,255,255,.1)}.detail-tabs{position:sticky;top:64px;z-index:3;padding:10px 14px;background:#fff;border-bottom:1px solid var(--line)}.detail-tabs button{flex:1;border:0;background:#eef1f6;padding:9px}.detail-tabs button.active{background:var(--gold);color:#fff}.edit-grid{gap:10px;padding:14px}.edit-grid label{padding:10px;border:1px solid #e1e6ee;border-radius:11px;background:#fff;gap:5px}.edit-grid label span{font-size:10px;color:#768197}.edit-grid input,.edit-grid select,.edit-grid textarea{border:0;border-radius:0;padding:0;background:transparent;font-size:13px}.edit-grid input,.edit-grid select{height:29px}.edit-grid input:focus,.edit-grid select:focus,.edit-grid textarea:focus{outline:none}.dna-panel{padding:14px;background:#f5f7fa}.edit-actions{padding:11px 14px;flex-wrap:wrap}.save-button{border-color:var(--navy);background:var(--navy)}.delete-button{background:#fff8f8}.delete-source-button{border:1px solid #b84451;background:#b84451;color:#fff}.notice{max-width:1920px}
        @media(max-width:1400px){.bank-layout{grid-template-columns:340px minmax(0,1fr)}.problem-detail{grid-template-columns:minmax(450px,1fr) minmax(390px,.85fr)}}@media(max-width:900px){.filter-bar{display:grid;grid-template-columns:1fr 1fr}.filter-bar label,.filter-bar label.filter-search,.filter-bar label:nth-child(2){min-width:0}.filter-bar label.filter-search,.filter-bar label:nth-child(2){grid-column:1/-1}.filter-reset{width:100%}}@media(max-width:560px){.filter-bar{grid-template-columns:1fr}.filter-bar label.filter-search,.filter-bar label:nth-child(2){grid-column:auto}}
      `}</style>
    </main>
    </AdminPortalShell>
  );
}
