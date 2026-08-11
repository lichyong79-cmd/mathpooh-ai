"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseConfig } from "@/lib/supabase";
import { authHeaders } from "@/lib/supabase/rest";
import AdminPortalShell from "@/components/admin-portal-sidebar";
import { DIFFICULTY_SCALE, DIFFICULTY_SCALE_VERSION, difficultyFromBand, difficultyLabel, normalizeProblemDifficulty } from "@/lib/difficulty-scale";
import { SUBJECTS, canonicalSubject } from "@/lib/subject";
import { evidenceDifficultyLevel } from "@/lib/problem-dna";

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
  created_at?: string;
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

const D = DIFFICULTY_SCALE.map((x) => x.value);
function norm(v: unknown, dna?: any) { return normalizeProblemDifficulty(v, dna, "2"); }

function confidenceLabel(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function bandLabel(value?: string) {
  const map: Record<string,string> = { two_point:"2점",three_point:"3점",three_hard:"어3",four_easy:"쉬4",four_medium:"적4",four_hard:"어4",semi_killer:"준킬러",semi_killer_easy:"준킬러",semi_killer_hard:"준킬러",killer:"킬러" };
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
  return <div className="test-image-scroll" title="문항을 위아래로 스크롤해서 확인하세요"><img src={url} alt={`${questionNo}번 문항`} /></div>;
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
  const [progress, setProgress] = useState<{ mode: "anomaly"; done: number; total: number; ok: number; fail: number } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedDifficulty, setSavedDifficulty] = useState<Record<string,string>>({});

  const load = useCallback(async () => {
    const config = getSupabaseConfig();
    if (!config) { setError("Supabase 환경변수를 확인해 주세요."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const fields = ["id","question_no","problem_code","title","grade","subject","unit","topic","difficulty","source_name","status","question_image_path","problem_dna","created_at"].join(",");
      const all: Problem[] = [];
      for (let offset=0;;offset+=1000) {
        const res = await fetch(`${config.url}/rest/v1/problem_bank_questions?select=${fields}&status=eq.ACTIVE&order=created_at.desc&offset=${offset}&limit=1000`, { headers:{ ...(await authHeaders()) }, cache:"no-store" });
        if (!res.ok) throw new Error(await res.text());
        const rows = await res.json() as Problem[];
        all.push(...rows.map(x => ({...x, difficulty:norm(x.difficulty,x.problem_dna)})));
        if (rows.length < 1000) break;
      }
      setItems(all);
    } catch (e) { setError(e instanceof Error ? e.message : "문항을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const subjects = useMemo(() => {
    const present = new Set(items.map(x => canonicalSubject(x.subject)));
    return ["전체", ...SUBJECTS.filter(v => present.has(v)), ...(present.has("미분류") ? ["미분류"] : [])];
  }, [items]);
  const filtered = useMemo(() => items.filter(x => {
    if (difficulty !== "전체" && norm(x.difficulty,x.problem_dna) !== difficulty) return false;
    if (subject !== "전체" && canonicalSubject(x.subject) !== subject) return false;
    const q = keyword.trim().toLowerCase();
    if (q && ![x.problem_code,x.title,x.unit,x.topic,x.source_name].join(" ").toLowerCase().includes(q)) return false;
    return true;
  }), [items, keyword, difficulty, subject]);

  const counts = useMemo(() => D.map(d => items.filter(x=>norm(x.difficulty,x.problem_dna)===d).length), [items]);

  async function changeDifficulty(id:string, value:string) {
    const config = getSupabaseConfig(); if (!config) return;
    const target = items.find(x=>x.id===id); if (!target) return;
    const previous = norm(target.difficulty,target.problem_dna);
    const dna = { ...(target.problem_dna || {}), difficulty: { ...((target.problem_dna || {}).difficulty || {}), final_grade:Number(value), scale_version:DIFFICULTY_SCALE_VERSION, admin_fixed:true, admin_fixed_at:new Date().toISOString() } };
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
    const confirmed = norm(saved?.[0]?.difficulty ?? value, saved?.[0]?.problem_dna ?? dna);
    const confirmedDna = saved?.[0]?.problem_dna ?? dna;
    setItems(prev => prev.map(x=>x.id===id ? {...x,difficulty:confirmed,problem_dna:confirmedDna} : x));
    setTestResults(prev => prev.map(x=>x.id===id ? {...x,difficulty:confirmed,problem_dna:confirmedDna} : x));
    setSavedDifficulty(prev => ({...prev, [id]:confirmed}));
    setMessage(`${target.question_no}번 난이도 ${difficultyLabel(previous)} → ${difficultyLabel(confirmed)} 저장 완료`);
    setSavingId(null);
  }


  async function runFullEightScaleReview() {
    if (running) return;
    const targets = items.filter((x) => x.problem_dna?.difficulty?.admin_fixed !== true);
    const fixed = items.length - targets.length;
    if (!window.confirm(
      `저장된 DNA만 사용해 전체 난이도를 8단계로 다시 계산합니다.

`
      + `대상 ${targets.length}문항 · 관리자 확정 ${fixed}문항 보존
`
      + `AI/OpenAI 호출 0회 · 추가 AI 비용 0원

진행할까요?`
    )) return;

    setRunning(true); setMessage(""); setError(""); setTestResults([]);
    setProgress({mode:"anomaly",done:0,total:items.length,ok:0,fail:0});
    let offset=0, ok=0, fail=0, fixedSkipped=0, noDna=0;
    try {
      while (true) {
        const res=await fetch("/api/problem-bank/recalculate-difficulty-from-dna",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({offset,limit:250}),
        });
        const data=await res.json().catch(()=>({}));
        if(!res.ok||data?.success!==true) throw new Error(data?.message||`DNA 재계산 실패 (${res.status})`);
        ok += Number(data.updated)||0;
        fail += Number(data.failed)||0;
        fixedSkipped += Number(data.skippedFixed)||0;
        noDna += Number(data.skippedNoDna)||0;
        offset = Number(data.nextOffset)||offset;
        setProgress({mode:"anomaly",done:Math.min(offset,items.length),total:items.length,ok,fail});
        setMessage(`DNA 난이도 재계산 중 · ${Math.min(offset,items.length)}/${items.length} · 변경 ${ok} · 관리자확정 보존 ${fixedSkipped} · DNA없음 ${noDna} · 실패 ${fail}`);
        if(data.done===true) break;
      }
      await load();
      setMessage(`DNA 난이도 재계산 완료 · 변경 ${ok} · 관리자확정 보존 ${fixedSkipped} · DNA없음 ${noDna}${fail?` · 실패 ${fail}`:""} · AI 호출 0회`);
    } catch(e) {
      setError(e instanceof Error?e.message:"DNA 난이도 재계산에 실패했습니다.");
    } finally { setRunning(false); setProgress(null); }
  }

  async function runAnomalyReview() {
    if (running) return;

    const fixed = items.filter(x => x.problem_dna?.difficulty?.admin_fixed === true);
    const validFixed = fixed.filter(x => x.problem_dna?.difficulty?.scale_version === DIFFICULTY_SCALE_VERSION);
    const referenceIds = DIFFICULTY_SCALE.flatMap(scale =>
      validFixed.filter(x => norm(x.difficulty, x.problem_dna) === scale.value).slice(0, 3).map(x => x.id)
    );

    // 먼저 저장된 AI 메타데이터에서 의심 신호가 있는 문항을 우선 선별한다.
    const ranked = items
      .filter(x => x.problem_dna?.difficulty?.admin_fixed !== true)
      .map(x => {
        const current = norm(x.difficulty, x.problem_dna);
        const d = x.problem_dna?.difficulty ?? {};
        const bandValue = difficultyFromBand(d.csat_difficulty_band);
        const finalValue = String(d.final_grade ?? "");
        const confidence = Number(d.ai_regrade_confidence ?? x.problem_dna?.confidence ?? 1);
        // v164: 문항 근거(개념·조건해석·발상·계산·시간)만으로 계산한 난이도.
        // 밴드만 보고 3점으로 몰려 등록된 문항을 찾아내는 핵심 신호다.
        const evidence = d && Object.keys(d).length ? String(evidenceDifficultyLevel(d)) : "";
        const evidenceGap = evidence && current ? Math.abs(Number(evidence) - Number(current)) : 0;
        let suspicion = 0;
        if (bandValue && bandValue !== current) suspicion += 100;
        if (/^[1-8]$/.test(finalValue) && finalValue !== current) suspicion += 90;
        if (evidenceGap >= 2) suspicion += 60 + evidenceGap * 25;
        if (d.band_conflict === true) suspicion += 85;
        if (!d.ai_regrade_version) suspicion += 40; // 8단계 전용 재판정을 한 번도 안 거친 문항
        if (d.scale_version !== DIFFICULTY_SCALE_VERSION) suspicion += 80;
        if (Number.isFinite(confidence) && confidence < .72) suspicion += 70 + Math.round((.72-confidence)*100);
        if (Number(current) >= 7) suspicion += 30; // 준킬러/킬러는 소수이므로 정기 재확인
        return { x, suspicion, confidence: Number.isFinite(confidence) ? confidence : 1 };
      })
      .sort((a,b) => b.suspicion-a.suspicion || a.confidence-b.confidence);

    // 의심 신호가 있는 문항 + 최신 일반 문항 일부를 2차 AI 검토한다.
    const suspicious = ranked.filter(r => r.suspicion > 0).map(r => r.x);
    const fallback = ranked.filter(r => r.suspicion === 0).slice(0, 40).map(r => r.x);
    const targets = [...suspicious, ...fallback].slice(0, 120);
    if (!targets.length) { setMessage("AI 이상 난이도 검토 대상이 없습니다."); return; }

    if (!window.confirm(`AI가 ${targets.length}문항을 2차 검토하고, 현재 난이도와 다르게 판단한 문항만 보여줍니다. DB는 자동 변경하지 않습니다. 진행할까요?`)) return;

    setRunning(true); setMessage(""); setError(""); setTestResults([]);
    setProgress({ mode:"anomaly", done:0, total:targets.length, ok:0, fail:0 });
    const anomalies: TestRow[] = [];
    let ok=0, fail=0;
    try {
      for (let i=0; i<targets.length; i+=20) {
        const batch = targets.slice(i,i+20);
        const res = await fetch("/api/problem-bank/regrade-difficulty-batch", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({problemIds:batch.map(x=>x.id),dryRun:true,referenceIds})
        });
        const data = await res.json().catch(()=>({}));
        const results = Array.isArray(data.results) ? data.results : [];
        const map = new Map(results.map((r:any)=>[String(r.problemId),r]));
        for (const target of batch) {
          const result:any = map.get(String(target.id));
          if (result?.ok || result?.success) {
            ok++;
            const proposed = String(result.difficulty ?? "");
            const current = norm(target.difficulty,target.problem_dna);
            if (proposed && proposed !== current && Number(result.confidence ?? 0) >= .60) {
              anomalies.push({...target,before:current,result:{...result,ok:true}});
            }
          } else fail++;
        }
        const done=Math.min(i+20,targets.length);
        setTestResults([...anomalies]);
        setProgress({mode:"anomaly",done,total:targets.length,ok,fail});
        setMessage(`AI 이상 난이도 검토 중 · ${done}/${targets.length} · 이상 의심 ${anomalies.length} · 검토 실패 ${fail}`);
      }
      setMessage(`AI 이상 난이도 검토 완료 · ${targets.length}문항 확인 · 이상 의심 ${anomalies.length}문항${fail ? ` · 실패 ${fail}` : ""}. 자동 변경은 하지 않았습니다.`);
    } catch(e) { setError(e instanceof Error ? e.message : "AI 이상 난이도 검토에 실패했습니다."); }
    finally { setRunning(false); setProgress(null); }
  }

  return <AdminPortalShell current="sos-difficulty">
  <main className="difficulty-page">
    <div className="difficulty-wrap">
      <div className="difficulty-header">
        <div><div className="eyebrow">MATHPOOH SOS</div><h1>난이도 관리</h1><p>평소에는 AI가 현재 난이도가 이상하다고 판단한 문항만 검토합니다. 8단계 절대난이도는 전 시스템 공통 기준입니다.</p></div>
        <div className="header-buttons"><button onClick={()=>location.href="/admin?menu=sos-learning"}>관리자 홈</button><button onClick={()=>location.href="/problem-bank"}>SOS 문제은행</button></div>
      </div>

      {progress && <div className="progress-card">
        <div className="progress-copy"><b>AI 이상 난이도 검토 중입니다...</b><span>{progress.done}/{progress.total} · 검토 성공 {progress.ok} · 실패 {progress.fail}</span></div>
        <div className="progress-track"><i style={{width:`${progress.total ? Math.round(progress.done/progress.total*100) : 0}%`}} /></div>
      </div>}
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}

      <div className="difficulty-kpis">{D.map((d,i)=><div key={d}><b>{difficultyLabel(d)}</b><strong>{counts[i]}</strong></div>)}</div>

      <div className="filter-bar">
        <input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="문항명·단원·유형·출처 검색"/>
        <select value={subject} onChange={e=>setSubject(e.target.value)}>{subjects.map(x=><option key={x}>{x}</option>)}</select>
        <select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option>전체</option>{DIFFICULTY_SCALE.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select>
        <button disabled={running} onClick={runFullEightScaleReview} className="primary">1회용 · DNA로 전체 난이도 재계산</button>
        <button disabled={running} onClick={runAnomalyReview}>AI 이상 난이도 검토</button>
      </div>

      {testResults.length>0 && <section className="test-section">
        <div className="test-section-head"><div><b>AI 이상 난이도 검토</b><span>AI가 현재 저장 난이도와 다르게 판단한 문항만 표시합니다. 유지·AI 제안 적용·직접 수정 중 하나를 선택하세요.</span></div><strong>{testResults.length}문항 의심</strong></div>
        <div className="test-grid">{testResults.map((x)=><article key={x.id} className={`test-card ${x.result?.ok ? (x.before !== String(x.result.difficulty) ? "changed" : "same") : "failed"}`}>
          <div className="test-card-head"><div><b>{x.question_no}번</b><span>{x.subject} · {x.unit}</span></div><code>{x.problem_code}</code></div>
          <div className="test-image-wrap"><TestProblemImage problemId={x.id} questionNo={x.question_no}/></div>
          <div className="test-title">{x.title}</div>
          <div className="difficulty-compare">
            <div><small>현재 저장 난이도{x.before !== norm(x.difficulty,x.problem_dna) ? ` · 테스트 당시 ${x.before}` : ""}</small><strong>{difficultyLabel(norm(x.difficulty,x.problem_dna))}</strong></div><span>→</span><div><small>AI 제안</small><strong className={x.result?.ok ? "proposal" : "fail-text"}>{x.result?.ok ? difficultyLabel(x.result.difficulty) : "실패"}</strong></div>
          </div>
          {x.result?.ok ? <>
            <div className="ai-meta"><span>{bandLabel(x.result.csatDifficultyBand)}</span><span>신뢰도 {confidenceLabel(x.result.confidence)}</span></div>
            <div className="reason-box"><b>AI 판정 근거</b><p>{x.result.reason || "판정 근거가 없습니다."}</p></div>
            <div className="review-actions">
              <button className="keep" disabled={savingId===x.id} onClick={()=>setTestResults(prev=>prev.filter(row=>row.id!==x.id))}>현재 유지</button><button className="accept" disabled={savingId===x.id || norm(x.difficulty,x.problem_dna)===String(x.result.difficulty)} onClick={()=>void changeDifficulty(x.id,String(x.result?.difficulty ?? x.before))}>{savingId===x.id ? "저장 중..." : norm(x.difficulty,x.problem_dna)===String(x.result.difficulty) ? "현재값과 동일" : `AI 제안 ${difficultyLabel(x.result.difficulty)} 적용`}</button>
              <label><span>직접 수정</span><select disabled={savingId===x.id} value={norm(x.difficulty,x.problem_dna)} onChange={e=>void changeDifficulty(x.id,e.target.value)}>{DIFFICULTY_SCALE.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
            </div>
            {savedDifficulty[x.id] && <div className="saved-inline">✓ DB에 {difficultyLabel(savedDifficulty[x.id])}로 저장됨</div>}
          </> : <div className="reason-box failure"><b>실패 이유</b><p>{x.result?.message || "AI 판정에 실패했습니다."}</p></div>}
        </article>)}</div>
      </section>}

      <div className="bank-table">
        <div className="bank-row head"><span>문항</span><span>코드</span><span>단원 · 유형</span><span>출처</span><span>난이도</span></div>
        {loading ? <div className="loading-row">불러오는 중...</div> : filtered.map(x=><div key={x.id} className="bank-row"><b>{x.question_no}번</b><span>{x.problem_code}</span><span><b>{x.unit}</b><small>{x.topic || x.title}</small></span><span>{x.source_name}</span><select value={norm(x.difficulty,x.problem_dna)} onChange={e=>void changeDifficulty(x.id,e.target.value)}>{DIFFICULTY_SCALE.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}</select></div>)}
      </div>
    </div>
    <style jsx>{`
      .difficulty-page{height:100vh;min-height:0;overflow-y:auto;overflow-x:hidden;background:#f5f7f6;padding:28px;font-family:Arial,"Noto Sans KR",sans-serif;color:#15231c}.difficulty-wrap{max-width:1560px;margin:0 auto}.difficulty-header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}.eyebrow{font-size:12px;font-weight:900;color:#247a4b;letter-spacing:1px}.difficulty-header h1{margin:6px 0;font-size:30px}.difficulty-header p{margin:0;color:#66736c}.header-buttons{display:flex;gap:8px}.header-buttons button,.filter-bar button{border:1px solid #d9e1dc;background:#fff;border-radius:9px;padding:10px 14px;font-weight:800;cursor:pointer}.progress-card{background:#eff8f2;border:1px solid #b9dcc7;border-radius:13px;padding:14px 16px;margin-bottom:12px}.progress-copy{display:flex;justify-content:space-between;gap:12px;margin-bottom:9px}.progress-copy span{color:#4f6658;font-size:13px}.progress-track{height:10px;background:#dcebe1;border-radius:999px;overflow:hidden}.progress-track i{display:block;height:100%;background:#247a4b;transition:width .2s}.notice{padding:12px;border-radius:10px;margin-bottom:12px}.notice.success{background:#eaf7ef;border:1px solid #b7dfc6}.notice.error{background:#fff0f0;border:1px solid #efc0c0;color:#a52020}.difficulty-kpis{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:10px;margin-bottom:16px}.difficulty-kpis>div{background:#fff;border:1px solid #dfe6e2;border-radius:12px;padding:16px}.difficulty-kpis strong{display:block;font-size:28px;margin-top:6px}.filter-bar{background:#fff;border:1px solid #dfe6e2;border-radius:14px;padding:14px;margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap}.filter-bar input{min-width:300px;flex:1;padding:10px;border:1px solid #d9e1dc;border-radius:8px}.filter-bar select,.bank-row select,.review-actions select{padding:9px;border:1px solid #d9e1dc;border-radius:8px;background:#fff}.filter-bar .primary{background:#207a49;color:#fff;border-color:#207a49}.filter-bar button:disabled,.review-actions button:disabled{opacity:.5;cursor:not-allowed}.test-section{background:#fff;border:1px solid #dfe6e2;border-radius:14px;padding:16px;margin-bottom:16px}.test-section-head{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:14px}.test-section-head>div{display:flex;flex-direction:column;gap:4px}.test-section-head b{font-size:18px}.test-section-head span{font-size:13px;color:#6e7a73}.test-section-head>strong{color:#247a4b}.test-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.test-card{border:1px solid #dfe6e2;border-radius:13px;padding:14px;background:#fcfdfc;min-width:0}.test-card.changed{border-color:#e2bd74;box-shadow:inset 4px 0 0 #d49a2d}.test-card.failed{border-color:#edc7c7;box-shadow:inset 4px 0 0 #c94d4d}.test-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.test-card-head>div{display:flex;flex-direction:column;gap:3px}.test-card-head b{font-size:18px}.test-card-head span{font-size:12px;color:#6f7b74}.test-card-head code{font-size:11px;color:#607168;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.test-image-wrap{height:560px;background:#eef2ef;border:1px solid #e0e6e2;border-radius:10px;overflow:hidden;display:block}.test-image-scroll{width:100%;height:100%;overflow-y:auto;overflow-x:hidden;background:#fff;padding:8px;overscroll-behavior:contain;scrollbar-gutter:stable}.test-image-scroll img{display:block;width:100%;height:auto;object-fit:contain}.test-image-empty{height:100%;display:flex;align-items:center;justify-content:center;color:#7b857f;font-size:13px}.test-title{font-weight:800;font-size:14px;line-height:1.45;margin:10px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.difficulty-compare{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;background:#f3f6f4;border-radius:10px;padding:10px}.difficulty-compare>div{display:flex;align-items:center;justify-content:center;gap:8px}.difficulty-compare small{color:#748078}.difficulty-compare strong{font-size:24px}.difficulty-compare .proposal{color:#1d7545}.difficulty-compare .fail-text{color:#b63737;font-size:16px}.ai-meta{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.ai-meta span{background:#eef5f1;color:#3b6650;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800}.reason-box{border:1px solid #e3e9e5;border-radius:10px;padding:10px 12px;background:#fff}.reason-box b{font-size:12px;color:#607168}.reason-box p{margin:5px 0 0;line-height:1.55;font-size:13px}.reason-box.failure{background:#fff5f5;border-color:#efcece}.review-actions{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-top:10px}.review-actions .keep{border:1px solid #cfd8d2;background:#fff;color:#41564a;border-radius:9px;padding:10px;font-weight:900;cursor:pointer}.review-actions .accept{flex:1;border:1px solid #247a4b;background:#247a4b;color:#fff;border-radius:9px;padding:10px;font-weight:900;cursor:pointer}.review-actions label{display:flex;flex-direction:column;gap:4px}.review-actions label span{font-size:11px;color:#6f7b74;font-weight:800}.saved-inline{margin-top:8px;padding:8px 10px;border-radius:8px;background:#eaf7ef;color:#17663b;font-size:12px;font-weight:900;text-align:center}.bank-table{background:#fff;border:1px solid #dfe6e2;border-radius:14px;overflow:hidden}.bank-row{display:grid;grid-template-columns:80px 150px 1.2fr 1fr 130px;gap:10px;padding:12px;border-top:1px solid #edf0ee;align-items:center}.bank-row.head{font-weight:800;background:#f0f5f2;border-top:0}.bank-row>span:nth-child(3){display:flex;flex-direction:column;gap:3px}.bank-row small{color:#78847d}.loading-row{padding:30px}@media(max-width:1050px){.test-grid{grid-template-columns:1fr}.difficulty-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.difficulty-page{padding:14px}.difficulty-header{flex-direction:column}.difficulty-kpis{grid-template-columns:repeat(2,1fr)}.test-image-wrap{height:460px}.bank-row{grid-template-columns:60px 1fr 95px}.bank-row>span:nth-child(2),.bank-row>span:nth-child(4),.bank-row.head>span:nth-child(2),.bank-row.head>span:nth-child(4){display:none}.progress-copy{flex-direction:column}}
    `}</style>
  </main>
  </AdminPortalShell>;
}
