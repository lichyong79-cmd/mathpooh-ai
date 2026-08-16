"use client";

import type React from "react";
import {useEffect,useMemo,useState} from "react";
import SosProblemImage from "./sos-problem-image";

function fmt(seconds:number){
  const s=Math.max(0,Math.floor(seconds));
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
}

export default function SosTrainingRunner({session,onCompleted,onNotice}:{session:any;onCompleted:(json:any)=>Promise<void>|void;onNotice:(message:string)=>void}){
  const items:any[]=Array.isArray(session?.items)?session.items:[];
  const initialAnswers=useMemo(()=>Object.fromEntries(items.map((x:any)=>[String(x.id),String(x.studentAnswer??"")])),[items]);
  const initialSeconds=useMemo(()=>Object.fromEntries(items.map((x:any)=>[String(x.id),Number(x.responseSeconds??0)||0])),[items]);
  const firstOpen=useMemo(()=>{
    const i=items.findIndex((x:any)=>!String(x.studentAnswer??"").trim());
    return i>=0?i:Math.max(0,items.length-1);
  },[items]);
  const [index,setIndex]=useState(firstOpen);
  const [answer,setAnswer]=useState("");
  const [answers,setAnswers]=useState<Record<string,string>>(initialAnswers);
  const [seconds,setSeconds]=useState<Record<string,number>>(initialSeconds);
  const [started,setStarted]=useState(Date.now());
  const [now,setNow]=useState(Date.now());
  const [busy,setBusy]=useState(false);
  const [frozenElapsed,setFrozenElapsed]=useState<number|null>(null);
  const item=items[index]??null;
  const itemId=String(item?.id??"");
  const elapsed=frozenElapsed??Math.max(1,Math.floor((now-started)/1000));
  const answeredCount=items.filter((x:any)=>String(answers[String(x.id)]??x.studentAnswer??"").trim()).length;
  const progress=items.length?Math.round((answeredCount/items.length)*100):0;

  // 답이 저장된 연속 구간까지만 다음 문항 접근을 허용한다.
  const maxUnlocked=useMemo(()=>{
    let unlocked=0;
    for(let i=0;i<items.length;i++){
      const id=String(items[i]?.id??"");
      if(String(answers[id]??items[i]?.studentAnswer??"").trim())unlocked=Math.min(items.length-1,i+1);
      else break;
    }
    return unlocked;
  },[answers,items]);

  useEffect(()=>{const id=window.setInterval(()=>{if(!busy)setNow(Date.now());},1000);return()=>window.clearInterval(id);},[busy]);
  useEffect(()=>{
    setAnswer(String(answers[itemId]??item?.studentAnswer??""));
    setStarted(Date.now());
    setNow(Date.now());
    setFrozenElapsed(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[itemId]);

  const generated=Boolean(item?.generated);
  const role=String(item?.role??"");
  const weakness=String(session?.weakness_snapshot?.weaknessTitle??session?.target_snapshot?.weaknessTitle??"");
  const goal=Number(session?.goal_meter??session?.target_snapshot?.goalMeter??0);
  const baseline=Number(session?.baseline_meter??session?.target_snapshot?.baselineMeter??0);
  const homework=String(session?.cycle_kind)==="HOMEWORK";
  const label=homework?"AI 유사문항 3제 굳히기":Number(session?.round_no)===2?"2차 AI 유사훈련":"1차 맞춤훈련";

  async function persistCurrent(requireAnswer=false){
    if(!item)return false;
    const value=answer.trim();
    if(!value){
      if(requireAnswer)onNotice("답을 입력해야 다음 문항으로 넘어갈 수 있습니다.");
      return !requireAnswer;
    }
    const sec=Math.max(1,elapsed);
    const nextAnswers={...answers,[itemId]:value};
    const nextSeconds={...seconds,[itemId]:sec};
    setAnswers(nextAnswers);setSeconds(nextSeconds);
    const saved=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save_training_item",sessionId:session.id,itemId,answer:value,responseSeconds:sec,question:index+1})});
    const savedJson=await saved.json();
    if(!saved.ok){onNotice(savedJson.message||"문항 저장 실패");return false;}
    onNotice("");
    return true;
  }

  async function moveTo(target:number){
    if(busy||target<0||target>=items.length||target===index)return;
    // 미래 문항 건너뛰기 금지. 답을 저장한 문항과 바로 다음 문항까지만 접근 가능.
    if(target>maxUnlocked){
      onNotice(`${maxUnlocked+1}번 문항의 답을 먼저 입력해 주세요.`);
      return;
    }
    // 앞으로 갈 때는 현재 답이 필수. 뒤로 갈 때는 자유롭게 확인/수정 가능.
    if(target>index){
      const ok=await persistCurrent(true);
      if(!ok)return;
    }else if(answer.trim()){
      const ok=await persistCurrent(false);
      if(!ok)return;
    }
    setIndex(target);
  }

  async function next(){
    if(!item)return;
    const ok=await persistCurrent(true);
    if(!ok)return;
    if(index<items.length-1){setIndex((v:number)=>v+1);return;}
    await submitAll();
  }

  async function submitAll(){
    if(!item||busy)return;
    const currentValue=answer.trim();
    if(!currentValue){onNotice("답을 입력해야 훈련을 제출할 수 있습니다.");return;}
    const finalElapsed=Math.max(1,elapsed);
    const mergedAnswers={...answers,[itemId]:currentValue};
    const finalSeconds={...seconds,[itemId]:finalElapsed};
    const missingIndexes=items.map((x:any,i:number)=>String(mergedAnswers[String(x.id)]??x.studentAnswer??"").trim()?null:i).filter((x:any)=>x!==null) as number[];
    if(missingIndexes.length){
      const first=missingIndexes[0];
      onNotice(`${first+1}번 문항의 답을 먼저 입력해 주세요.`);
      setIndex(first);
      return;
    }
    if(!window.confirm(`${label} ${items.length}문항을 제출하고 성적표를 확인할까요?`))return;

    setFrozenElapsed(finalElapsed);
    setBusy(true);
    try{
      const saved=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save_training_item",sessionId:session.id,itemId,answer:currentValue,responseSeconds:finalElapsed,question:index+1})});
      const savedJson=await saved.json();
      if(!saved.ok)throw new Error(savedJson.message||"마지막 문항 저장 실패");

      const response=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"submit",sessionId:session.id,answers:mergedAnswers,responseSeconds:finalSeconds})});
      const json=await response.json();
      if(!response.ok)throw new Error(json.message||"훈련 제출 실패");
      await onCompleted(json);
    }catch(e){
      setFrozenElapsed(null);
      onNotice(e instanceof Error?e.message:"훈련 제출 실패");
    }finally{setBusy(false);}
  }

  if(!item)return <div className="student-section-empty"><b>훈련 문항이 없습니다.</b></div>;

  return <div className="sos-training-runner">
    <section className="sos-training-focus">
      <small>{label}</small>
      <h3>{weakness||"맞춤 취약점 훈련"}</h3>
      {baseline>0&&goal>0?<><p>시작 바로미터 <b>{baseline.toFixed(2)}</b> → 이번 목표 <b>{goal.toFixed(2)}</b></p><small className="sos-term-help">바로미터는 현재 취약영역의 실력을 나타내는 지표입니다. 최초 정오답·문항난이도·풀이시간과 오답 교정 결과를 함께 반영합니다.</small></>:null}
      <i><em style={{width:`${progress}%`}}/></i>
      <div className="sos-training-jump" aria-label="훈련 문항 이동">
        {items.map((x:any,i:number)=>{
          const id=String(x.id); const done=Boolean(String(answers[id]??x.studentAnswer??"").trim());
          const locked=i>maxUnlocked;
          return <button key={id} type="button" disabled={busy||locked} className={`${i===index?"now":""} ${done?"done":"missing"} ${locked?"locked":""}`} onClick={()=>void moveTo(i)}>{i+1}</button>;
        })}
      </div>
      <p className="sos-training-jump-help">답을 입력해야 다음 문항이 열립니다. 이전 문항은 언제든 돌아가 답을 수정할 수 있습니다.</p>
    </section>
    <article className="sos-diagnosis-question sos-training-question">
      <header>
        <div><b>{index+1}번</b><span>{item.problem?.unit??""} · {item.problem?.topic??""}</span></div>
        <div className="solve"><small>{homework?"시간제한":"풀이시간"}</small><strong>{homework?"없음":fmt(elapsed)}</strong></div>
      </header>
      {role?<p className="sos-training-role">{role}</p>:null}
      {generated?<div className={`sos-generated-origin ${String(session?.cycle_kind)==="HOMEWORK"?"homework":"second"}`}>
        <b>{homework?"AI 유사문항 3제 굳히기":"AI 유사문항 · 2차 훈련"}</b>
        <span>{Number(item.problem?.sourceTrainingOrder)>0?`1차 훈련 ${item.problem.sourceTrainingOrder}번에서 파생 · `:""}핵심유형: {item.problem?.coreType||item.problem?.topic||"취약유형 보완"}</span>
        {item.problem?.generatedReason?<small>{item.problem.generatedReason}</small>:null}
      </div>:null}
      <div className="sos-diagnosis-image">
        {item.problem?.imageUrl?<SosProblemImage src={item.problem.imageUrl} alt={`${index+1}번 문제`} maskOriginalNumber={!generated&&Number(session?.round_no??1)===1}/>:generated?<div className="sos-generated-question">{item.problem?.generatedText||"AI 유사문항"}</div>:<p>문항 이미지가 없습니다.</p>}
      </div>
      <div className="sos-answer-lock-box">
        <label><span>정답</span><input autoFocus disabled={busy} value={answer} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setAnswer(e.target.value)} placeholder="정답을 입력하세요" onKeyDown={(e:React.KeyboardEvent<HTMLInputElement>)=>{if(e.key==="Enter")void next();}}/></label>
        <p>{homework?"시간 제한 없이 충분히 풀어도 됩니다. 최초 정답과 오답 교정 과정은 기록되지만 바로미터에는 반영되지 않습니다.":"문항별 풀이시간이 기록되어 바로미터 산정에 함께 반영됩니다."}</p>
        <div className="sos-training-actions">
          <button type="button" className="secondary" disabled={busy||index===0} onClick={()=>void moveTo(index-1)}>← 이전 문항</button>
          <button type="button" disabled={busy||!answer.trim()} onClick={()=>void next()}>{busy?"채점·분석 중...":index===items.length-1?"훈련 제출 · 성적표 보기":"답 저장 · 다음 문항"}</button>
        </div>
      </div>
    </article>
  </div>;
}
