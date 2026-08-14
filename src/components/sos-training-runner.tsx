"use client";

import type React from "react";
import {useEffect,useMemo,useState} from "react";

function fmt(seconds:number){
  const s=Math.max(0,Math.floor(seconds));
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
}

export default function SosTrainingRunner({session,onCompleted,onNotice}:{session:any;onCompleted:(json:any)=>Promise<void>|void;onNotice:(message:string)=>void}){
  const items:any[]=Array.isArray(session?.items)?session.items:[];
  const initialAnswers=useMemo(()=>Object.fromEntries(items.map((x:any)=>[String(x.id),String(x.studentAnswer??"")])),[items]);
  const initialSeconds=useMemo(()=>Object.fromEntries(items.map((x:any)=>[String(x.id),Number(x.responseSeconds??0)||0])),[items]);
  const firstOpen=useMemo(()=>Math.max(0,items.findIndex((x:any)=>!String(x.studentAnswer??"").trim())),[items]);
  const [index,setIndex]=useState(firstOpen>=0?firstOpen:0);
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
  const label=String(session?.cycle_kind)==="HOMEWORK"?"완성 확인 숙제":Number(session?.round_no)===2?"2차 AI 유사훈련":"1차 맞춤훈련";

  async function persistCurrent(requireAnswer=false){
    if(!item)return false;
    const value=answer.trim();
    if(!value){
      if(requireAnswer)onNotice("답을 입력해 주세요.");
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
    // 입력해 둔 답이 있으면 이동 전에 저장. 빈칸이어도 이전/다른 문항 이동은 허용한다.
    if(answer.trim()){
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
    const mergedAnswers={...answers,...(currentValue?{[itemId]:currentValue}:{})};
    const missingIndexes=items.map((x:any,i:number)=>String(mergedAnswers[String(x.id)]??x.studentAnswer??"").trim()?null:i).filter((x:any)=>x!==null) as number[];
    if(missingIndexes.length){
      const first=missingIndexes[0];
      onNotice(`미응답 ${missingIndexes.length}문항이 있습니다. ${first+1}번 문항으로 이동했습니다.`);
      setIndex(first);
      return;
    }
    if(!window.confirm(`${label} ${items.length}문항을 제출할까요?`))return;

    // 최종 제출을 누르는 순간 마지막 문항 풀이시간을 고정한다.
    const finalElapsed=Math.max(1,elapsed);
    setFrozenElapsed(finalElapsed);
    setBusy(true);
    try{
      let finalAnswers={...mergedAnswers};
      let finalSeconds={...seconds,[itemId]:finalElapsed};
      if(currentValue){
        const saved=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save_training_item",sessionId:session.id,itemId,answer:currentValue,responseSeconds:finalElapsed,question:index+1})});
        const savedJson=await saved.json();
        if(!saved.ok)throw new Error(savedJson.message||"마지막 문항 저장 실패");
      }
      const response=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"submit",sessionId:session.id,answers:finalAnswers,responseSeconds:finalSeconds})});
      const json=await response.json();
      if(!response.ok){
        // 서버가 미응답을 발견하더라도 학생이 바로 찾을 수 있도록 이동시킨다.
        if(String(json?.message??"").includes("미응답")){
          const firstMissing=items.findIndex((x:any)=>!String(finalAnswers[String(x.id)]??x.studentAnswer??"").trim());
          if(firstMissing>=0)setIndex(firstMissing);
        }
        throw new Error(json.message||"훈련 제출 실패");
      }
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
      {baseline>0&&goal>0?<p>시작 바로미터 <b>{baseline.toFixed(2)}</b> → 이번 목표 <b>{goal.toFixed(2)}</b></p>:null}
      <i><em style={{width:`${progress}%`}}/></i>
      <div className="sos-training-jump" aria-label="훈련 문항 이동">
        {items.map((x:any,i:number)=>{
          const id=String(x.id); const done=Boolean(String(answers[id]??x.studentAnswer??"").trim());
          return <button key={id} type="button" disabled={busy} className={`${i===index?"now":""} ${done?"done":"missing"}`} onClick={()=>void moveTo(i)}>{i+1}</button>;
        })}
      </div>
      <p className="sos-training-jump-help">초록색은 답안 저장 완료 · 빈 원은 미응답 · 번호를 눌러 앞 문항으로 돌아갈 수 있습니다.</p>
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
        <label><span>정답</span><input autoFocus disabled={busy} value={answer} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setAnswer(e.target.value)} placeholder="정답을 입력하세요" onKeyDown={(e:React.KeyboardEvent<HTMLInputElement>)=>{if(e.key==="Enter")void next();}}/></label>
        <p>문항별 풀이시간이 기록되어 바로미터 산정에 함께 반영됩니다.</p>
        <div className="sos-training-actions">
          <button type="button" className="secondary" disabled={busy||index===0} onClick={()=>void moveTo(index-1)}>← 이전 문항</button>
          <button type="button" disabled={busy} onClick={()=>void next()}>{busy?"채점·분석 중...":index===items.length-1?"훈련 제출":"답 저장 · 다음 문항"}</button>
        </div>
      </div>
    </article>
  </div>;
}
