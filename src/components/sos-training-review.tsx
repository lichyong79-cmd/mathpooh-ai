"use client";

import type React from "react";
import {useEffect,useMemo,useState} from "react";

function fmt(seconds:number){const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}

type ReviewedState={answer:string;seconds:number;isCorrect:boolean};

export default function SosTrainingReview({session,onCompleted,onNotice}:{session:any;onCompleted:(json:any)=>Promise<void>|void;onNotice:(message:string)=>void}){
  const all:any[]=Array.isArray(session?.items)?session.items:[];
  const wrong=useMemo(()=>all.filter((x:any)=>x.isCorrect===false),[all]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [answer,setAnswer]=useState("");
  const [feedback,setFeedback]=useState<{ok:boolean;correctAnswer?:string}|null>(null);
  const [reviewed,setReviewed]=useState<Record<string,ReviewedState>>(()=>Object.fromEntries(
    wrong.filter((x:any)=>x.reviewIsCorrect===true).map((x:any)=>[String(x.id),{answer:String(x.reviewAnswer??""),seconds:Number(x.reviewResponseSeconds??0)||1,isCorrect:true}])
  ));
  const [started,setStarted]=useState(Date.now());
  const [now,setNow]=useState(Date.now());
  const [busy,setBusy]=useState(false);
  const item=wrong.find((x:any)=>String(x.id)===String(selectedId))??null;
  const elapsed=Math.max(1,Math.floor((now-started)/1000));
  const correct=all.filter((x:any)=>x.isCorrect===true).length;
  const rate=all.length?Math.round(correct/all.length*100):0;
  const completedCount=wrong.filter((x:any)=>reviewed[String(x.id)]?.isCorrect).length;

  useEffect(()=>{const id=window.setInterval(()=>{if(!busy)setNow(Date.now());},1000);return()=>window.clearInterval(id);},[busy]);
  useEffect(()=>{if(item){setAnswer("");setFeedback(null);setStarted(Date.now());setNow(Date.now());}},[selectedId,item?.id]);

  function openWrong(id:string){if(busy)return;setSelectedId(id);setFeedback(null);onNotice("");}

  async function saveReview(){
    if(!item||!answer.trim()){onNotice("다시 푼 답을 입력해 주세요.");return;}
    setBusy(true);onNotice("");
    try{
      const sec=Math.max(1,elapsed);
      const response=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save_review_item",sessionId:session.id,itemId:item.id,answer:answer.trim(),responseSeconds:sec,question:item.order})});
      const json=await response.json();
      if(!response.ok)throw new Error(json.message||"오답 저장 실패");
      if(json.isCorrect===true){
        setReviewed((v:any)=>({...v,[String(item.id)]:{answer:answer.trim(),seconds:sec,isCorrect:true}}));
        setFeedback({ok:true});
        onNotice("정답입니다. 이 문항의 오답 교정이 완료되었습니다.");
      }else{
        setFeedback({ok:false,correctAnswer:String(json.correctAnswer??"")});
        onNotice("아직 정답이 아닙니다. 정답과 풀이를 확인한 뒤 다시 입력해 주세요.");
      }
    }catch(e){onNotice(e instanceof Error?e.message:"오답 저장 실패");}finally{setBusy(false);}
  }

  async function finishReview(){
    if(busy)return;
    const missing=wrong.filter((x:any)=>!reviewed[String(x.id)]?.isCorrect);
    if(missing.length){onNotice(`아직 교정이 끝나지 않은 오답이 ${missing.length}개 있습니다.`);return;}
    setBusy(true);onNotice("");
    try{
      const answers=Object.fromEntries(Object.entries(reviewed).map(([id,v])=>[id,v.answer]));
      const responseSeconds=Object.fromEntries(Object.entries(reviewed).map(([id,v])=>[id,v.seconds]));
      const response=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"submit_review",sessionId:session.id,answers,responseSeconds})});
      const json=await response.json();
      if(!response.ok)throw new Error(json.message||"오답 제출 실패");
      await onCompleted(json);
    }catch(e){onNotice(e instanceof Error?e.message:"오답 제출 실패");}finally{setBusy(false);}
  }

  if(item){
    const done=Boolean(reviewed[String(item.id)]?.isCorrect);
    return <div className="sos-training-review">
      <section className="sos-training-focus review">
        <small>오답 교정 · {item.order}번</small><h3>틀린 문항을 다시 풀어보세요.</h3>
        <p>첫 답 <b>{item.studentAnswer||"-"}</b> · 첫 풀이시간 <b>{fmt(Number(item.responseSeconds??0))}</b></p>
      </section>
      <article className="sos-diagnosis-question sos-training-question">
        <header><div><b>{item.order}번 오답</b><span>{done?"교정 완료":"정답을 보지 않고 먼저 다시 풀어보세요."}</span></div><div className="solve"><small>재풀이시간</small><strong>{fmt(elapsed)}</strong></div></header>
        <div className="sos-diagnosis-image">{item.problem?.imageUrl?<img src={item.problem.imageUrl} alt={`${item.order}번 오답 문제`}/>:item.generated?<div className="sos-generated-question">{item.problem?.generatedText}</div>:<p>문항 이미지가 없습니다.</p>}</div>
        <div className="sos-answer-lock-box">
          {!done?<label><span>다시 푼 답</span><input autoFocus disabled={busy} value={answer} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>{setAnswer(e.target.value);setFeedback(null);}} onKeyDown={(e:React.KeyboardEvent<HTMLInputElement>)=>{if(e.key==="Enter")void saveReview();}}/></label>:null}
          {feedback?.ok===false?<div className="sos-review-feedback wrong"><b>아직 오답입니다.</b><span>정답: {feedback.correctAnswer||item.problem?.correctAnswer||"-"}</span>{item.generated&&item.problem?.generatedSolution?<details open><summary>AI 해설</summary><p>{item.problem.generatedSolution}</p></details>:<p>정답을 확인하고 풀이 과정을 다시 점검한 뒤 재입력하세요.</p>}</div>:null}
          {done?<div className="sos-review-feedback correct"><b>✓ 교정 완료</b><span>재풀이 답 {reviewed[String(item.id)]?.answer} · {fmt(reviewed[String(item.id)]?.seconds??0)}</span></div>:null}
          <div className="sos-training-actions">
            <button type="button" className="secondary" disabled={busy} onClick={()=>setSelectedId(null)}>← 성적표로</button>
            {!done?<button disabled={busy||!answer.trim()} onClick={()=>void saveReview()}>{busy?"채점 중...":"다시 채점"}</button>:<button onClick={()=>setSelectedId(null)}>교정 완료 · 성적표로</button>}
          </div>
        </div>
      </article>
    </div>;
  }

  return <div className="sos-training-report">
    <section className="sos-report-head">
      <small>{Number(session?.round_no)===2?"2차 훈련 성적표":"1차 훈련 성적표"}</small>
      <h3>{correct} / {all.length} 정답</h3><strong>정답률 {rate}%</strong>
      <p>문항별 결과를 확인하고 <b>X 문항을 눌러 직접 오답 교정</b>하세요.</p>
    </section>
    <div className="sos-report-grid">
      {all.map((x:any)=>{
        const isWrong=x.isCorrect===false;
        const done=Boolean(reviewed[String(x.id)]?.isCorrect);
        return <button key={x.id} type="button" disabled={!isWrong||busy} className={`sos-report-item ${isWrong?"wrong":"correct"} ${done?"reviewed":""}`} onClick={()=>isWrong&&openWrong(String(x.id))}>
          <span className="num">{x.order}번</span><b>{isWrong?"X":"O"}</b><small>{fmt(Number(x.responseSeconds??0))}</small>
          {isWrong?<em>{done?"교정완료 ✓":"오답하기"}</em>:<em>정답</em>}
        </button>;
      })}
    </div>
    {wrong.length?<div className="sos-report-review-state"><b>오답 교정 {completedCount}/{wrong.length}</b><span>틀린 문항을 모두 정답으로 교정한 뒤 결과를 확인합니다.</span><button type="button" disabled={busy||completedCount!==wrong.length} onClick={()=>void finishReview()}>{busy?"바로미터 계산 중...":"오답 완료 · 결과 확인"}</button></div>:<div className="sos-report-review-state success"><b>전 문항 정답</b><span>오답 대상이 없습니다. 훈련 결과를 바로 확인할 수 있습니다.</span><button type="button" disabled={busy} onClick={()=>void finishReview()}>{busy?"결과 계산 중...":"훈련 결과 확인"}</button></div>}
  </div>;
}
