"use client";

import type React from "react";
import {useEffect,useMemo,useState} from "react";

function fmt(seconds:number){const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}

export default function SosTrainingReview({session,onCompleted,onNotice}:{session:any;onCompleted:(json:any)=>Promise<void>|void;onNotice:(message:string)=>void}){
  const all:any[]=Array.isArray(session?.items)?session.items:[];
  const wrong=useMemo(()=>all.filter((x:any)=>x.isCorrect===false),[all]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [answer,setAnswer]=useState("");
  const [reviewed,setReviewed]=useState<Record<string,{answer:string;seconds:number}>>(()=>Object.fromEntries(
    wrong.filter((x:any)=>String(x.reviewAnswer??"").trim()).map((x:any)=>[String(x.id),{answer:String(x.reviewAnswer),seconds:Number(x.reviewResponseSeconds??0)||1}])
  ));
  const [started,setStarted]=useState(Date.now());
  const [now,setNow]=useState(Date.now());
  const [busy,setBusy]=useState(false);
  const item=wrong.find((x:any)=>String(x.id)===String(selectedId))??null;
  const elapsed=Math.max(1,Math.floor((now-started)/1000));
  const correct=all.filter((x:any)=>x.isCorrect===true).length;
  const rate=all.length?Math.round(correct/all.length*100):0;
  const completedCount=wrong.filter((x:any)=>reviewed[String(x.id)]).length;

  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(id);},[]);
  useEffect(()=>{if(item){setAnswer(String(reviewed[String(item.id)]?.answer??""));setStarted(Date.now());setNow(Date.now());}},[selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function openWrong(id:string){
    if(busy)return;
    setSelectedId(id);
    onNotice("");
  }

  async function saveReview(){
    if(!item||!answer.trim()){onNotice("다시 푼 답을 입력해 주세요.");return;}
    setBusy(true);
    try{
      const sec=Math.max(1,elapsed);
      const response=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save_review_item",sessionId:session.id,itemId:item.id,answer:answer.trim(),responseSeconds:sec,question:item.order})});
      const json=await response.json();
      if(!response.ok)throw new Error(json.message||"오답 저장 실패");
      setReviewed((v:any)=>({...v,[String(item.id)]:{answer:answer.trim(),seconds:sec}}));
      setSelectedId(null);
      onNotice("오답을 저장했습니다. 남은 오답 문항을 선택해 주세요.");
    }catch(e){onNotice(e instanceof Error?e.message:"오답 저장 실패");}finally{setBusy(false);}
  }

  async function finishReview(){
    if(busy)return;
    const missing=wrong.filter((x:any)=>!reviewed[String(x.id)]);
    if(missing.length){onNotice(`아직 오답하지 않은 문항이 ${missing.length}개 있습니다.`);return;}
    setBusy(true);onNotice("");
    try{
      const answers=Object.fromEntries(Object.entries(reviewed).map(([id,v]:any)=>[id,v.answer]));
      const responseSeconds=Object.fromEntries(Object.entries(reviewed).map(([id,v]:any)=>[id,v.seconds]));
      const response=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"submit_review",sessionId:session.id,answers,responseSeconds})});
      const json=await response.json();
      if(!response.ok)throw new Error(json.message||"오답 제출 실패");
      await onCompleted(json);
    }catch(e){onNotice(e instanceof Error?e.message:"오답 제출 실패");}finally{setBusy(false);}
  }

  if(item){
    return <div className="sos-training-review">
      <section className="sos-training-focus review">
        <small>개별 오답</small><h3>{item.order}번 문항 다시 풀기</h3><p>첫 풀이시간 {fmt(Number(item.responseSeconds??0))} · 내 답 {item.studentAnswer||"-"} · 정답 {item.problem?.correctAnswer||"-"}</p>
      </section>
      <article className="sos-diagnosis-question sos-training-question">
        <header><div><b>{item.order}번 오답</b><span>틀린 이유를 생각하며 다시 풀어보세요.</span></div><div className="solve"><small>재풀이시간</small><strong>{fmt(elapsed)}</strong></div></header>
        <div className="sos-diagnosis-image">{item.problem?.imageUrl?<img src={item.problem.imageUrl} alt={`${item.order}번 오답 문제`}/>:item.generated?<div className="sos-generated-question">{item.problem?.generatedText}</div>:<p>문항 이미지가 없습니다.</p>}</div>
        <div className="sos-answer-lock-box">
          <label><span>다시 푼 답</span><input autoFocus disabled={busy} value={answer} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setAnswer(e.target.value)} onKeyDown={(e:React.KeyboardEvent<HTMLInputElement>)=>{if(e.key==="Enter")void saveReview();}}/></label>
          <p>오답은 보완 확인용으로 반영되며, 재풀이 시간도 함께 기록됩니다.</p>
          <div className="sos-training-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setSelectedId(null)}>← 성적표로</button><button disabled={busy||!answer.trim()} onClick={()=>void saveReview()}>{busy?"저장 중...":"오답 저장 · 성적표로"}</button></div>
        </div>
      </article>
    </div>;
  }

  return <div className="sos-training-report">
    <section className="sos-report-head">
      <small>{Number(session?.round_no)===2?"2차 훈련 결과":"1차 훈련 결과"}</small>
      <h3>{correct} / {all.length} 정답</h3>
      <strong>정답률 {rate}%</strong>
      <p>문항별 결과를 확인하고, <b>틀린 문항을 눌러 오답</b>하세요.</p>
    </section>
    <div className="sos-report-grid">
      {all.map((x:any)=>{
        const isWrong=x.isCorrect===false;
        const done=Boolean(reviewed[String(x.id)]);
        return <button key={x.id} type="button" disabled={!isWrong||busy} className={`sos-report-item ${isWrong?"wrong":"correct"} ${done?"reviewed":""}`} onClick={()=>isWrong&&openWrong(String(x.id))}>
          <span className="num">{x.order}번</span>
          <b>{isWrong?"X":"O"}</b>
          <small>{fmt(Number(x.responseSeconds??0))}</small>
          {isWrong?<em>{done?"오답완료 ✓":"오답하기"}</em>:<em>정답</em>}
        </button>;
      })}
    </div>
    {wrong.length?<div className="sos-report-review-state"><b>오답 진행 {completedCount}/{wrong.length}</b><span>틀린 문항을 모두 오답하면 바로미터 결과를 확인할 수 있습니다.</span><button type="button" disabled={busy||completedCount!==wrong.length} onClick={()=>void finishReview()}>{busy?"바로미터 계산 중...":"오답 완료 · 결과 확인"}</button></div>:null}
  </div>;
}
