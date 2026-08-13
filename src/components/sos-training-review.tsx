"use client";

import type React from "react";
import {useEffect,useState} from "react";

function fmt(seconds:number){const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}

export default function SosTrainingReview({session,onCompleted,onNotice}:{session:any;onCompleted:(json:any)=>Promise<void>|void;onNotice:(message:string)=>void}){
  const wrong=(Array.isArray(session?.items)?session.items:[]).filter((x:any)=>x.isCorrect===false);
  const [index,setIndex]=useState(0);
  const [answer,setAnswer]=useState("");
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [seconds,setSeconds]=useState<Record<string,number>>({});
  const [started,setStarted]=useState(Date.now());
  const [now,setNow]=useState(Date.now());
  const [busy,setBusy]=useState(false);
  const item=wrong[index]??null;
  const itemId=String(item?.id??"");
  const elapsed=Math.max(1,Math.floor((now-started)/1000));

  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(id);},[]);
  useEffect(()=>{setAnswer("");setStarted(Date.now());setNow(Date.now());},[itemId]);

  async function next(){
    if(!item||!answer.trim()){onNotice("오답 정답을 다시 입력해 주세요.");return;}
    const a={...answers,[itemId]:answer.trim()};
    const t={...seconds,[itemId]:elapsed};
    setAnswers(a);setSeconds(t);
    const saved=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save_review_item",sessionId:session.id,itemId,answer:answer.trim(),responseSeconds:elapsed,question:index+1})});
    const savedJson=await saved.json();
    if(!saved.ok){onNotice(savedJson.message||"오답 저장 실패");return;}
    if(index<wrong.length-1){setIndex((v:number)=>v+1);return;}
    setBusy(true);onNotice("");
    try{
      const response=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"submit_review",sessionId:session.id,answers:a,responseSeconds:t})});
      const json=await response.json();
      if(!response.ok)throw new Error(json.message||"오답 제출 실패");
      await onCompleted(json);
    }catch(e){onNotice(e instanceof Error?e.message:"오답 제출 실패");}finally{setBusy(false);}
  }

  if(!item)return <div className="student-section-empty"><b>오답 대상이 없습니다.</b></div>;
  return <div className="sos-training-review">
    <section className="sos-training-focus review">
      <small>필수 오답</small><h3>틀린 문항을 다시 해결하세요</h3><p>{index+1}/{wrong.length} · 오답 재풀이 시간도 기록됩니다.</p>
    </section>
    <article className="sos-diagnosis-question sos-training-question">
      <header><div><b>{item.order??index+1}번 오답</b><span>처음 답 {item.studentAnswer||"-"}</span></div><div className="solve"><small>재풀이시간</small><strong>{fmt(elapsed)}</strong></div></header>
      <div className="sos-diagnosis-image">{item.problem?.imageUrl?<img src={item.problem.imageUrl} alt="오답 문제"/>:item.generated?<div className="sos-generated-question">{item.problem?.generatedText}</div>:<p>문항 이미지가 없습니다.</p>}</div>
      <div className="sos-answer-lock-box"><label><span>다시 푼 답</span><input autoFocus value={answer} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setAnswer(e.target.value)} onKeyDown={(e:React.KeyboardEvent<HTMLInputElement>)=>{if(e.key==="Enter")void next();}}/></label><p>오답은 바로미터 상승의 주재료가 아니라, 보완 여부를 확인하는 소폭 보정으로만 반영됩니다.</p><button disabled={busy} onClick={()=>void next()}>{busy?"오답 확인 중...":index===wrong.length-1?"오답 제출":"다음 오답"}</button></div>
    </article>
  </div>;
}
