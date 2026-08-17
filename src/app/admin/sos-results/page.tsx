"use client";
import { useEffect,useMemo,useState } from "react";
import AdminPortalShell from "@/components/admin-portal-sidebar";
import MATHPOOHLoader from "../../../components/math-pooh-loader";

function statusText(status:string){
  if(status==="ASSIGNED")return "미응시";
  if(status==="IN_PROGRESS")return "진행중";
  if(status==="PASSED")return "통과";
  if(status==="RETRAIN")return "재훈련";
  if(status==="COMPLETED")return "완료";
  return status||"-";
}
function phaseText(r:any){if(r?.phase==="DIAGNOSIS")return `진단 ${Number(r?.roundNo??1)}차`;if(String(r?.cycleKind)==="HOMEWORK")return "AI 유사문항 3제 굳히기";return Number(r?.roundNo??1)===2?"2차훈련":"1차훈련";}
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
function duration(sec:any){
  if(sec===null||sec===undefined||!Number.isFinite(Number(sec)))return "-";
  const n=Math.max(0,Math.round(Number(sec)));
  return n<60?`${n}초`:`${Math.floor(n/60)}분 ${String(n%60).padStart(2,"0")}초`;
}

export default function SosResultsPage(){
  const [rows,setRows]=useState<any[]>([]);
  const [summary,setSummary]=useState<any>({});
  const [serverTime,setServerTime]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [keyword,setKeyword]=useState("");
  const [phase,setPhase]=useState("DIAGNOSIS");
  const [status,setStatus]=useState("전체");
  const [cycle,setCycle]=useState("전체");
  const [autoRefresh,setAutoRefresh]=useState(true);
  const [selectedId,setSelectedId]=useState<string>("");

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

  const cycleOptions=useMemo(()=>[...new Map(rows.filter((r:any)=>r.learningCycle?.id).map((r:any)=>[r.learningCycle.id,r.learningCycle])).values()],[rows]);
  const filtered=useMemo(()=>rows.filter((r:any)=>{
    const text=`${r.student?.name??""} ${r.student?.school??""} ${r.student?.grade??""} ${r.subject} ${r.majorUnit} ${r.subunit}`.toLowerCase();
    return (!keyword||text.includes(keyword.toLowerCase()))
      &&(phase==="전체"||r.phase===phase)
      &&(status==="전체" ? ["COMPLETED","PASSED","RETRAIN"].includes(String(r.status)) : r.status===status)
      &&(cycle==="전체"||r.learningCycle?.id===cycle);
  }),[rows,keyword,phase,status,cycle]);
  const selected=useMemo(()=>rows.find((r:any)=>String(r.id)===selectedId)??null,[rows,selectedId]);

  return <AdminPortalShell current="sos-learning">
    <main className="progress-page">
      <header className="top">
        <div><small>MATHPOOH SOS · RESULT REVIEW</small><h1>SOS 결과분석</h1><p>완료된 진단의 문항별 정오답·시간·이탈로그·학생 풀이사진을 확인합니다.</p><nav className="sos-tabs"><button onClick={()=>location.href="/admin?menu=sos-learning"}>배정</button><button onClick={()=>location.href="/admin/sos-progress"}>진행</button><button className="active">결과</button><button onClick={()=>location.href="/admin/sos-status"}>학습현황</button></nav></div>
        <div className="buttons"><button onClick={()=>void load()}>새로고침</button></div>
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
        <select value={cycle} onChange={(e:any)=>setCycle(e.target.value)}><option>전체</option>{cycleOptions.map((w:any)=><option key={w.id} value={w.id}>{w.name} · {w.dateLabel}</option>)}</select><div className="result-subtabs"><button className={phase==="DIAGNOSIS"?"active":""} onClick={()=>setPhase("DIAGNOSIS")}>진단결과</button><button className={phase==="TRAINING"?"active":""} onClick={()=>setPhase("TRAINING")}>훈련결과</button></div>
        <select value={status} onChange={(e:any)=>setStatus(e.target.value)}><option>전체</option><option value="ASSIGNED">미응시</option><option value="IN_PROGRESS">진행중</option><option value="COMPLETED">완료</option><option value="PASSED">통과</option><option value="RETRAIN">재훈련</option></select>
        <label><input type="checkbox" checked={autoRefresh} onChange={(e:any)=>setAutoRefresh(e.target.checked)}/> 15초 자동새로고침</label>
      </section>

      <section className="table">
        <div className="row head"><span>학생</span><span>구분</span><span>과목·소단원</span><span>상태</span><span>진도</span><span>결과</span><span>시작</span><span>경과</span><span>바로미터</span><span>상세</span></div>
        {loading?<MATHPOOHLoader title="SOS 결과를 가져오는 중입니다" detail="진단·훈련 결과와 학생별 상세 데이터를 준비하고 있습니다." kind="loading" audience="admin"/>:filtered.length?filtered.map((r:any)=><div className={`row ${selectedId===String(r.id)?"selected":""}`} key={r.id}>
          <span><b>{r.student?.name??"학생정보없음"}</b><small>{r.student?.school??"-"} · {r.student?.grade??"-"}</small></span>
          <span><b>{phaseText(r)}</b><small>{r.learningCycle?`${r.learningCycle.name} · ${r.learningCycle.dateLabel}`:"회차 미지정"}</small><small>{r.total}문항</small></span>
          <span><b>{r.subject||"-"}</b><small>{r.majorUnit?`${r.majorUnit} · `:""}{r.subunit||"-"}</small></span>
          <span><em className={`status ${String(r.status).toLowerCase()}`}>{statusText(r.status)}</em><small>{r.decision||""}</small></span>
          <span><b>{r.answered}/{r.total}</b><i><em style={{width:`${r.total?Math.min(100,r.answered/r.total*100):0}%`}}/></i></span>
          <span><b>{["COMPLETED","PASSED","RETRAIN"].includes(String(r.status))?`${r.correct}/${r.total}`:"-"}</b><small>{r.total&&["COMPLETED","PASSED","RETRAIN"].includes(String(r.status))?`${Math.round(r.correct/r.total*100)}%`:"채점 전"}</small></span>
          <span><b>{timeText(r.startedAt)}</b><small>배정 {timeText(r.createdAt)}</small></span>
          <span><b>{elapsed(r.startedAt,r.submittedAt,serverTime)}</b><small>{r.submittedAt?`제출 ${timeText(r.submittedAt)}`:""}</small></span>
          <span><b>{r.currentMeter===null?"-":Number(r.currentMeter).toFixed(2)}</b><small>{r.initialMeter===null?"":`시작 ${Number(r.initialMeter).toFixed(2)} ${r.meterDelta===null?"":`→ ${r.meterDelta>=0?"+":""}${Number(r.meterDelta).toFixed(2)}`}`}</small></span>
          <span><button className="detail-btn" onClick={()=>setSelectedId(selectedId===String(r.id)?"":String(r.id))}>{selectedId===String(r.id)?"닫기":"결과보기"}</button></span>
        </div>):<div className="empty">조건에 맞는 진단·훈련이 없습니다.</div>}
      </section>

      {selected?<section className="detail-panel">
        <div className="detail-head">
          <div><small>{selected.learningCycle?`${selected.learningCycle.name} · ${selected.learningCycle.dateLabel} · `:""}{phaseText(selected)} 결과 상세</small><h2>{selected.student?.name??"학생"} · {selected.subject||"-"} {selected.subunit?`· ${selected.subunit}`:""}</h2><p>{selected.correct}/{selected.total} 정답 · {selected.total?Math.round(selected.correct/selected.total*100):0}% · {statusText(selected.status)}</p></div>
          <button onClick={()=>setSelectedId("")}>닫기</button>
        </div>
        {selected.phase==="TRAINING"?<div className="training-result-summary"><div><small>AI 취약점</small><b>{selected.weakness?.weaknessTitle||"-"}</b><span>{selected.weakness?.weaknessDetail||""}</span></div><div><small>바로미터</small><b>{selected.baselineMeter===null?"-":Number(selected.baselineMeter).toFixed(2)} → {selected.reviewMeter!==null&&selected.reviewMeter!==undefined?Number(selected.reviewMeter).toFixed(2):selected.trainingMeter!==null&&selected.trainingMeter!==undefined?Number(selected.trainingMeter).toFixed(2):"-"}</b><span>목표 {selected.goalMeter===null?"-":Number(selected.goalMeter).toFixed(2)}</span></div></div>:null}
        <div className="problem-grid">
          {(selected.items??[]).map((item:any,index:number)=><article className={`problem-card ${item.isCorrect===true?"correct":item.isCorrect===false?"wrong":""} ${selected.phase==="DIAGNOSIS"?"diagnosis":selected.roundNo===2?"training2":"training1"}`} key={item.id}>
            <div className="problem-title"><b>{index+1}번</b><em>{item.isCorrect===true?"✓ 정답":item.isCorrect===false?"✕ 오답":"채점 전"}</em></div>
            <div className="problem-info"><span>난이도 <b>{item.problem?.difficulty||"-"}</b></span><span>문항미터 <b>{item.problem?.difficultyMeter===null?"-":Number(item.problem.difficultyMeter).toFixed(2)}</b></span><span>화면이탈 <b>{item.screenExitCount??0}회</b></span></div>
            {item.problem?.imageUrl?<div className="question-image"><img src={item.problem.imageUrl} alt={`${index+1}번 문항`}/></div>:<div className="no-image">문항 이미지 없음</div>}
            <div className="answer-grid">
              <div><small>학생 답</small><b>{item.studentAnswer||"-"}</b></div>
              <div><small>정답</small><b>{item.problem?.correctAnswer||"-"}</b></div>
              <div><small>풀이시간</small><b>{duration(item.responseSeconds)}</b></div>
              <div><small>사진제출</small><b>{duration(item.photoSubmitSeconds)}</b></div>
            </div>
            {selected.phase==="DIAGNOSIS"?<div className="photo-block">
              <div><b>학생 풀이사진</b><small>{item.photoSubmittedAt?`제출 ${timeText(item.photoSubmittedAt)}`:"미제출"}</small></div>
              {item.solutionPhotoUrl?<a href={item.solutionPhotoUrl} target="_blank" rel="noreferrer"><img src={item.solutionPhotoUrl} alt={`${index+1}번 학생 풀이사진`}/><span>클릭해서 크게 보기</span></a>:<div className="no-photo">풀이사진 없음</div>}
            </div>:null}
            {(item.isCorrect===false||item.reviewAnswer||Number(item.reviewAttemptCount??0)>0)?<div className="review-result"><small>오답 교정 상세</small><b>{item.reviewAnswer?`${item.reviewAnswer} · ${item.reviewIsCorrect===true?"스스로 교정":item.reviewExplained?"정답·풀이 확인 완료":"재도전 중"}`:"미진행"}</b><span>{item.reviewResponseSeconds?`재풀이 ${duration(item.reviewResponseSeconds)} · `:""}재도전 {item.reviewAttemptCount??0}회 · 힌트 {(item.reviewHints??[]).length}회</span>{(item.reviewHints??[]).length?<details><summary>사용한 풀이 힌트</summary>{(item.reviewHints??[]).map((h:any,i:number)=><p key={i}><b>힌트 {h.level}</b> · {h.hint}</p>)}</details>:null}{item.generated&&item.problem?.generatedSolution?<details><summary>AI 생성 해설</summary><p>{item.problem.generatedSolution}</p></details>:null}</div>:null}
          </article>)}
        </div>
      </section>:null}

      <style jsx>{`
        .progress-page{min-height:100vh;background:#f5f7f6;padding:28px;color:#17211b}.top{display:flex;justify-content:space-between;gap:18px}.top small{font-weight:900;color:#247249;letter-spacing:1px}.top h1{margin:5px 0;font-size:30px}.top p{margin:0;color:#667085}.sos-tabs{display:flex;gap:8px;margin-top:14px}.sos-tabs button{border:1px solid #cfd8d2;background:#fff;border-radius:10px;padding:9px 18px;font-weight:900;cursor:pointer}.sos-tabs .active{background:#216e45;color:#fff;border-color:#216e45}.buttons{display:flex;gap:8px}.buttons button,.filters select,.filters input{border:1px solid #d0d5dd;background:#fff;border-radius:10px;padding:10px 12px}.buttons button{font-weight:850;cursor:pointer}
        .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.cards article{background:#fff;border:1px solid #e3e8e5;border-radius:14px;padding:16px}.cards span{display:block;color:#667085}.cards b{font-size:28px}
         .result-subtabs{display:flex;gap:6px}.result-subtabs button{border:1px solid #d0d5dd;background:#fff;border-radius:9px;padding:9px 14px;font-weight:900;cursor:pointer}.result-subtabs button.active{background:#216e45;color:#fff;border-color:#216e45}.filters{display:flex;gap:9px;align-items:center;background:#fff;border:1px solid #e3e8e5;border-radius:14px;padding:12px;margin-bottom:12px}.filters>input{flex:1}.filters label{font-size:12px;font-weight:800;color:#526159;white-space:nowrap}
        .table{background:#fff;border:1px solid #e3e8e5;border-radius:14px;overflow:auto}.row{display:grid;grid-template-columns:1.05fr .6fr 1.25fr .65fr .8fr .6fr .9fr .75fr .8fr .62fr;align-items:center;min-width:1320px;border-bottom:1px solid #eef1ef}.row>span{padding:11px 9px;min-width:0}.row b,.row small{display:block}.row small{font-size:11px;color:#7a8580;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.head{background:#f8faf9;font-size:12px;font-weight:900;color:#59645e;position:sticky;top:0}.row.selected{background:#f1faf5}.status{font-style:normal;font-weight:900;border-radius:999px;padding:5px 8px;background:#eef1ef}.status.in_progress{background:#fff3d6;color:#8a5a00}.status.assigned{background:#edf1f7;color:#536173}.status.completed,.status.passed{background:#e7f6ed;color:#176d42}
        .row i{display:block;height:6px;background:#e8eeea;border-radius:999px;overflow:hidden;margin-top:5px}.row i em{display:block;height:100%;background:#278557;border-radius:999px}.detail-btn{width:100%;border:1px solid #b9d9c7;background:#effaf4;color:#176d42;border-radius:9px;padding:8px 6px;font-weight:900;cursor:pointer}.empty{padding:36px;text-align:center;color:#667085}.error{margin-top:12px;padding:12px;border-radius:10px;background:#fff0f0;color:#a61b1b}
        .detail-panel{margin-top:16px;background:#fff;border:1px solid #dfe8e2;border-radius:16px;padding:18px}.detail-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:1px solid #edf1ee;padding-bottom:14px;margin-bottom:14px}.detail-head small{font-weight:900;color:#247249}.detail-head h2{margin:4px 0;font-size:22px}.detail-head p{margin:0;color:#667085}.detail-head button{border:1px solid #d0d5dd;background:#fff;border-radius:9px;padding:8px 12px;font-weight:800;cursor:pointer}.training-result-summary{display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:14px}.training-result-summary>div{background:#f7faf8;border:1px solid #e2e9e4;border-radius:12px;padding:12px}.training-result-summary small{display:block;color:#667085}.training-result-summary b{display:block;margin:3px 0;font-size:17px}.training-result-summary span{color:#667085;font-size:12px}.problem-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.problem-card{border:1px solid #e2e7e4;border-radius:14px;padding:14px;overflow:hidden}.problem-card.correct{border-top:4px solid #218653}.problem-card.wrong{border-top:4px solid #cf3f3f}.problem-card.diagnosis{box-shadow:inset 0 0 0 2px #d9e3fb}.problem-card.training1{box-shadow:inset 0 0 0 2px #d8eadf}.problem-card.training2{box-shadow:inset 0 0 0 2px #f3dfc8}.problem-title{display:flex;align-items:center;justify-content:space-between}.problem-title b{font-size:18px}.problem-title em{font-style:normal;font-weight:900}.correct .problem-title em{color:#177443}.wrong .problem-title em{color:#b42318}.problem-info{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.problem-info span{background:#f4f7f5;border-radius:999px;padding:5px 8px;font-size:11px;color:#667085}.problem-info b{display:inline;color:#26362d}.question-image{height:250px;border:1px solid #edf0ee;border-radius:10px;background:#fafcfa;display:flex;align-items:flex-start;justify-content:center;overflow:auto}.question-image img{width:100%;height:auto;object-fit:contain;display:block}.generated-question{min-height:180px;white-space:pre-wrap;line-height:1.65;padding:14px;border:1px solid #e1e7e3;border-radius:10px;background:#fbfcfb}.review-result{margin-top:10px;padding:10px;background:#f7faf8;border-radius:9px}.review-result small,.review-result b,.review-result span{display:block}.review-result small{color:#7b8580}.review-result details{margin-top:8px}.review-result p{white-space:pre-wrap;line-height:1.55}.no-image,.no-photo{height:120px;border:1px dashed #ccd5cf;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#89938d;background:#fafbfa}.answer-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0}.answer-grid>div{background:#f7f9f8;border-radius:9px;padding:9px}.answer-grid small{font-size:10px;color:#7b8580}.answer-grid b{font-size:14px;margin-top:3px}.photo-block{margin-top:10px}.photo-block>div:first-child{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:7px}.photo-block>div:first-child small{font-size:10px;color:#7c8781}.photo-block a{display:block;text-decoration:none;color:#176d42}.photo-block a img{width:100%;max-height:340px;object-fit:contain;background:#f7f8f7;border:1px solid #e0e5e2;border-radius:10px}.photo-block a span{display:block;font-size:11px;font-weight:800;margin-top:5px;text-align:center}
        @media(max-width:1100px){.problem-grid{grid-template-columns:1fr 1fr}.answer-grid{grid-template-columns:1fr 1fr}}@media(max-width:900px){.cards{grid-template-columns:1fr 1fr}.top,.filters{flex-direction:column;align-items:stretch}.problem-grid{grid-template-columns:1fr}}

        /* SOS234 admin SOS visual polish */
        .progress-page{background:linear-gradient(180deg,#f4f7f5,#f7f9f8);padding:30px 32px 50px}.top{align-items:center;padding:4px 0 2px}.top h1{letter-spacing:-.04em}.top p{line-height:1.55}.buttons button{min-height:42px;border-color:#d9e3dc;font-weight:900;transition:.16s ease}.buttons button:hover{transform:translateY(-1px);background:#f5faf7}
        .sos-tabs{padding:4px;background:#eaf1ec;border-radius:13px;width:max-content}.sos-tabs button{border:0;border-radius:10px;padding:10px 17px;background:transparent;color:#65736a}.sos-tabs .active{background:#fff;color:#176d42;box-shadow:0 4px 13px rgba(24,92,50,.10)}
        .cards{gap:11px}.cards article{border-color:#dfe8e2;border-radius:16px;padding:18px 19px;box-shadow:0 7px 22px rgba(29,70,43,.05)}.cards span{font-size:12px}.cards b{display:block;margin-top:5px;color:#1d5f3c;letter-spacing:-.03em}
        .filters{border-color:#dfe8e2;border-radius:15px;box-shadow:0 5px 18px rgba(29,70,43,.04)}.filters select,.filters input{min-height:42px;border-color:#d7e1da}.filters select:focus,.filters input:focus{outline:none;border-color:#78ae8a;box-shadow:0 0 0 3px rgba(39,133,83,.08)}
        .table{border-color:#dfe8e2;border-radius:16px;box-shadow:0 7px 24px rgba(29,70,43,.05)}.row{border-bottom-color:#edf1ee}.row:not(.head):hover{background:#f8fbf9}.head{background:#f4f8f5;color:#5c6b62}.row.selected{background:#eff8f2}.status{padding:6px 9px}.status.in_progress{background:#fff2df;color:#9b5a15}.status.completed,.status.passed{background:#e7f5ec;color:#176d42}.detail-btn{border-color:#b8d8c5;background:#eef8f2}.detail-btn:hover{background:#e4f4ea}
        .detail-panel{border-color:#dce7df;border-radius:18px;padding:20px;box-shadow:0 10px 30px rgba(29,70,43,.06)}.detail-head{padding-bottom:16px}.detail-head h2{letter-spacing:-.03em}.training-result-summary>div{border-color:#dfe8e2;border-radius:14px;background:#f7faf8}.problem-grid{gap:12px}.problem-card{border-color:#dfe8e2;border-radius:15px;background:#fff;box-shadow:0 5px 16px rgba(29,70,43,.04)}.problem-card.correct{border-top-color:#248653}.problem-card.wrong{border-top-color:#cc4f49}.problem-info span{background:#f3f7f4}.answer-grid>div{background:#f5f8f6}.review-result{background:#f5f9f6;border:1px solid #e2ebe5}
        @media(max-width:900px){.progress-page{padding:20px 16px 40px}.sos-tabs{width:100%;overflow:auto}.cards{grid-template-columns:1fr 1fr}.top{align-items:stretch}.buttons{flex-wrap:wrap}.detail-panel{padding:15px}}

      `}</style>
    </main>
  </AdminPortalShell>;
}