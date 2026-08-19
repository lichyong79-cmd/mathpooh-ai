"use client";
import {useEffect,useMemo,useState} from "react";
import AdminPortalShell from "@/components/admin-portal-sidebar";
import MATHPOOHLoader from "@/components/math-pooh-loader";
import "./style.css";

function fmt(v:any){if(!v)return "-";return new Date(v).toLocaleString("ko-KR",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});}
export default function AiGeneratedBankPage(){
 const [questions,setQuestions]=useState<any[]>([]),[jobs,setJobs]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [kind,setKind]=useState("전체"),[keyword,setKeyword]=useState("");
 async function load(){setError("");try{const r=await fetch("/api/admin/ai-generated-bank",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.message||"조회 실패");setQuestions(d.questions??[]);setJobs(d.jobs??[]);}catch(e){setError(e instanceof Error?e.message:"조회 실패");}finally{setLoading(false);}}
 useEffect(()=>{void load();const t=setInterval(()=>void load(),30000);return()=>clearInterval(t);},[]);
 const filtered=useMemo(()=>questions.filter(q=>(kind==="전체"||q.generation_kind===kind)&&(!keyword||`${q.subject} ${q.major_unit} ${q.subunit} ${q.topic} ${q.core_type}`.toLowerCase().includes(keyword.toLowerCase()))),[questions,kind,keyword]);
 const queued=jobs.filter(j=>["QUEUED","GENERATING"].includes(j.status)).length,failed=jobs.filter(j=>j.status==="FAILED").length;
 async function toggle(q:any){const status=q.status==="READY"?"DISABLED":"READY";await fetch("/api/admin/ai-generated-bank",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:q.id,status})});await load();}
 return <AdminPortalShell current="ai-generated-bank"><main className="ai-bank-page">
  <header><div><small>MATHPOOH SOS · AI GENERATED BANK</small><h1>AI 생성 문제은행</h1><p>2차훈련·3제 굳히기에서 생성·검증된 문항을 영구 보관합니다.</p></div><button onClick={()=>void load()}>새로고침</button></header>
  <section className="ai-bank-stats"><article><span>누적 문항</span><b>{questions.length}</b></article><article><span>생성·검증 중</span><b>{queued}</b></article><article><span>생성 실패</span><b>{failed}</b></article><article><span>사용 가능</span><b>{questions.filter(q=>q.status==="READY").length}</b></article></section>
  <section className="ai-bank-filter"><input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="과목·단원·유형 검색"/><select value={kind} onChange={e=>setKind(e.target.value)}><option>전체</option><option value="SECOND_TRAINING">2차훈련</option><option value="HOMEWORK">3제 굳히기</option></select></section>
  <section className="ai-pipeline-board"><div className="ai-pipeline-title"><div><b>AI 변형문항 제작 공정</b><span>원문 분석 → 변형 설계 → 텍스트 생성 → 조판 → 재풀이 → READY</span></div></div>{jobs.slice(0,12).map((j:any)=>{const total=Math.max(1,Number(j.stage_total??8)),idx=Math.max(0,Number(j.stage_index??0)),pct=j.status==="READY"?100:Math.min(99,Math.round(idx/total*100));return <article key={j.id} className={`ai-pipeline-job ${String(j.status).toLowerCase()}`}><div><b>{j.generation_kind==="HOMEWORK"?"3제 굳히기":"2차훈련"} · {j.requested_count}문항</b><span>{j.status==="READY"?"READY":j.status==="FAILED"?"FAILED":`${idx}/${total} · ${j.stage_message||j.stage||"생성 중"}`}</span></div><i><em style={{width:`${pct}%`}}/></i><small>{fmt(j.stage_updated_at||j.updated_at)}{j.last_error?` · ${j.last_error}`:""}</small></article>})}</section>
  {error?<div className="ai-bank-error">{error}</div>:null}
  {loading?<MATHPOOHLoader title="AI 생성 문제은행을 불러오는 중입니다" detail="누적 문항과 생성 작업 상태를 확인하고 있습니다." kind="loading" audience="admin"/>:<section className="ai-bank-grid">{filtered.map(q=><article className={`ai-bank-card ${q.status==="DISABLED"?"disabled":""}`} key={q.id}><div className="tag"><b>AI 생성</b><em>{q.generation_kind==="HOMEWORK"?"3제 굳히기":"2차훈련"}</em></div><h3>{q.subject||"수학"} · {q.subunit||q.topic||"유사문항"}</h3><p>{q.question_text}</p><div className="meta"><span>유형 {q.core_type||q.topic||"-"}</span><span>난이도 {q.difficulty??"-"}</span><span>미터 {q.difficulty_meter==null?"-":Number(q.difficulty_meter).toFixed(2)}</span><span>정답 {q.answer}</span></div><small>생성 {fmt(q.created_at)} · 원문 {q.source_training_order?`${q.source_training_order}번`:"-"}</small><button onClick={()=>void toggle(q)}>{q.status==="READY"?"사용 중지":"다시 사용"}</button></article>)}</section>}
 </main></AdminPortalShell>;
}
