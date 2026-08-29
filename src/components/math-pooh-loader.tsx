"use client";

import type { ReactNode } from "react";
import {useEffect,useMemo,useRef,useState} from "react";

type MATHPOOHLoaderProps = {
  title: string;
  detail?: ReactNode;
  current?: number;
  total?: number;
  compact?: boolean;
  kind?: "analysis" | "crop" | "grading" | "exam" | "save" | "report" | "loading";
  audience?: "student" | "admin";
  currentLabel?: string;
  estimatedSeconds?: number;
  canClose?: boolean;
};

const kindLabel: Record<NonNullable<MATHPOOHLoaderProps["kind"]>, string> = {
  analysis: "AI 분석", crop: "문항 자르기", grading: "채점·결과 처리",
  exam: "시험 준비", save: "데이터 저장", report: "리포트 생성", loading: "데이터 불러오기",
};

function clock(seconds:number){const s=Math.max(0,Math.floor(seconds));return s<60?`${s}초`:`${Math.floor(s/60)}분 ${String(s%60).padStart(2,"0")}초`;}
function loaderTitle(value:string){return value.trim().replace(/[.!…]+$/g,"").replace(/하고 있습니다$/,"중").replace(/중입니다$/,"중");}

const defaultSeconds:Record<NonNullable<MATHPOOHLoaderProps["kind"]>,number>={analysis:90,crop:45,grading:20,exam:35,save:12,report:25,loading:15};

export default function MATHPOOHLoader({title,detail,current,total,compact=false,kind="loading",audience="student",currentLabel,estimatedSeconds,canClose=false}:MATHPOOHLoaderProps){
  const mountedAt=useRef(Date.now());
  const [now,setNow]=useState(Date.now());
  const [learnedEstimate,setLearnedEstimate]=useState(defaultSeconds[kind]);
  const historyKey=`mathpooh-loader:${kind}:${loaderTitle(title)}`;
  useEffect(()=>{
    try{const saved=Number(window.localStorage.getItem(historyKey));if(Number.isFinite(saved)&&saved>2)setLearnedEstimate(saved);}catch{/* 저장소 사용 불가 시 기본 예상시간 사용 */}
    const id=window.setInterval(()=>setNow(Date.now()),1000);
    const started=mountedAt.current;
    return()=>{
      window.clearInterval(id);
      const actual=Math.max(1,(Date.now()-started)/1000);
      try{
        const old=Number(window.localStorage.getItem(historyKey));
        const next=Number.isFinite(old)&&old>0?Math.round(old*.7+actual*.3):Math.round(actual);
        window.localStorage.setItem(historyKey,String(Math.max(3,next)));
      }catch{/* 진행률 학습 실패는 원래 작업에 영향을 주지 않음 */}
    };
  },[historyKey]);
  const elapsed=Math.max(0,(now-mountedAt.current)/1000);
  const hasProgress=Number.isFinite(current)&&Number.isFinite(total)&&Number(total)>0;
  const safeCurrent=hasProgress?Math.max(0,Math.min(Number(current),Number(total))):0;
  const estimate=Math.max(3,Number(estimatedSeconds)||learnedEstimate);
  const estimatedPercent=Math.min(94,Math.round((elapsed/estimate)*90));
  const percent=hasProgress?Math.round((safeCurrent/Number(total))*100):estimatedPercent;
  const eta=useMemo(()=>hasProgress&&safeCurrent>0&&safeCurrent<Number(total)?elapsed/safeCurrent*(Number(total)-safeCurrent):Math.max(0,estimate-elapsed),[elapsed,estimate,hasProgress,safeCurrent,total]);
  const finished=hasProgress&&safeCurrent>=Number(total);
  const phase=currentLabel??(finished?"완료 결과 확인":percent<10?"요청 확인":percent<85?"데이터 처리": "마무리 확인");
  return <div className={`mathpooh-loader ${compact?"is-compact":""}`} role="status" aria-live="polite" aria-busy="true">
    <div className="mathpooh-loader-card">
      <div className={`mathpooh-runway is-${audience}`} aria-hidden="true"><span className="mathpooh-runner"><img src={audience==="admin"?"/characters/mathpooh-director.png":"/characters/mathpooh-student.png"} alt=""/></span><i className="mathpooh-shadow"/></div>
      <small className="mathpooh-kicker">MATHPOOH AI · {kindLabel[kind]}</small><h2>{loaderTitle(title)}</h2>{detail?<p>{detail}</p>:null}
      <strong className="mathpooh-current-label">현재 단계 · {phase}</strong>
      <div className="mathpooh-progress-copy"><b>{hasProgress?`${safeCurrent} / ${total}`:"예상 진행률"}</b><span>{percent}%</span></div>
      <div className="mathpooh-progress-track" aria-label={`${hasProgress?"실제":"예상"} 진행률 ${percent}%`}><i style={{width:`${percent}%`}}/></div>
      <div className="mathpooh-time-copy"><span>경과 시간 · {clock(elapsed)}</span><span>{finished?"완료 결과 확인 중":eta>1?`예상 남은 시간 · 약 ${clock(eta)}`:"마무리 확인 중"}</span></div>
      <strong className="mathpooh-wait">{canClose?"다른 화면으로 이동해도 작업은 계속 진행됩니다.":"작업이 끝날 때까지 이 창을 닫거나 새로고침하지 마세요."}</strong>
    </div>
  </div>;
}
