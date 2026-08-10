"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseConfig } from "@/lib/supabase";
import { authHeaders } from "@/lib/supabase/rest";
import AdminPortalShell from "@/components/admin-portal-sidebar";

type Problem = {
  id: string;
  question_no: number;
  problem_code: string;
  title: string;
  grade: string;
  subject: string;
  unit: string;
  topic: string;
  difficulty: string | number;
  source_name: string;
  status: string;
  question_image_path?: string | null;
  problem_dna?: any;
};

type RegradeResult = {
  success?: boolean;
  ok?: boolean;
  problemId?: string;
  difficulty?: string;
  previousDifficulty?: string | null;
  reason?: string;
  confidence?: number;
  csatPointEquivalent?: number;
  csatDifficultyBand?: string;
  message?: string;
};

type TestRow = Problem & { before: string; result?: RegradeResult };

const D = ["1", "2", "3", "4", "5"];

function norm(v: unknown) {
  const raw = String(v ?? "").trim();
  const map: Record<string,string> = { A:"1", B:"2", C:"3", D:"4", E:"5", 하:"1", 중:"2", 상:"4", 최상:"5" };
  return map[raw] ?? (D.includes(raw) ? raw : "2");
}

function confidenceLabel(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function bandLabel(value?: string) {
  const map: Record<string,string> = {
    two_point: "2점급",
    three_point: "3점급",
    four_easy: "쉬운 4점",
    four_medium: "보통 4점",
    four_hard: "어려운 4점",
    semi_killer_easy: "쉬운 준킬러",
    semi_killer_hard: "상위 준킬러",
    killer: "킬러",
  };
  return value ? map[value] ?? value : "-";
}

function TestProblemImage({ problemId, questionNo }: { problemId: string; questionNo: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/problem-bank/questions/${encodeURIComponent(problemId)}/image`, { cache: "no-store" });
        const result = await response.json() as { success?: boolean; imageUrl?: string };
        if (alive) setUrl(response.ok && result.success ? result.imageUrl ?? null : null);
      } catch {
        if (alive) setUrl(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [problemId]);

  if (loading) return <div className="test-image-empty">문항 이미지 불러오는 중...</div>;
  if (!url) return <div className="test-image-empty">문항 이미지를 불러오지 못했습니다.</div>;
  return <button className="test-image-button" onClick={() => window.open(url, "_blank", "noopener,noreferrer")} title="클릭해서 크게 보기"><img src={url} alt={`${questionNo}번 문항`} /></button>;
}

export default function DifficultyManagementPage() {
  const [items, setItems] = useState<Problem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [difficulty, setDifficulty] = useState("전체");
  const [subject, setSubject] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testResults, setTestResults] = useState<TestRow[]>([]);
  const [progress, setProgress] = useState<{ mode: "test" | "all"; done: number; total: number; ok: number; fail: number } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedDifficulty, setSavedDifficulty] = useState<Record<string,string>>({});

  const load = useCallback(async () => {
    const config = getSupabaseConfig();
    if (!config) { setError("Supabase 환경변수를 확인해 주세요."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const fields = ["id","question_no","problem_code","title","grade","subject","unit","topic","difficulty","source_name","status","question_image_path","problem_dna"].join(",");
      const all: Problem[] = [];
      for (let offset=0;;offset+=1000) {
        const res = await fetch(`${config.url}/rest/v1/problem_bank_questions?select=${fields}&status=eq.ACTIVE&order=created_at.desc&offset=${offset}&limit=1000`, { headers:{ ...(await authHeaders()) }, cache:"no-store" });
        if (!res.ok) throw new Error(await res.text());
        const rows = await res.json() as Problem[];
        all.push(...rows.map(x => ({...x, difficulty:norm(x.difficulty)})));
        if (rows.length < 1000) break;
      }
      setItems(all);
    } catch (e) { setError(e instanceof Error ? e.message : "문항을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const subjects = useMemo(() => ["전체", ...Array.from(new Set(items.map(x=>x.subject).filter(Boolean)))], [items]);
  const filtered = useMemo(() => items.filter(x => {
    if (difficulty !== "전체" && norm(x.difficulty) !== difficulty) return false;
    if (subject !== "전체" && x.subject !== subject) return false;
    const q = keyword.trim().toLowerCase();
    if (q && ![x.problem_code,x.title,x.unit,x.topic,x.source_name].join(" ").toLowerCase().includes(q)) return false;
    return true;
  }), [items, keyword, difficulty, subject]);

  const counts = useMemo(() => D.map(d => items.filter(x=>norm(x.difficulty)===d).length), [items]);

  async function changeDifficulty(id:string, value:string) {
    const config = getSupabaseConfig(); if (!config) return;
    const target = items.find(x=>x.id===id); if (!target) return;
    const previous = norm(target.difficulty);
    const dna = { ...(target.problem_dna || {}), difficulty: { ...((target.problem_dna || {}).difficulty || {}), final_grade:value, admin_fixed:true, admin_fixed_at:new Date().toISOString() } };
    setSavingId(id); setError("");
    const res = await fetch(`${config.url}/rest/v1/problem_bank_questions?id=eq.${encodeURIComponent(id)}`, {
      method:"PATCH", headers:{ ...(await authHeaders()), "Content-Type":"application/json", Prefer:"return=representation" },
      body: JSON.stringify({ difficulty:value, problem_dna:dna }),
    });
    if (!res.ok) {
      setError(`난이도 저장 실패: ${await res.text()}`);
      setSavingId(null);
      return;
    }
    const saved = await res.json().catch(()=>[]) as Array<{difficulty?: string|number; problem_dna?: any}>;
    const confirmed = norm(saved?.[0]?.difficulty ?? value);
    const confirmedDna = saved?.[0]?.problem_dna ?? dna;
    setItems(prev => prev.map(x=>x.id===id ? {...x,difficulty:confirmed,problem_dna:confirmedDna} : x));
    setTestResults(prev => prev.map(x=>x.id===id ? {...x,difficulty:confirmed,problem_dna:confirmedDna} : x));
    setSavedDifficulty(prev => ({...prev, [id]:confirmed}));
    setMessage(`${target.question_no}번 난이도 ${previous} → ${confirmed}단계 저장 완료`);
    setSavingId(null);
  }

  async function runTest20() {
    if (running) return;
    const targets = filtered.slice(0,20);
    if (!targets.length) return;
    if (!window.confirm(`현재 필터의 앞 ${targets.length}문항을 AI가 다시 판정합니다. 테스트 결과는 실제 DB 난이도에 반영되지 않습니다. 진행할까요?`)) return;
    setRunning(true); setMessage(""); setError(""); setTestResults([]);
    setProgress({ mode:"test", done:0, total:targets.length, ok:0, fail:0 });
    const rows: TestRow[] = [];
    let ok=0, fail=0;
    try {
      for (let i=0; i<targets.length; i++) {
        const target = targets[i];
        const res = await fetch("/api/problem-bank/regrade-difficulty", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ problemId:target.id, dryRun:true }),
        });
        const data = await res.json().catch(()=>({})) as RegradeResult;
        const result: RegradeResult = { ...data, ok: res.ok && data?.success === true };
        result.ok ? ok++ : fail++;
        rows.push({ ...target, before:norm(target.difficulty), result });
        setTestResults([...rows]);
        setProgress({ mode:"test", done:i+1, total:targets.length, ok, fail });
      }
      setMessage(`20문항 테스트 완료 · 성공 ${ok} · 실패 ${fail} · 실제 난이도는 변경하지 않았습니다.`);
    } catch(e) { setError(e instanceof Error ? e.message : "테스트에 실패했습니다."); }
    finally { setRunning(false); setProgress(null); }
  }

  async function runAll() {
    if (running) return;
    const ids = items.map(x=>x.id);
    if (!ids.length) return;
    if (!window.confirm(`ACTIVE ${ids.length}문항의 난이도를 전체 재판정하고 실제 DB에 반영합니다. 계속할까요?`)) return;
    setRunning(true); setMessage(""); setError("");
    let ok=0, fail=0;
    setProgress({ mode:"all", done:0, total:ids.length, ok:0, fail:0 });
    try {
      for (let i=0;i<ids.length;i+=20) {
        const batch=ids.slice(i,i+20);
        const res=await fetch("/api/problem-bank/regrade-difficulty-batch", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({problemIds:batch,dryRun:false})});
        const data=await res.json().catch(()=>({}));
        if (!res.ok) { fail += batch.length; }
        else for (const r of (Array.isArray(data.results)?data.results:[])) r?.ok ? ok++ : fail++;
        const done=Math.min(i+20,ids.length);
        setProgress({ mode:"all", done, total:ids.length, ok, fail });
        setMessage(`전체 난이도 측정 중 · ${done}/${ids.length} · 성공 ${ok} · 실패 ${fail}`);
      }
      setMessage(`전체 난이도 측정 완료 · 성공 ${ok} · 실패 ${fail}`); await load();
    } catch(e) { setError(e instanceof Error ? e.message : "전체 재판정에 실패했습니다."); }
    finally { setRunning(false); setProgress(null); }
  }

  return <AdminPortalShell current="sos-difficulty">
  <main className="difficulty-page">
    <div className="difficulty-wrap">
      <div className="difficulty-header">
        <div><div className="eyebrow">MATHPOOH SOS</div><h1>난이도 관리</h1><p>문제은행 분석과 분리된 난이도 전용 관리 화면입니다.</p></div>
        <div className="header-buttons"><button onClick={()=>location.href="/admin?menu=sos-learning"}>관리자 홈</button><button onClick={()=>location.href="/problem-bank"}>SOS 문제은행</button></div>
      </div>

      {progress && <div className="progress-card">
        <div className="progress-copy"><b>{progress.mode === "test" ? "20문항 테스트 중입니다..." : "전체 난이도 측정 중입니다..."}</b><span>{progress.done}/{progress.total} · 성공 {progress.ok} · 실패 {progress.fail}</span></div>
        <div className="progress-track"><i style={{width:`${progress.total ? Math.round(progress.done/progress.total*100) : 0}%`}} /></div>
      </div>}
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}

      <div className="difficulty-kpis">{D.map((d,i)=><div key={d}><b>{d}단계</b><strong>{counts[i]}</strong></div>)}</div>

      <div className="filter-bar">
        <input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="문항명·단원·유형·출처 검색"/>
        <select value={subject} onChange={e=>setSubject(e.target.value)}>{subjects.map(x=><option key={x}>{x}</option>)}</select>
        <select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option>전체</option>{D.map(x=><option key={x} value={x}>{x}단계</option>)}</select>
        <button disabled={running} onClick={runTest20}>20문항 테스트</button>
        <button disabled={running} onClick={runAll} className="primary">전체 재판정</button>
      </div>

      {testResults.length>0 && <section className="test-section">
        <div className="test-section-head"><div><b>20문항 테스트 결과</b><span>문제를 직접 보고 AI 제안을 검수하세요. 테스트만으로는 DB가 변경되지 않습니다.</span></div><strong>{testResults.filter(x=>x.result?.ok).length}/{testResults.length} 성공</strong></div>
        <div className="test-grid">{testResults.map((x)=><article key={x.id} className={`test-card ${x.result?.ok ? (x.before !== String(x.result.difficulty) ? "changed" : "same") : "failed"}`}>
          <div className="test-card-head"><div><b>{x.question_no}번</b><span>{x.subject} · {x.unit}</span></div><code>{x.problem_code}</code></div>
          <div className="test-image-wrap"><TestProblemImage problemId={x.id} questionNo={x.question_no}/></div>
          <div className="test-title">{x.title}</div>
          <div className="difficulty-compare">
            <div><small>현재 저장 난이도{x.before !== norm(x.difficulty) ? ` · 테스트 당시 ${x.before}` : ""}</small><strong>{norm(x.difficulty)}</strong></div><span>→</span><div><small>AI 제안</small><strong className={x.result?.ok ? "proposal" : "fail-text"}>{x.result?.ok ? x.result.difficulty : "실패"}</strong></div>
          </div>
          {x.result?.ok ? <>
            <div className="ai-meta"><span>{bandLabel(x.result.csatDifficultyBand)}</span><span>신뢰도 {confidenceLabel(x.result.confidence)}</span></div>
            <div className="reason-box"><b>AI 판정 근거</b><p>{x.result.reason || "판정 근거가 없습니다."}</p></div>
            <div className="review-actions">
              <button className="accept" disabled={savingId===x.id || norm(x.difficulty)===String(x.result.difficulty)} onClick={()=>void changeDifficulty(x.id,String(x.result?.difficulty ?? x.before))}>{savingId===x.id ? "저장 중..." : norm(x.difficulty)===String(x.result.difficulty) ? "현재값과 동일" : `AI 제안 ${x.result.difficulty} 적용`}</button>
              <label><span>직접 수정</span><select disabled={savingId===x.id} value={norm(x.difficulty)} onChange={e=>void changeDifficulty(x.id,e.target.value)}>{D.map(d=><option key={d} value={d}>{d}단계</option>)}</select></label>
            </div>
            {savedDifficulty[x.id] && <div className="saved-inline">✓ DB에 {savedDifficulty[x.id]}단계로 저장됨</div>}
          </> : <div className="reason-box failure"><b>실패 이유</b><p>{x.result?.message || "AI 판정에 실패했습니다."}</p></div>}
        </article>)}</div>
      </section>}

      <div className="bank-table">
        <div className="bank-row head"><span>문항</span><span>코드</span><span>단원 · 유형</span><span>출처</span><span>난이도</span></div>
        {loading ? <div className="loading-row">불러오는 중...</div> : filtered.map(x=><div key={x.id} className="bank-row"><b>{x.question_no}번</b><span>{x.problem_code}</span><span><b>{x.unit}</b><small>{x.topic || x.title}</small></span><span>{x.source_name}</span><select value={norm(x.difficulty)} onChange={e=>void changeDifficulty(x.id,e.target.value)}>{D.map(d=><option key={d} value={d}>{d}단계</option>)}</select></div>)}
      </div>
    </div>
    <style jsx>{`
      .difficulty-page{min-height:100vh;background:#f5f7f6;padding:28px;font-family:Arial,"Noto Sans KR",sans-serif;color:#15231c}.difficulty-wrap{max-width:1560px;margin:0 auto}.difficulty-header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}.eyebrow{font-size:12px;font-weight:900;color:#247a4b;letter-spacing:1px}.difficulty-header h1{margin:6px 0;font-size:30px}.difficulty-header p{margin:0;color:#66736c}.header-buttons{display:flex;gap:8px}.header-buttons button,.filter-bar button{border:1px solid #d9e1dc;background:#fff;border-radius:9px;padding:10px 14px;font-weight:800;cursor:pointer}.progress-card{background:#eff8f2;border:1px solid #b9dcc7;border-radius:13px;padding:14px 16px;margin-bottom:12px}.progress-copy{display:flex;justify-content:space-between;gap:12px;margin-bottom:9px}.progress-copy span{color:#4f6658;font-size:13px}.progress-track{height:10px;background:#dcebe1;border-radius:999px;overflow:hidden}.progress-track i{display:block;height:100%;background:#247a4b;transition:width .2s}.notice{padding:12px;border-radius:10px;margin-bottom:12px}.notice.success{background:#eaf7ef;border:1px solid #b7dfc6}.notice.error{background:#fff0f0;border:1px solid #efc0c0;color:#a52020}.difficulty-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px}.difficulty-kpis>div{background:#fff;border:1px solid #dfe6e2;border-radius:12px;padding:16px}.difficulty-kpis strong{display:block;font-size:28px;margin-top:6px}.filter-bar{background:#fff;border:1px solid #dfe6e2;border-radius:14px;padding:14px;margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap}.filter-bar input{min-width:300px;flex:1;padding:10px;border:1px solid #d9e1dc;border-radius:8px}.filter-bar select,.bank-row select,.review-actions select{padding:9px;border:1px solid #d9e1dc;border-radius:8px;background:#fff}.filter-bar .primary{background:#207a49;color:#fff;border-color:#207a49}.filter-bar button:disabled,.review-actions button:disabled{opacity:.5;cursor:not-allowed}.test-section{background:#fff;border:1px solid #dfe6e2;border-radius:14px;padding:16px;margin-bottom:16px}.test-section-head{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:14px}.test-section-head>div{display:flex;flex-direction:column;gap:4px}.test-section-head b{font-size:18px}.test-section-head span{font-size:13px;color:#6e7a73}.test-section-head>strong{color:#247a4b}.test-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.test-card{border:1px solid #dfe6e2;border-radius:13px;padding:14px;background:#fcfdfc;min-width:0}.test-card.changed{border-color:#e2bd74;box-shadow:inset 4px 0 0 #d49a2d}.test-card.failed{border-color:#edc7c7;box-shadow:inset 4px 0 0 #c94d4d}.test-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.test-card-head>div{display:flex;flex-direction:column;gap:3px}.test-card-head b{font-size:18px}.test-card-head span{font-size:12px;color:#6f7b74}.test-card-head code{font-size:11px;color:#607168;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.test-image-wrap{height:340px;background:#eef2ef;border:1px solid #e0e6e2;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center}.test-image-button{width:100%;height:100%;border:0;background:#fff;padding:8px;cursor:zoom-in}.test-image-button img{display:block;width:100%;height:100%;object-fit:contain}.test-image-empty{color:#7b857f;font-size:13px}.test-title{font-weight:800;font-size:14px;line-height:1.45;margin:10px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.difficulty-compare{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;background:#f3f6f4;border-radius:10px;padding:10px}.difficulty-compare>div{display:flex;align-items:center;justify-content:center;gap:8px}.difficulty-compare small{color:#748078}.difficulty-compare strong{font-size:24px}.difficulty-compare .proposal{color:#1d7545}.difficulty-compare .fail-text{color:#b63737;font-size:16px}.ai-meta{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.ai-meta span{background:#eef5f1;color:#3b6650;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800}.reason-box{border:1px solid #e3e9e5;border-radius:10px;padding:10px 12px;background:#fff}.reason-box b{font-size:12px;color:#607168}.reason-box p{margin:5px 0 0;line-height:1.55;font-size:13px}.reason-box.failure{background:#fff5f5;border-color:#efcece}.review-actions{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-top:10px}.review-actions .accept{flex:1;border:1px solid #247a4b;background:#247a4b;color:#fff;border-radius:9px;padding:10px;font-weight:900;cursor:pointer}.review-actions label{display:flex;flex-direction:column;gap:4px}.review-actions label span{font-size:11px;color:#6f7b74;font-weight:800}.saved-inline{margin-top:8px;padding:8px 10px;border-radius:8px;background:#eaf7ef;color:#17663b;font-size:12px;font-weight:900;text-align:center}.bank-table{background:#fff;border:1px solid #dfe6e2;border-radius:14px;overflow:hidden}.bank-row{display:grid;grid-template-columns:80px 150px 1.2fr 1fr 130px;gap:10px;padding:12px;border-top:1px solid #edf0ee;align-items:center}.bank-row.head{font-weight:800;background:#f0f5f2;border-top:0}.bank-row>span:nth-child(3){display:flex;flex-direction:column;gap:3px}.bank-row small{color:#78847d}.loading-row{padding:30px}@media(max-width:1050px){.test-grid{grid-template-columns:1fr}.difficulty-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.difficulty-page{padding:14px}.difficulty-header{flex-direction:column}.difficulty-kpis{grid-template-columns:repeat(2,1fr)}.test-image-wrap{height:280px}.bank-row{grid-template-columns:60px 1fr 95px}.bank-row>span:nth-child(2),.bank-row>span:nth-child(4),.bank-row.head>span:nth-child(2),.bank-row.head>span:nth-child(4){display:none}.progress-copy{flex-direction:column}}
    `}</style>
  </main>
  </AdminPortalShell>;
}
