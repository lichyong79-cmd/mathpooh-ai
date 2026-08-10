"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseConfig } from "@/lib/supabase";
import { authHeaders } from "@/lib/supabase/rest";

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
  problem_dna?: any;
};

const D = ["1", "2", "3", "4", "5"];

function norm(v: unknown) {
  const raw = String(v ?? "").trim();
  const map: Record<string,string> = { A:"1", B:"2", C:"3", D:"4", E:"5", 하:"1", 중:"2", 상:"4", 최상:"5" };
  return map[raw] ?? (D.includes(raw) ? raw : "2");
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
  const [testResults, setTestResults] = useState<any[]>([]);

  const load = useCallback(async () => {
    const config = getSupabaseConfig();
    if (!config) { setError("Supabase 환경변수를 확인해 주세요."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const fields = ["id","question_no","problem_code","title","grade","subject","unit","topic","difficulty","source_name","status","problem_dna"].join(",");
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
    const dna = { ...(target.problem_dna || {}), difficulty: { ...((target.problem_dna || {}).difficulty || {}), final_grade:value, admin_fixed:true, admin_fixed_at:new Date().toISOString() } };
    setItems(prev => prev.map(x=>x.id===id ? {...x,difficulty:value,problem_dna:dna} : x));
    const res = await fetch(`${config.url}/rest/v1/problem_bank_questions?id=eq.${encodeURIComponent(id)}`, {
      method:"PATCH", headers:{ ...(await authHeaders()), "Content-Type":"application/json", Prefer:"return=minimal" },
      body: JSON.stringify({ difficulty:value, problem_dna:dna }),
    });
    if (!res.ok) { setError(await res.text()); await load(); }
    else setMessage(`${target.question_no}번 난이도를 ${value}단계로 저장했습니다.`);
  }

  async function runTest20() {
    if (running) return;
    const targets = filtered.slice(0,20);
    if (!targets.length) return;
    if (!window.confirm(`현재 필터의 앞 ${targets.length}문항만 AI 난이도 재판정 테스트할까요?`)) return;
    setRunning(true); setMessage(""); setError(""); setTestResults([]);
    try {
      const res = await fetch("/api/problem-bank/regrade-difficulty-batch", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({problemIds:targets.map(x=>x.id)}) });
      const data = await res.json().catch(()=>({})); if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      const map = new Map((Array.isArray(data.results)?data.results:[]).map((r:any)=>[String(r.problemId),r]));
      setTestResults(targets.map(x=>({ ...x, before:norm(x.difficulty), result:map.get(String(x.id)) }))
      setMessage("20문항 테스트가 완료되었습니다. 아래 결과를 확인한 뒤 전체 재판정을 실행하세요.");
      await load();
    } catch(e) { setError(e instanceof Error ? e.message : "테스트에 실패했습니다."); }
    finally { setRunning(false); }
  }

  async function runAll() {
    if (running) return;
    const ids = items.map(x=>x.id);
    if (!ids.length) return;
    if (!window.confirm(`ACTIVE ${ids.length}문항의 난이도를 전체 재판정합니다. 계속할까요?`)) return;
    setRunning(true); setMessage(""); setError("");
    let ok=0, fail=0;
    try {
      for (let i=0;i<ids.length;i+=20) {
        const batch=ids.slice(i,i+20);
        const res=await fetch("/api/problem-bank/regrade-difficulty-batch", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({problemIds:batch})});
        const data=await res.json().catch(()=>({}));
        if (!res.ok) { fail += batch.length; continue; }
        for (const r of (Array.isArray(data.results)?data.results:[])) r?.ok ? ok++ : fail++;
        setMessage(`전체 재판정 진행 중 · ${Math.min(i+20,ids.length)}/${ids.length} · 성공 ${ok} · 실패 ${fail}`);
      }
      setMessage(`전체 재판정 완료 · 성공 ${ok} · 실패 ${fail}`); await load();
    } catch(e) { setError(e instanceof Error ? e.message : "전체 재판정에 실패했습니다."); }
    finally { setRunning(false); }
  }

  return <main style={{minHeight:"100vh",background:"#f5f7f6",padding:28,fontFamily:"Arial, sans-serif",color:"#15231c"}}>
    <div style={{maxWidth:1500,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",marginBottom:20}}>
        <div><div style={{fontSize:12,fontWeight:800,color:"#247a4b",letterSpacing:1}}>MATHPOOH SOS</div><h1 style={{margin:"6px 0",fontSize:30}}>난이도 관리</h1><p style={{margin:0,color:"#66736c"}}>문제은행 분석과 분리된 난이도 전용 관리 화면입니다.</p></div>
        <div style={{display:"flex",gap:8}}><button onClick={()=>location.href="/admin?menu=sos-learning"}>관리자 홈</button><button onClick={()=>location.href="/problem-bank"}>SOS 문제은행</button></div>
      </div>
      {message && <div style={{padding:12,background:"#eaf7ef",border:"1px solid #b7dfc6",borderRadius:10,marginBottom:12}}>{message}</div>}
      {error && <div style={{padding:12,background:"#fff0f0",border:"1px solid #efc0c0",borderRadius:10,marginBottom:12,color:"#a52020"}}>{error}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>{D.map((d,i)=><div key={d} style={{background:"white",border:"1px solid #dfe6e2",borderRadius:12,padding:16}}><b>{d}단계</b><div style={{fontSize:28,fontWeight:900,marginTop:6}}>{counts[i]}</div></div>)}</div>
      <div style={{background:"white",border:"1px solid #dfe6e2",borderRadius:14,padding:14,marginBottom:14,display:"flex",gap:8,flexWrap:"wrap"}}>
        <input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="문항명·단원·유형·출처 검색" style={{minWidth:300,padding:10}}/>
        <select value={subject} onChange={e=>setSubject(e.target.value)} style={{padding:10}}>{subjects.map(x=><option key={x}>{x}</option>)}</select>
        <select value={difficulty} onChange={e=>setDifficulty(e.target.value)} style={{padding:10}}><option>전체</option>{D.map(x=><option key={x} value={x}>{x}단계</option>)}</select>
        <button disabled={running} onClick={runTest20} style={{padding:"10px 14px"}}>20문항 테스트</button>
        <button disabled={running} onClick={runAll} style={{padding:"10px 14px",background:"#207a49",color:"white",border:0,borderRadius:8}}>전체 재판정</button>
      </div>
      {testResults.length>0 && <div style={{background:"white",border:"1px solid #dfe6e2",borderRadius:14,padding:14,marginBottom:14}}><b>20문항 테스트 결과</b><div style={{marginTop:10,display:"grid",gap:6}}>{testResults.map((x:any)=><div key={x.id} style={{display:"grid",gridTemplateColumns:"70px 1fr 100px 100px",gap:10,padding:8,borderBottom:"1px solid #eef1ef"}}><span>{x.question_no}번</span><span>{x.title}</span><span>기존 {x.before}</span><b>→ {x.result?.ok ? x.result.difficulty : "실패"}</b></div>)}</div></div>}
      <div style={{background:"white",border:"1px solid #dfe6e2",borderRadius:14,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"80px 150px 1.2fr 1fr 130px",gap:10,padding:12,fontWeight:800,background:"#f0f5f2"}}><span>문항</span><span>코드</span><span>단원 · 유형</span><span>출처</span><span>난이도</span></div>
        {loading ? <div style={{padding:30}}>불러오는 중...</div> : filtered.map(x=><div key={x.id} style={{display:"grid",gridTemplateColumns:"80px 150px 1.2fr 1fr 130px",gap:10,padding:12,borderTop:"1px solid #edf0ee",alignItems:"center"}}><b>{x.question_no}번</b><span>{x.problem_code}</span><span><b>{x.unit}</b><br/><small>{x.topic || x.title}</small></span><span>{x.source_name}</span><select value={norm(x.difficulty)} onChange={e=>void changeDifficulty(x.id,e.target.value)} style={{padding:8}}>{D.map(d=><option key={d} value={d}>{d}단계</option>)}</select></div>)}
      </div>
    </div>
  </main>;
}
