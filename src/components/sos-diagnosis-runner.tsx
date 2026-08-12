"use client";

import {useEffect,useMemo,useRef,useState} from "react";

function fmt(seconds:number){
  const s=Math.max(0,Math.floor(seconds));
  const m=Math.floor(s/60);
  return `${String(m).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}

export default function SosDiagnosisRunner({session,onCompleted,onNotice}:{session:any;onCompleted:(json:any)=>Promise<void>|void;onNotice:(message:string)=>void}){
  const items:any[]=Array.isArray(session?.items)?session.items:[];
  const initialRaw:number=items.findIndex((x:any)=>!x.hasSolutionPhoto);
  const initialIndex:number=initialRaw<0?Math.max(0,items.length-1):initialRaw;
  const [index,setIndex]=useState<number>(initialIndex);
  const [answer,setAnswer]=useState("");
  const [countdown,setCountdown]=useState(10);
  const [now,setNow]=useState(Date.now());
  const [busy,setBusy]=useState("");
  const [local,setLocal]=useState<Record<string,any>>({});
  const [warning,setWarning]=useState<{count:number;seconds:number}|null>(null);
  const exitStarted=useRef<number|null>(null);

  const item=items[index]??null;
  const itemId=String(item?.id??"");
  const state=useMemo(()=>({...item,...(local[itemId]??{})}),[item,itemId,local]);
  const revealedAt=state?.revealedAt?new Date(state.revealedAt).getTime():0;
  const lockedAt=state?.answerLockedAt?new Date(state.answerLockedAt).getTime():0;
  const photoDone=Boolean(state?.hasSolutionPhoto||state?.photoSubmittedAt);
  const solving=Boolean(revealedAt&&!lockedAt);
  const photoStage=Boolean(lockedAt&&!photoDone);
  const solveSeconds=revealedAt?Math.max(0,Math.floor(((lockedAt||now)-revealedAt)/1000)):0;
  const photoSeconds=lockedAt?Math.max(0,Math.floor(((state?.photoSubmittedAt?new Date(state.photoSubmittedAt).getTime():now)-lockedAt)/1000)):0;

  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(id);},[]);
  useEffect(()=>{
    setAnswer(String(state?.studentAnswer??""));
    setCountdown(revealedAt?0:10);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[itemId]);

  async function post(body:any){
    const response=await fetch("/api/student/sos-training",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.id,...body})});
    const json=await response.json();
    if(!response.ok)throw new Error(json.message||"처리 중 오류가 발생했습니다.");
    return json;
  }

  useEffect(()=>{
    if(!itemId||revealedAt||lockedAt)return;
    if(countdown<=0){
      let cancelled=false;
      setBusy("reveal");
      void post({action:"reveal",itemId}).then((json)=>{
        if(cancelled)return;
        setLocal((c)=>({...c,[itemId]:{...(c[itemId]??{}),revealedAt:json.revealedAt}}));
      }).catch((e)=>onNotice(e instanceof Error?e.message:"문항 공개 실패")).finally(()=>{if(!cancelled)setBusy("");});
      return()=>{cancelled=true;};
    }
    const id=window.setTimeout(()=>setCountdown((c)=>Math.max(0,c-1)),1000);
    return()=>window.clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[countdown,itemId,revealedAt,lockedAt]);

  useEffect(()=>{
    if(!solving||!itemId)return;
    const handler=()=>{
      if(document.visibilityState==="hidden"){
        exitStarted.current=Date.now();
        void post({action:"activity",itemId,eventType:"SCREEN_EXIT",detail:{question:index+1}}).catch(()=>{});
      }else if(exitStarted.current){
        const seconds=Math.max(1,Math.round((Date.now()-exitStarted.current)/1000));
        exitStarted.current=null;
        void post({action:"activity",itemId,eventType:"SCREEN_RETURN",detail:{question:index+1,awaySeconds:seconds}}).catch(()=>{});
        setWarning((w)=>({count:(w?.count??Number(state?.screenExitCount??0))+1,seconds}));
      }
    };
    document.addEventListener("visibilitychange",handler);
    return()=>document.removeEventListener("visibilitychange",handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[solving,itemId,index]);

  async function lockAnswer(){
    if(!answer.trim()){onNotice("답을 입력해 주세요.");return;}
    if(!window.confirm("이 답으로 확정할까요? 확정 후에는 답을 수정할 수 없습니다."))return;
    setBusy("answer");onNotice("");
    try{
      const json=await post({action:"lock_answer",itemId,answer:answer.trim()});
      setLocal((c)=>({...c,[itemId]:{...(c[itemId]??{}),studentAnswer:answer.trim(),answerLockedAt:json.answerLockedAt,responseSeconds:json.responseSeconds}}));
    }catch(e){onNotice(e instanceof Error?e.message:"답안 확정 실패");}finally{setBusy("");}
  }

  async function uploadPhoto(file:File|null){
    if(!file)return;
    setBusy("photo");onNotice("");
    try{
      const form=new FormData();form.set("sessionId",String(session.id));form.set("itemId",itemId);form.set("photo",file);
      const response=await fetch("/api/student/sos-training/photo",{method:"POST",body:form});
      const json=await response.json();
      if(!response.ok)throw new Error(json.message||"풀이사진 제출 실패");
      setLocal((c)=>({...c,[itemId]:{...(c[itemId]??{}),hasSolutionPhoto:true,photoSubmittedAt:json.photoSubmittedAt,photoSubmitSeconds:json.photoSeconds}}));
      if(index>=items.length-1){
        setBusy("submit");
        const done=await post({action:"submit",answers:{},responseSeconds:{}});
        await onCompleted(done);
      }else{
        setIndex((v:number)=>v+1);
        setCountdown(10);
      }
    }catch(e){onNotice(e instanceof Error?e.message:"풀이사진 제출 실패");}finally{setBusy("");}
  }

  if(!item)return <div className="student-section-empty"><b>진단 문항이 없습니다.</b></div>;

  return <div className="sos-diagnosis-runner">
    <div className="sos-diagnosis-progress">
      <b>진단 {index+1}/{items.length}</b>
      <span>{items.map((_:any,i:number)=><i key={i} className={i<index?"done":i===index?"active":""}/>)}</span>
    </div>

    {!revealedAt&&!lockedAt?<section className="sos-prep-screen">
      <small>SOS DIAGNOSIS · QUESTION {index+1}</small>
      <strong>{countdown}</strong>
      <h3>{busy==="reveal"?"문제를 공개하고 있습니다":"잠시 후 문제가 공개됩니다"}</h3>
      <p>문제를 풀 준비를 해주세요. 문제가 공개되는 순간 풀이시간 측정이 시작됩니다.</p>
    </section>:null}

    {revealedAt?<article className="sos-diagnosis-question">
      <header>
        <div><b>{index+1}번</b><span>{state.problem?.subject??""} · {state.problem?.unit??""}</span></div>
        <div className={photoStage?"photo":"solve"}><small>{photoStage?"사진 제출시간":"풀이시간"}</small><strong>{fmt(photoStage?photoSeconds:solveSeconds)}</strong></div>
      </header>
      <div className="sos-diagnosis-image">{state.problem?.imageUrl?<img src={state.problem.imageUrl} alt={`${index+1}번 문제`}/>:<p>문항 이미지가 없습니다.</p>}</div>

      {solving?<div className="sos-answer-lock-box">
        <label><span>정답</span><input autoFocus value={answer} onChange={(e)=>setAnswer(e.target.value)} placeholder="정답을 입력하세요" onKeyDown={(e)=>{if(e.key==="Enter")void lockAnswer();}}/></label>
        <p>답을 확정하는 순간까지가 이 문항의 <b>풀이시간</b>으로 기록됩니다.</p>
        <button disabled={busy==="answer"} onClick={()=>void lockAnswer()}>{busy==="answer"?"확정 중...":"답안 확정"}</button>
      </div>:null}

      {photoStage?<div className="sos-photo-stage">
        <div className="sos-photo-clock"><small>답안 확정 완료</small><strong>{fmt(photoSeconds)}</strong><span>사진 제출까지 현재 소요시간</span></div>
        <h3>풀이 사진을 제출해 주세요.</h3>
        <p>종이에 작성한 실제 풀이가 잘 보이도록 촬영해 주세요. 답안 확정 후 사진 제출까지의 시간도 별도로 기록됩니다.</p>
        <label className="sos-photo-button"><input type="file" accept="image/*" capture="environment" disabled={busy==="photo"} onChange={(e)=>void uploadPhoto(e.target.files?.[0]??null)}/>{busy==="photo"?"사진 업로드 중...":"카메라 촬영 / 사진 선택"}</label>
      </div>:null}
    </article>:null}

    {warning?<div className="sos-exit-warning" role="dialog" aria-modal="true">
      <section><div>⚠</div><h2>시험 화면 이탈이 감지되었습니다</h2><p>응시 중 시험 화면을 벗어난 기록이 저장되었습니다.</p><strong>이번 이탈 {warning.seconds}초 · 누적 {warning.count}회</strong><p>반복적인 화면 이탈은 진단 신뢰도 저하 또는 재진단 사유가 될 수 있습니다.</p><button onClick={()=>setWarning(null)}>확인하고 계속 응시</button></section>
    </div>:null}
  </div>;
}
