"use client";
import { useEffect,useMemo,useState } from "react";
import AdminPortalShell from "@/components/admin-portal-sidebar";

function statusText(status:string){
  if(status==="ASSIGNED")return "미응시";
  if(status==="IN_PROGRESS")return "진행중";
  if(status==="PASSED")return "통과";
  if(status==="RETRAIN")return "재훈련";
  if(status==="COMPLETED")return "완료";
  return status||"-";
}
function phaseText(phase:string){return phase==="DIAGNOSIS"?"진단":"훈련";}
function timeText(value:any){
  if(!value)return "-";
  const d=new Date(value);
  return Number.isNaN(d.getTime())?"-":d.toLocaleString("ko-KR",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
}
function elapsed(start:any,end:any,serverTime:any){
  if(!start)return "-";
  const a=new Date(start).getTime();
  const b=new Date(end||serverTime||Date.now()).getTime();
  if(!Number.isFinite(a)||!Number.isFinite(b))return "-";
  const min=Math.max(0,Math.floor((b-a)/60000));
  return min<60?`${min}분`:`${Math.floor(min/60)}시간 ${min%60}분`;
}

export default function SosProgressPage(){
  const [rows,setRows]=useState<any[]>([]);
  const [summary,setSummary]=useState<any>({});
  const [serverTime,setServerTime]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [keyword,setKeyword]=useState("");
  const [phase,setPhase]=useState("전체");
  const [status,setStatus]=useState("전체");
  const [autoRefresh,setAutoRefresh]=useState(true);

  async function load(){
    setError("");
    try{
      const response=await fetch("/api/admin/sos-progress",{cache:"no-store"});
      const data=await response.json();
      if(!response.ok||data?.success!==true)throw new Error(data?.message||"진행현황을 불러오지 못했습니다.");
      setRows(data.rows??[]);setSummary(data.summary??{});setServerTime(data.serverTime??"");
    }catch(e){setError(e instanceof Error?e.message:"조회 실패");}
    finally{setLoading(false);}
  }

  useEffect(()=>{void load();},[]);
  useEffect(()=>{
    if(!autoRefresh)return;
    const timer=window.setInterval(()=>void load(),15000);
    return()=>window.clearInterval(timer);
  },[autoRefresh]);

  const filtered=useMemo(()=>rows.filter((r:any)=>{
    const text=`${r.student?.name??""} ${r.student?.school??""} ${r.student?.grade??""} ${r.student?.class_name??""} ${r.subject} ${r.majorUnit} ${r.subunit}`.toLowerCase();
    return (!keyword||text.includes(keyword.toLowerCase()))
      &&(phase==="전체"||r.phase===phase)
      &&(status==="전체"||r.status===status);
  }),[rows,keyword,phase,status]);

  return <AdminPortalShell current="sos-learning">
    <main className="progress-page">
      <header className="top">
        <div><small>MATHPOOH SOS · LIVE PROGRESS</small><h1>진단·훈련 진행현황</h1><p>학생별 미응시·진행·완료와 소단원 미터 변화를 실시간으로 확인합니다.</p></div>
        <div className="buttons"><button onClick={()=>location.href="/admin?menu=sos-learning"}>← SOS 학습운영</button><button onClick={()=>void load()}>새로고침</button></div>
      </header>

      {error?<div className="error">{error}</div>:null}

      <section className="cards">
        <article><span>전체 세션</span><b>{summary.total??0}</b></article>
        <article><span>미응시·진행</span><b>{summary.active??0}</b></article>
        <article><span>현재 진행중</span><b>{summary.inProgress??0}</b></article>
        <article><span>완료·통과</span><b>{summary.completed??0}</b></article>
      </section>

      <section className="filters">
        <input value={keyword} onChange={(e:any)=>setKeyword(e.target.value)} placeholder="학생·학교·반·소단원 검색"/>
        <select value={phase} onChange={(e:any)=>setPhase(e.target.value)}><option>전체</option><option value="DIAGNOSIS">진단</option><option value="TRAINING">훈련</option></select>
        <select value={status} onChange={(e:any)=>setStatus(e.target.value)}><option>전체</option><option value="ASSIGNED">미응시</option><option value="IN_PROGRESS">진행중</option><option value="COMPLETED">완료</option><option value="PASSED">통과</option><option value="RETRAIN">재훈련</option></select>
        <label><input type="checkbox" checked={autoRefresh} onChange={(e:any)=>setAutoRefresh(e.target.checked)}/> 15초 자동새로고침</label>
      </section>

      <section className="table">
        <div className="row head"><span>학생</span><span>구분</span><span>과목·소단원</span><span>상태</span><span>진도</span><span>결과</span><span>시작</span><span>경과</span><span>바로미터</span></div>
        {loading?<div className="empty">진행현황을 불러오는 중...</div>:filtered.length?filtered.map((r:any)=><div className="row" key={r.id}>
          <span><b>{r.student?.name??"학생정보없음"}</b><small>{r.student?.school??"-"} · {r.student?.grade??"-"} {r.student?.class_name?`· ${r.student.class_name}`:""}</small></span>
          <span><b>{phaseText(r.phase)} {r.phase==="DIAGNOSIS"?`${r.roundNo}차`:""}</b><small>{r.total}문항</small></span>
          <span><b>{r.subject||"-"}</b><small>{r.majorUnit?`${r.majorUnit} · `:""}{r.subunit||"-"}</small></span>
          <span><em className={`status ${String(r.status).toLowerCase()}`}>{statusText(r.status)}</em><small>{r.decision||""}</small></span>
          <span><b>{r.answered}/{r.total}</b><i><em style={{width:`${r.total?Math.min(100,r.answered/r.total*100):0}%`}}/></i></span>
          <span><b>{["COMPLETED","PASSED","RETRAIN"].includes(String(r.status))?`${r.correct}/${r.total}`:"-"}</b><small>{r.total&&["COMPLETED","PASSED","RETRAIN"].includes(String(r.status))?`${Math.round(r.correct/r.total*100)}%`:"채점 전"}</small></span>
          <span><b>{timeText(r.startedAt)}</b><small>배정 {timeText(r.createdAt)}</small></span>
          <span><b>{elapsed(r.startedAt,r.submittedAt,serverTime)}</b><small>{r.submittedAt?`제출 ${timeText(r.submittedAt)}`:""}</small></span>
          <span><b>{r.currentMeter===null?"-":Number(r.currentMeter).toFixed(2)}</b><small>{r.initialMeter===null?"":`시작 ${Number(r.initialMeter).toFixed(2)} ${r.meterDelta===null?"":`→ ${r.meterDelta>=0?"+":""}${Number(r.meterDelta).toFixed(2)}`}`}</small></span>
        </div>):<div className="empty">조건에 맞는 진단·훈련이 없습니다.</div>}
      </section>

      <style jsx>{`
        .progress-page{min-height:100vh;background:#f5f7f6;padding:28px;color:#17211b}.top{display:flex;justify-content:space-between;gap:18px}.top small{font-weight:900;color:#247249;letter-spacing:1px}.top h1{margin:5px 0;font-size:30px}.top p{margin:0;color:#667085}.buttons{display:flex;gap:8px}.buttons button,.filters select,.filters input{border:1px solid #d0d5dd;background:#fff;border-radius:10px;padding:10px 12px}.buttons button{font-weight:850;cursor:pointer}
        .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.cards article{background:#fff;border:1px solid #e3e8e5;border-radius:14px;padding:16px}.cards span{display:block;color:#667085}.cards b{font-size:28px}
        .filters{display:flex;gap:9px;align-items:center;background:#fff;border:1px solid #e3e8e5;border-radius:14px;padding:12px;margin-bottom:12px}.filters>input{flex:1}.filters label{font-size:12px;font-weight:800;color:#526159;white-space:nowrap}
        .table{background:#fff;border:1px solid #e3e8e5;border-radius:14px;overflow:auto}.row{display:grid;grid-template-columns:1.1fr .65fr 1.35fr .7fr .9fr .65fr 1fr .8fr .85fr;align-items:center;min-width:1250px;border-bottom:1px solid #eef1ef}.row>span{padding:11px 9px;min-width:0}.row b,.row small{display:block}.row small{font-size:11px;color:#7a8580;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.head{background:#f8faf9;font-size:12px;font-weight:900;color:#59645e;position:sticky;top:0}.status{font-style:normal;font-weight:900;border-radius:999px;padding:5px 8px;background:#eef1ef}.status.in_progress{background:#fff3d6;color:#8a5a00}.status.assigned{background:#edf1f7;color:#536173}.status.completed,.status.passed{background:#e7f6ed;color:#176d42}
        .row i{display:block;height:6px;background:#e8eeea;border-radius:999px;overflow:hidden;margin-top:5px}.row i em{display:block;height:100%;background:#278557;border-radius:999px}.empty{padding:36px;text-align:center;color:#667085}.error{margin-top:12px;padding:12px;border-radius:10px;background:#fff0f0;color:#a61b1b}
        @media(max-width:900px){.cards{grid-template-columns:1fr 1fr}.top,.filters{flex-direction:column;align-items:stretch}}
      `}</style>
    </main>
  </AdminPortalShell>;
}
