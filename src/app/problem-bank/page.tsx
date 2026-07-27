"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseConfig } from "@/lib/supabase";

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
};

type Draft = Pick<Problem, "title" | "grade" | "subject" | "unit" | "topic" | "difficulty" | "question_type" | "answer" | "summary" | "source_name" | "status">;

const emptyDraft: Draft = {
  title: "",
  grade: "",
  subject: "",
  unit: "",
  topic: "",
  difficulty: "중",
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

export default function ProblemBankPage() {
  const [items, setItems] = useState<Problem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [grade, setGrade] = useState("전체");
  const [subject, setSubject] = useState("전체");
  const [unit, setUnit] = useState("전체");
  const [difficulty, setDifficulty] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [materializing, setMaterializing] = useState(false);

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
        "source_name", "confidence", "status", "created_at", "updated_at", "question_image_path", "page_no",
      ].join(",");
      const response = await fetch(
        `${config.url}/rest/v1/problem_bank_questions?select=${fields}&order=created_at.desc`,
        { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, cache: "no-store" },
      );
      if (!response.ok) throw new Error(await response.text());
      const rows = (await response.json()) as Problem[];
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
  }, [selected]);

  const grades = useMemo(() => Array.from(new Set(items.map((item) => item.grade).filter(Boolean))).sort(), [items]);
  const subjects = useMemo(() => Array.from(new Set(items.map((item) => item.subject).filter(Boolean))).sort(), [items]);
  const units = useMemo(() => Array.from(new Set(items.map((item) => item.unit).filter(Boolean))).sort(), [items]);
  const difficulties = useMemo(() => Array.from(new Set(items.map((item) => item.difficulty).filter(Boolean))), [items]);

  const filtered = useMemo(() => {
    const q = escapeLike(keyword).toLowerCase();
    return items.filter((item) => {
      const haystack = [item.problem_code, item.title, item.subject, item.unit, item.topic, item.summary, item.answer, item.source_name].join(" ").toLowerCase();
      return (!q || haystack.includes(q))
        && (grade === "전체" || item.grade === grade)
        && (subject === "전체" || item.subject === subject)
        && (unit === "전체" || item.unit === unit)
        && (difficulty === "전체" || item.difficulty === difficulty);
    });
  }, [items, keyword, grade, subject, unit, difficulty]);

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
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
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

  const remove = async () => {
    if (!selected || !window.confirm(`${selected.question_no}번 문항을 문제은행에서 삭제할까요?`)) return;
    const config = getSupabaseConfig();
    if (!config) return setError("Supabase 환경변수를 확인해 주세요.");
    setDeleting(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${config.url}/rest/v1/problem_bank_questions?id=eq.${selected.id}`, {
        method: "DELETE",
        headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
      });
      if (!response.ok) throw new Error(await response.text());
      const remaining = items.filter((item) => item.id !== selected.id);
      setItems(remaining);
      setSelectedId(remaining[0]?.id ?? "");
      setMessage("문항을 삭제했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const materialize = async () => {
    if (!selected) return;
    setMaterializing(true);
    setMessage("");
    setError("");
    try {
      type CropQuestion = {
        id: string;
        question_no: number;
        page_no: number;
        crop_x: number;
        crop_y: number;
        crop_width: number;
        crop_height: number;
      };
      type PrepareResult = {
        success?: boolean;
        message?: string;
        analysisId?: string;
        sourceFileId?: string;
        pdfUrl?: string;
        questions?: CropQuestion[];
      };

      setMessage("시험지 PDF와 문항 좌표를 준비하는 중입니다.");
      const prepareResponse = await fetch("/api/problem-bank/materialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFileId: selected.source_file_id }),
      });
      const prepared = await prepareResponse.json() as PrepareResult;
      if (!prepareResponse.ok || !prepared.success || !prepared.pdfUrl || !prepared.analysisId || !prepared.sourceFileId) {
        throw new Error(prepared.message || "문항 이미지 생성 준비에 실패했습니다.");
      }

      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const pdfBytes = new Uint8Array(await (await fetch(prepared.pdfUrl, { cache: "no-store" })).arrayBuffer());
      const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
      const questions = prepared.questions ?? [];
      const grouped = new Map<number, CropQuestion[]>();
      for (const question of questions) {
        grouped.set(question.page_no, [...(grouped.get(question.page_no) ?? []), question]);
      }

      let saved = 0;
      for (const [pageNo, pageQuestions] of grouped) {
        if (pageNo < 1 || pageNo > pdf.numPages) continue;
        setMessage(`${pageNo}페이지 문항 이미지를 생성하는 중입니다. (${saved}/${questions.length})`);
        const page = await pdf.getPage(pageNo);
        const viewport = page.getViewport({ scale: 2.2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("브라우저 Canvas를 사용할 수 없습니다.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;

        for (const question of pageQuestions) {
          const x = Math.max(0, Math.floor(canvas.width * Number(question.crop_x ?? 0) / 100));
          const y = Math.max(0, Math.floor(canvas.height * Number(question.crop_y ?? 0) / 100));
          const width = Math.min(canvas.width - x, Math.ceil(canvas.width * Number(question.crop_width) / 100));
          const height = Math.min(canvas.height - y, Math.ceil(canvas.height * Number(question.crop_height) / 100));
          if (width < 20 || height < 20) continue;

          const cropped = document.createElement("canvas");
          cropped.width = width;
          cropped.height = height;
          const croppedContext = cropped.getContext("2d");
          if (!croppedContext) continue;
          croppedContext.fillStyle = "#ffffff";
          croppedContext.fillRect(0, 0, width, height);
          croppedContext.drawImage(canvas, x, y, width, height, 0, 0, width, height);
          const blob = await new Promise<Blob | null>((resolve) => cropped.toBlob(resolve, "image/webp", 0.9));
          if (!blob) continue;

          const form = new FormData();
          form.append("image", blob, `${String(question.question_no).padStart(3, "0")}.webp`);
          form.append("analysisId", prepared.analysisId);
          form.append("sourceFileId", prepared.sourceFileId);
          form.append("questionId", question.id);
          form.append("questionNo", String(question.question_no));
          const uploadResponse = await fetch("/api/problem-bank/materialize", { method: "POST", body: form });
          const uploaded = await uploadResponse.json() as { success?: boolean; message?: string };
          if (!uploadResponse.ok || !uploaded.success) throw new Error(`${question.question_no}번: ${uploaded.message || "저장 실패"}`);
          saved += 1;
        }
      }

      setMessage(`${saved}개 문항을 개별 이미지로 저장했습니다.`);
      await loadProblems();
      const imageResponse = await fetch(`/api/problem-bank/questions/${selected.id}/image`, { cache: "no-store" });
      const imageResult = await imageResponse.json() as { success?: boolean; imageUrl?: string };
      setImageUrl(imageResult.success ? imageResult.imageUrl ?? null : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "문항 이미지 생성에 실패했습니다.");
    } finally {
      setMaterializing(false);
    }
  };

  return (
    <main className="bank-page">
      <header className="bank-header">
        <div>
          <button className="back-button" type="button" onClick={() => { window.location.href = "/"; }}>← 관리자</button>
          <p>MATSPU SOS</p>
          <h1>문제은행</h1>
          <span>등록 문항 {items.length}개 · 검색 결과 {filtered.length}개</span>
        </div>
        <button className="refresh-button" type="button" onClick={() => void loadProblems()} disabled={loading}>{loading ? "불러오는 중" : "새로고침"}</button>
      </header>

      <section className="filter-bar">
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="코드, 제목, 단원, 유형, 요약 검색" />
        <select value={grade} onChange={(event) => setGrade(event.target.value)}><option>전체</option>{grades.map((value) => <option key={value}>{value}</option>)}</select>
        <select value={subject} onChange={(event) => setSubject(event.target.value)}><option>전체</option>{subjects.map((value) => <option key={value}>{value}</option>)}</select>
        <select value={unit} onChange={(event) => setUnit(event.target.value)}><option>전체</option>{units.map((value) => <option key={value}>{value}</option>)}</select>
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>전체</option>{difficulties.map((value) => <option key={value}>{value}</option>)}</select>
      </section>

      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="bank-layout">
        <aside className="problem-list">
          <div className="list-head"><span>문항</span><span>단원 · 유형</span><span>난이도</span></div>
          {loading ? <div className="empty">문제은행을 불러오는 중입니다.</div> : filtered.length === 0 ? <div className="empty">조건에 맞는 문항이 없습니다.</div> : filtered.map((item) => (
            <button key={item.id} type="button" className={`problem-row ${selectedId === item.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}>
              <div><strong>{item.question_no}번</strong><small>{item.problem_code}</small></div>
              <div><b>{item.unit || "단원 미분류"}</b><small>{item.topic || item.title}</small></div>
              <span>{item.difficulty || "-"}</span>
            </button>
          ))}
        </aside>

        <section className="problem-detail">
          {!selected ? <div className="empty large">왼쪽에서 문항을 선택해 주세요.</div> : <>
            <div className="pdf-panel">
              <div className="pdf-head">
                <div><strong>{selected.title}</strong><span>{selected.source_name || "출처 미입력"} · {formatDate(selected.created_at)}</span></div>
                <div className="image-actions">
                  <button className="manual-crop-button" type="button" onClick={() => { window.location.href = `/problem-bank/crop?sourceFileId=${encodeURIComponent(selected.source_file_id)}&questionNo=${selected.question_no}`; }}>
                    문항 직접 자르기
                  </button>
                  <button className="make-image-button" type="button" onClick={() => void materialize()} disabled={materializing}>
                    {materializing ? "문항 분리 중..." : "좌표 있는 문항 일괄 생성"}
                  </button>
                </div>
              </div>
              <div className="question-viewer">
                {imageLoading ? <span>문항 이미지를 불러오는 중입니다.</span> : imageUrl ? <img src={imageUrl} alt={`${selected.question_no}번 문항`} /> : <div className="no-image"><b>개별 문항 이미지가 없습니다.</b><span>위 버튼을 눌러 이 시험지의 문항을 각각 저장해 주세요.</span></div>}
              </div>
            </div>

            <form className="edit-panel" onSubmit={(event) => { event.preventDefault(); void save(); }}>
              <div className="edit-head"><div><strong>{selected.question_no}번 분석 정보</strong><span>신뢰도 {selected.confidence == null ? "-" : `${Math.round(Number(selected.confidence))}%`}</span></div><code>{selected.problem_code}</code></div>
              <div className="edit-grid">
                <label className="wide"><span>문항명</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
                <label><span>학년</span><input value={draft.grade} onChange={(event) => setDraft({ ...draft, grade: event.target.value })} /></label>
                <label><span>과목</span><input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></label>
                <label><span>단원</span><input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} /></label>
                <label><span>유형</span><input value={draft.topic} onChange={(event) => setDraft({ ...draft, topic: event.target.value })} /></label>
                <label><span>난이도</span><select value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value })}><option>하</option><option>중</option><option>상</option><option>최상</option></select></label>
                <label><span>문항 형식</span><select value={draft.question_type} onChange={(event) => setDraft({ ...draft, question_type: event.target.value })}><option value="objective">객관식</option><option value="subjective">단답형</option><option value="unknown">미분류</option></select></label>
                <label><span>정답</span><input value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} /></label>
                <label><span>출처</span><input value={draft.source_name} onChange={(event) => setDraft({ ...draft, source_name: event.target.value })} /></label>
                <label className="wide"><span>문항 요약</span><textarea rows={4} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
                <label><span>상태</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft["status"] })}><option value="ACTIVE">사용</option><option value="HOLD">보류</option><option value="ARCHIVED">보관</option></select></label>
              </div>
              <div className="edit-actions"><button type="button" className="delete-button" onClick={() => void remove()} disabled={deleting || saving}>{deleting ? "삭제 중" : "삭제"}</button><button type="submit" className="save-button" disabled={saving || deleting}>{saving ? "저장 중" : "수정 저장"}</button></div>
            </form>
          </>}
        </section>
      </section>

      <style jsx>{`
        .bank-page{min-height:100vh;background:#f4f6fa;color:#263657;padding:24px;font-family:Arial,"Noto Sans KR",sans-serif}.bank-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;max-width:1800px;margin:0 auto 18px}.bank-header p{margin:8px 0 2px;color:#5368e8;font-size:12px;font-weight:900;letter-spacing:.08em}.bank-header h1{margin:0;font-size:32px}.bank-header span{display:block;margin-top:6px;color:#7b8497;font-size:13px}.back-button,.refresh-button{border:1px solid #d9deea;background:#fff;border-radius:11px;padding:10px 13px;font-weight:800;color:#44506d;cursor:pointer}.filter-bar{max-width:1800px;margin:0 auto 14px;display:grid;grid-template-columns:minmax(280px,1.5fr) repeat(4,minmax(130px,.55fr));gap:10px;padding:14px;background:#fff;border:1px solid #e0e4ed;border-radius:15px}.filter-bar input,.filter-bar select{height:44px;border:1px solid #d8deea;border-radius:10px;background:#fff;padding:0 12px;font:inherit;color:#334163}.notice{max-width:1800px;margin:0 auto 12px;padding:12px 14px;border-radius:11px;font-size:13px;font-weight:800}.notice.success{background:#eaf8f1;color:#17805b}.notice.error{background:#fff0f1;color:#b84451}.bank-layout{max-width:1800px;margin:0 auto;display:grid;grid-template-columns:minmax(440px,.72fr) minmax(760px,1.28fr);gap:14px}.problem-list,.problem-detail{background:#fff;border:1px solid #e0e4ed;border-radius:16px;overflow:hidden;min-width:0}.problem-list{max-height:calc(100vh - 190px);overflow:auto}.list-head,.problem-row{display:grid;grid-template-columns:105px minmax(220px,1fr) 70px;gap:12px;align-items:center}.list-head{position:sticky;top:0;z-index:2;padding:13px 16px;background:#f7f8fb;color:#7b8497;font-size:12px;font-weight:900;border-bottom:1px solid #e5e8ef}.problem-row{width:100%;padding:14px 16px;border:0;border-bottom:1px solid #edf0f5;background:#fff;text-align:left;color:inherit;cursor:pointer}.problem-row:hover{background:#f8f9ff}.problem-row.selected{background:#eef2ff;box-shadow:inset 4px 0 0 #5368e8}.problem-row div{display:flex;flex-direction:column;gap:4px;min-width:0}.problem-row strong{font-size:15px}.problem-row b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.problem-row small{color:#8a92a3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.problem-row>span{justify-self:start;padding:5px 8px;border-radius:999px;background:#f0f2f7;font-size:12px;font-weight:900}.problem-detail{display:grid;grid-template-columns:minmax(420px,1.15fr) minmax(360px,.85fr);min-height:720px}.pdf-panel{min-width:0;border-right:1px solid #e2e6ee}.pdf-head,.edit-head{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px;border-bottom:1px solid #e4e7ee}.pdf-head>div:first-child,.edit-head>div{display:flex;flex-direction:column;gap:4px}.pdf-head span,.edit-head span{font-size:12px;color:#7b8497}.image-actions{display:flex;gap:8px;flex-wrap:wrap}.manual-crop-button{border:1px solid #5268e8;background:#fff;color:#5268e8;border-radius:9px;padding:10px 14px;font-weight:900}.make-image-button{border:1px solid #5368e8;background:#5368e8;color:#fff;border-radius:9px;padding:9px 12px;font-weight:900;cursor:pointer}.make-image-button:disabled{opacity:.55}.question-viewer{height:calc(100vh - 280px);min-height:650px;background:#eef1f5;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:28px;color:#7b8497;font-weight:800}.question-viewer img{display:block;max-width:100%;height:auto;background:#fff;box-shadow:0 8px 28px rgba(32,45,74,.12)}.no-image{min-height:520px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center}.no-image span{font-size:13px;font-weight:600}.edit-panel{min-width:0;background:#fbfcff;display:flex;flex-direction:column}.edit-head code{font-size:11px;color:#5368e8;background:#eef2ff;padding:7px 9px;border-radius:8px;max-width:180px;overflow:hidden;text-overflow:ellipsis}.edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px;padding:16px;overflow:auto}.edit-grid label{display:flex;flex-direction:column;gap:6px}.edit-grid label.wide{grid-column:1/-1}.edit-grid label span{font-size:12px;font-weight:900;color:#6d778b}.edit-grid input,.edit-grid select,.edit-grid textarea{width:100%;border:1px solid #d8deea;border-radius:10px;background:#fff;padding:0 11px;color:#263657;font:inherit;font-weight:700;box-sizing:border-box}.edit-grid input,.edit-grid select{height:42px}.edit-grid textarea{padding:11px;resize:vertical;line-height:1.5}.edit-actions{margin-top:auto;display:flex;justify-content:flex-end;gap:9px;padding:14px 16px;border-top:1px solid #e4e7ee;background:#fff}.edit-actions button{min-width:110px;height:42px;border-radius:10px;font-weight:900;cursor:pointer}.delete-button{border:1px solid #edc8cc;background:#fff;color:#b84451}.save-button{border:1px solid #5368e8;background:#5368e8;color:#fff}.edit-actions button:disabled{opacity:.5;cursor:not-allowed}.empty{padding:70px 20px;text-align:center;color:#8a92a3}.empty.large{grid-column:1/-1;display:grid;place-items:center;min-height:600px}@media(max-width:1250px){.bank-layout{grid-template-columns:390px minmax(0,1fr)}.problem-detail{grid-template-columns:1fr}.pdf-panel{border-right:0;border-bottom:1px solid #e2e6ee}.question-viewer{height:600px;min-height:0}}@media(max-width:900px){.bank-page{padding:12px}.filter-bar{grid-template-columns:1fr 1fr}.filter-bar input{grid-column:1/-1}.bank-layout{grid-template-columns:1fr}.problem-list{max-height:440px}.bank-header{align-items:stretch;flex-direction:column}.refresh-button{align-self:flex-start}}@media(max-width:560px){.filter-bar{grid-template-columns:1fr}.filter-bar input{grid-column:auto}.list-head,.problem-row{grid-template-columns:80px minmax(150px,1fr) 55px}.edit-grid{grid-template-columns:1fr}.edit-grid label.wide{grid-column:auto}.pdf-head{align-items:flex-start;flex-direction:column}.question-viewer{height:500px}}
      `}</style>
    </main>
  );
}
