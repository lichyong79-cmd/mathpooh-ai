"use client";

import type React from "react";
import {useEffect,useMemo,useState} from "react";

function fmt(seconds:number){
  const s=Math.max(0,Math.floor(seconds));
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
}

export default function SosTrainingRunner({session,onCompleted,onNotice}:{session:any;onCompleted:(json:any)=>Promise<void>|void;onNotice:(message:string)=>void}){
  const items:any[]=Array.isArray(session?.items)?session.items:[];
  const [index,setIndex]=useState(0);
  const [answer,setAnswer]=useState("");
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [seconds,setSeconds]=useState<Record<string,number>>({});
  const [started,setStarted]=useState(Date.now());
  const [now,setNow]=useState(Date.now());
  const [busy,setBusy]=useState(false);
  const item=items[index]??null;
  const itemId=String(item?.id??"");
  const elapsed=Math.max(1,Math.floor((now-started)/1000));
  const progress=items.length?Math.round((index/items.length)*100):0;

  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(id);},[]);
  useEffect(()=>{
    setAnswer(String(answers[itemId]??item?.studentAnswer??""));
    setStarted(Date.now());
    setNow(Date.now());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[itemId]);

  const generated=Boolean(item?.generated);
  const role=String(item?.role??"");
  const weakness=String(session?.weakness_snapshot?.weaknessTitle??session?.target_snapshot?.weaknessTitle??"");
  const goal=Number(session?.goal_meter??session?.target_snapshot?.goalMeter??0);
  const baseline=Number(session?.baseline_meter??session?.target_snapshot?.baselineMeter??0);
  const label=String(session?.cycle_kind)==="HOMEWORK"?"완성 확인 숙제":Number(session?.round_no)===2?"2차 AI 유사훈련":"1차 맞춤훈련";

  async function next(){
    if(!item||!answer.trim()){onNotice("답을 입력해 주세요.");return;}
    const nextAnswers={...answers,[itemId]:answer.trim()};
    const nextSeconds={...seconds,[itemId]:elapsed};
    setAnswers(nextAnswers);setSeconds(nextSeconds);onNotice("");
    const saved=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save_training_item",sessionId:session.id,itemId,answer:answer.trim(),responseSeconds:elapsed,question:index+1})});
    const savedJson=await saved.json();
    if(!saved.ok){onNotice(savedJson.message||"문항 저장 실패");return;}
    if(index<items.length-1){setIndex((v:number)=>v+1);return;}
    if(!window.confirm(`${label} ${items.length}문항을 제출할까요?`))return;
    setBusy(true);
    try{
      const response=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"submit",sessionId:session.id,answers:nextAnswers,responseSeconds:nextSeconds})});
      const json=await response.json();
      if(!response.ok)throw new Error(json.message||"훈련 제출 실패");
      await onCompleted(json);
    }catch(e){onNotice(e instanceof Error?e.message:"훈련 제출 실패");}finally{setBusy(false);}
  }

  if(!item)return <div className="student-section-empty"><b>훈련 문항이 없습니다.</b></div>;

  return <div className="sos-training-runner">
    <section className="sos-training-focus">
      <small>{label}</small>
      <h3>{weakness||"맞춤 취약점 훈련"}</h3>
      {baseline>0&&goal>0?<p>시작 바로미터 <b>{baseline.toFixed(2)}</b> → 이번 목표 <b>{goal.toFixed(2)}</b></p>:null}
      <i><em style={{width:`${progress}%`}}/></i>
    </section>
    <article className="sos-diagnosis-question sos-training-question">
      <header>
        <div><b>{index+1}번</b><span>{item.problem?.unit??""} · {item.problem?.topic??""}</span></div>
        <div className="solve"><small>풀이시간</small><strong>{fmt(elapsed)}</strong></div>
      </header>
      {role?<p className="sos-training-role">{role}</p>:null}
      <div className="sos-diagnosis-image">
        {item.problem?.imageUrl?<img src={item.problem.imageUrl} alt={`${index+1}번 문제`}/>:generated?<div className="sos-generated-question">{item.problem?.generatedText||"AI 유사문항"}</div>:<p>문항 이미지가 없습니다.</p>}
      </div>
      <div className="sos-answer-lock-box">
        <label><span>정답</span><input autoFocus value={answer} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setAnswer(e.target.value)} placeholder="정답을 입력하세요" onKeyDown={(e:React.KeyboardEvent<HTMLInputElement>)=>{if(e.key==="Enter")void next();}}/></label>
        <p>문항별 풀이시간이 기록되어 바로미터 산정에 함께 반영됩니다.</p>
        <button disabled={busy} onClick={()=>void next()}>{busy?"채점·분석 중...":index===items.length-1?"훈련 제출":"답 저장 · 다음 문항"}</button>
      </div>
    </article>
  </div>;
}
