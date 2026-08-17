"use client";

import type React from "react";
import {useEffect,useMemo,useState} from "react";
import SosProblemImage from "./sos-problem-image";

function fmt(seconds:number){const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}
type ReviewedState={answer:string;seconds:number;isCorrect:boolean;completed:boolean;explained?:boolean};
type Feedback={ok:boolean;attemptNo:number;hint?:string;hintLevel?:number;revealAnswer?:boolean;correctAnswer?:string;solution?:string};

export default function SosTrainingReview({session,onCompleted,onNotice}:{session:any;onCompleted:(json:any)=>Promise<void>|void;onNotice:(message:string)=>void}){
  const all:any[]=Array.isArray(session?.items)?session.items:[];
  const wrong=useMemo(()=>all.filter((x:any)=>x.isCorrect===false),[all]);
  const diagnosis=String(session?.phase)==="DIAGNOSIS";
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [answer,setAnswer]=useState("");
  const [feedback,setFeedback]=useState<Feedback|null>(null);
  const [reviewed,setReviewed]=useState<Record<string,ReviewedState>>(()=>Object.fromEntries(wrong.filter((x:any)=>x.reviewCompleted||x.reviewIsCorrect===true).map((x:any)=>[String(x.id),{answer:String(x.reviewAnswer??""),seconds:Number(x.reviewResponseSeconds??0)||1,isCorrect:x.reviewIsCorrect===true,completed:true,explained:Boolean(x.reviewExplained)}])));
  const [started,setStarted]=useState(Date.now()); const [now,setNow]=useState(Date.now()); const [busy,setBusy]=useState(false);
  const item=wrong.find((x:any)=>String(x.id)===String(selectedId))??null;
  const elapsed=Math.max(1,Math.floor((now-started)/1000));
  const correct=all.filter((x:any)=>x.isCorrect===true).length; const rate=all.length?Math.round(correct/all.length*100):0;
  const completedCount=wrong.filter((x:any)=>reviewed[String(x.id)]?.completed||x.reviewCompleted).length;
  const correctedCount=wrong.filter((x:any)=>x.reviewIsCorrect===true||reviewed[String(x.id)]?.isCorrect===true).length;
  const explainedCount=wrong.filter((x:any)=>Boolean(x.reviewExplained||reviewed[String(x.id)]?.explained)).length;
  const explanationRequiredCount=wrong.filter((x:any)=>{
    const id=String(x.id);
    if(x.reviewIsCorrect===true||reviewed[id]?.isCorrect===true)return false;
    if(x.reviewExplained||reviewed[id]?.explained)return true;
    if(id===String(selectedId)&&feedback?.revealAnswer)return true;
    return Number(x.reviewAttemptCount??0)>=3;
  }).length;
  const reportTitle=diagnosis?`진단 ${session?.round_no}차 성적표`:String(session?.cycle_kind)==="HOMEWORK"?"AI 유사문항 3제 굳히기 성적표":Number(session?.round_no)===2?"2차 훈련 성적표":"1차 훈련 성적표";

  useEffect(()=>{const id=window.setInterval(()=>{if(!busy)setNow(Date.now());},1000);return()=>window.clearInterval(id);},[busy]);
  useEffect(()=>{if(item){setAnswer("");setFeedback(item.reviewLastHint?{ok:false,attemptNo:Number(item.reviewAttemptCount??0),hint:item.reviewLastHint,hintLevel:Number(item.reviewHintLevel??0)}:null);setStarted(Date.now());setNow(Date.now());}},[selectedId,item?.id]);

  async function saveReview(){
    if(!item||!answer.trim()){onNotice("다시 푼 답을 입력해 주세요.");return;} setBusy(true);onNotice("");
    try{
      const sec=Math.max(1,elapsed);
      const response=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save_review_item",sessionId:session.id,itemId:item.id,answer:answer.trim(),responseSeconds:sec,question:item.order})});
      const json=await response.json(); if(!response.ok)throw new Error(json.message||"오답 저장 실패");
      if(json.isCorrect===true){setReviewed(v=>({...v,[String(item.id)]:{answer:answer.trim(),seconds:sec,isCorrect:true,completed:true}}));setFeedback({ok:true,attemptNo:Number(json.attemptNo??1)});onNotice("정답입니다. 스스로 교정했습니다.");}
      else{setFeedback({ok:false,attemptNo:Number(json.attemptNo??1),hint:json.hint,hintLevel:json.hintLevel,revealAnswer:json.revealAnswer,correctAnswer:json.correctAnswer,solution:json.solution});setAnswer("");onNotice(json.revealAnswer?"세 번의 재도전이 끝났습니다. 정답과 핵심 풀이를 확인해 주세요.":`아직 오답입니다. 풀이 힌트 ${json.hintLevel}단계를 확인하고 다시 도전하세요.`);}
    }catch(e){onNotice(e instanceof Error?e.message:"오답 저장 실패");}finally{setBusy(false);}
  }
  async function completeExplanation(){
    if(!item)return;setBusy(true);
    try{const r=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"complete_review_explanation",sessionId:session.id,itemId:item.id,question:item.order})});const j=await r.json();if(!r.ok)throw new Error(j.message||"풀이 확인 저장 실패");setReviewed(v=>({...v,[String(item.id)]:{answer:String(item.reviewAnswer??answer??""),seconds:Math.max(1,elapsed),isCorrect:false,completed:true,explained:true}}));setSelectedId(null);onNotice("정답과 풀이 확인이 완료되었습니다. 다음 오답을 선택하세요.");}catch(e){onNotice(e instanceof Error?e.message:"풀이 확인 저장 실패");}finally{setBusy(false);}
  }
  async function finishReview(){
    const missing=wrong.filter(x=>!reviewed[String(x.id)]?.completed);if(missing.length){onNotice(`아직 교정이 끝나지 않은 오답이 ${missing.length}개 있습니다.`);return;}setBusy(true);onNotice("");
    try{
      const answers=Object.fromEntries(wrong.map(x=>[String(x.id),reviewed[String(x.id)]?.answer||x.reviewAnswer||x.studentAnswer||"확인완료"]));
      const responseSeconds=Object.fromEntries(wrong.map(x=>[String(x.id),reviewed[String(x.id)]?.seconds||x.reviewResponseSeconds||1]));
      const controller=new AbortController();
      const timeout=window.setTimeout(()=>controller.abort(),60000);
      let r:Response;
      try{
        r=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({action:"submit_review",sessionId:session.id,answers,responseSeconds})});
      }finally{window.clearTimeout(timeout);}
      const j=await r.json();
      if(!r.ok)throw new Error(j.message||"오답 제출 실패");
      await onCompleted(j);
    }catch(e){
      if(e instanceof Error&&e.name==="AbortError")onNotice("바로미터 계산/다음 학습 준비가 오래 걸려 중단했습니다. 저장된 오답 기록은 유지됩니다. 새로고침 후 다시 눌러 주세요.");
      else onNotice(e instanceof Error?e.message:"오답 제출 실패");
    }finally{setBusy(false);}
  }

  if(item){const done=Boolean(reviewed[String(item.id)]?.completed);const attempt=feedback?.attemptNo??Number(item.reviewAttemptCount??0);return <div className={`sos-training-review ${diagnosis?"diagnosis-review":"training-review"}`}>
    <section className="sos-training-focus review"><small>{diagnosis?"진단 오답 교정":"훈련 오답 교정"} · {item.order}번</small><h3>정답을 외우지 말고, 다시 생각해서 풀어보세요.</h3><p>첫 답 <b>{item.studentAnswer||"-"}</b> · 첫 풀이시간 <b>{fmt(Number(item.responseSeconds??0))}</b> · 재도전 <b>{attempt}/3</b></p></section>
    <article className="sos-diagnosis-question sos-training-question"><header><div><b>{item.order}번 오답</b><span>{done?"교정 완료":attempt===0?"정답을 보지 않고 다시 풀기":attempt<3?`힌트 ${attempt}단계 사용 중`:"정답·핵심풀이 확인 단계"}</span></div><div className="solve"><small>재풀이시간</small><strong>{fmt(elapsed)}</strong></div></header>
      {item.generated?<div className={`sos-generated-origin ${String(session?.cycle_kind)==="HOMEWORK"?"homework":"second"}`}>
        <b>{String(session?.cycle_kind)==="HOMEWORK"?"AI 유사문항 3제 굳히기":"AI 유사문항 · 2차 훈련"}</b>
        <span>{Number(item.problem?.sourceTrainingOrder)>0?`1차 훈련 ${item.problem.sourceTrainingOrder}번에서 파생 · `:""}핵심유형: {item.problem?.coreType||item.problem?.topic||"취약유형 보완"}</span>
      </div>:null}
      <div className="sos-diagnosis-image">{item.problem?.imageUrl?<SosProblemImage src={item.problem.imageUrl} alt={`${item.order}번 오답 문제`} maskOriginalNumber={!item.generated&&(diagnosis||Number(session?.round_no??1)===1)}/>:item.generated?<div className="sos-generated-image-missing"><b>AI 문항 이미지 생성 실패</b><span>새로고침 후 다시 시도해 주세요.</span></div>:<p>문항 이미지가 없습니다.</p>}</div>
      <div className="sos-answer-lock-box">
        {feedback?.hint&&!feedback.revealAnswer?<div className={`sos-review-hint level-${feedback.hintLevel}`}><small>풀이 힌트 {feedback.hintLevel}/2</small><b>{feedback.hint}</b><span>정답은 아직 공개하지 않습니다. 힌트를 이용해 다시 풀어보세요.</span></div>:null}
        {feedback?.revealAnswer?<div className="sos-review-solution"><small>3회 재도전 완료</small><h4>정답과 핵심 풀이를 확인하세요.</h4><b>정답 · {feedback.correctAnswer||item.problem?.correctAnswer||"-"}</b>{feedback.solution?<p>{feedback.solution}</p>:<p>정답에 도달하는 데 필요한 정의·공식과 조건 연결을 다시 확인하세요. 다음 유사문항에서는 같은 풀이 구조를 스스로 적용해야 합니다.</p>}</div>:null}
        {!done&&!feedback?.revealAnswer?<label><span>다시 푼 답</span><input autoFocus disabled={busy} value={answer} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setAnswer(e.target.value)} onKeyDown={(e:React.KeyboardEvent<HTMLInputElement>)=>{if(e.key==="Enter")void saveReview();}}/></label>:null}
        {feedback?.ok?<div className="sos-review-feedback correct"><b>✓ 스스로 교정 완료</b><span>{feedback.attemptNo}번째 재도전에서 정답</span></div>:null}
        <div className="sos-training-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setSelectedId(null)}>← 성적표로</button>{!done&&!feedback?.revealAnswer?<button disabled={busy||!answer.trim()} onClick={()=>void saveReview()}>{busy?"채점 중...":attempt?"힌트 적용 · 다시 채점":"다시 채점"}</button>:feedback?.revealAnswer?<button disabled={busy} onClick={()=>void completeExplanation()}>{busy?"저장 중...":"풀이 확인 완료 · 성적표로"}</button>:<button onClick={()=>setSelectedId(null)}>교정 완료 · 성적표로</button>}</div>
      </div></article></div>}

  return <div className={`sos-training-report ${diagnosis?"diagnosis-report":"training-report"}`}><section className="sos-report-head"><small>{reportTitle}</small><div className="sos-report-metrics">
      <div><h3>{correct} / {all.length}</h3><b>최초 정답</b><span>처음 풀었을 때 스스로 맞힌 문항입니다.</span></div>
      <div><h3>{correctedCount} / {wrong.length}</h3><b>교정완료</b><span>틀린 문항을 다시 풀어 스스로 정답을 찾아낸 문항입니다.</span></div>
      <div><h3>{explainedCount} / {explanationRequiredCount}</h3><b>풀이확인</b><span>3회 재도전 후 정답·핵심풀이 확인이 필요했던 문항 중 확인 완료한 문항입니다.</span></div>
    </div><strong>최초 정답률 {rate}%</strong><p>{wrong.length?<><b>X 문항을 눌러 오답 교정</b>하세요. 첫 실패에는 힌트①, 두 번째 실패에는 힌트②, 세 번째 실패 후에만 정답과 핵심풀이가 공개됩니다.</>:<>전 문항을 맞혔습니다. 결과를 확인하고 다음 단계로 이동하세요.</>}</p></section>
    <div className="sos-report-grid">{all.map((x:any)=>{const isWrong=x.isCorrect===false;const done=Boolean(reviewed[String(x.id)]?.completed||x.reviewCompleted);return <button key={x.id} type="button" disabled={!isWrong||busy} className={`sos-report-item ${isWrong?"wrong":"correct"} ${done?"reviewed":""}`} onClick={()=>{if(isWrong){setSelectedId(String(x.id));onNotice("");}}}><span className="num">{x.order}번</span><b>{isWrong?"X":"O"}</b><small>{fmt(Number(x.responseSeconds??0))}</small>{isWrong?<em>{done?x.reviewIsCorrect===true||reviewed[String(x.id)]?.isCorrect?"교정완료 ✓":"풀이확인 ✓":"오답하기"}</em>:<em>정답</em>}</button>})}</div>
    {wrong.length?<div className="sos-report-review-state"><b>오답 과정 {completedCount}/{wrong.length}</b><span>교정완료와 풀이확인을 모두 마치면 {diagnosis?"AI 취약점 분석":String(session?.cycle_kind)==="HOMEWORK"?"SOS 최종 완료":"바로미터 판정"}으로 넘어갑니다.</span><button type="button" disabled={busy||completedCount!==wrong.length} onClick={()=>void finishReview()}>{busy?diagnosis?"AI 분석 준비 중...":String(session?.cycle_kind)==="HOMEWORK"?"완료 처리 중...":"바로미터 계산 중...":diagnosis?"오답 완료 · AI 취약점 분석":String(session?.cycle_kind)==="HOMEWORK"?"오답 완료 · SOS 마무리":"오답 완료 · 결과 확인"}</button></div>:<div className="sos-report-review-state success"><b>전 문항 정답</b><span>오답 대상이 없습니다.</span><button type="button" disabled={busy} onClick={()=>void finishReview()}>{busy?"결과 처리 중...":diagnosis?"진단 결과 확정 · AI 분석":"훈련 결과 확인"}</button></div>}
  </div>;
}
