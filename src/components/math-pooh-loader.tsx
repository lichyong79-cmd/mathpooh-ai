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
};

const kindLabel: Record<NonNullable<MATHPOOHLoaderProps["kind"]>, string> = {
  analysis: "AI ANALYSIS", crop: "QUESTION CROPPING", grading: "SCORE PROCESSING",
  exam: "EXAM PREPARATION", save: "SAVING RESULTS", report: "REPORT GENERATION", loading: "LOADING DATA",
};

function clock(seconds:number){const s=Math.max(0,Math.floor(seconds));return s<60?`${s}초`:`${Math.floor(s/60)}분 ${String(s%60).padStart(2,"0")}초`;}

export default function MATHPOOHLoader({title,detail,current,total,compact=false,kind="loading",audience="student",currentLabel}:MATHPOOHLoaderProps){
  const mountedAt=useRef(Date.now());
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(id);},[]);
  const elapsed=Math.max(0,(now-mountedAt.current)/1000);
  const hasProgress=Number.isFinite(current)&&Number.isFinite(total)&&Number(total)>0;
  const safeCurrent=hasProgress?Math.max(0,Math.min(Number(current),Number(total))):0;
  const percent=hasProgress?Math.round((safeCurrent/Number(total))*100):0;
  const eta=useMemo(()=>hasProgress&&safeCurrent>0&&safeCurrent<Number(total)?elapsed/safeCurrent*(Number(total)-safeCurrent):0,[elapsed,hasProgress,safeCurrent,total]);
  return <div className={`mathpooh-loader ${compact?"is-compact":""}`} role="status" aria-live="polite" aria-busy="true">
    <div className="mathpooh-loader-card">
      <div className={`mathpooh-runway is-${audience}`} aria-hidden="true"><span className="mathpooh-runner"><img src={audience==="admin"?"/characters/mathpooh-director.png":"/characters/mathpooh-student.png"} alt=""/></span><i className="mathpooh-shadow"/></div>
      <small className="mathpooh-kicker">MATHPOOH AI · {kindLabel[kind]}</small><h2>{title}</h2>{detail?<p>{detail}</p>:null}
      {currentLabel?<strong className="mathpooh-current-label">현재 · {currentLabel}</strong>:null}
      {hasProgress?<><div className="mathpooh-progress-copy"><b>{safeCurrent} / {total}</b><span>{percent}% COMPLETE</span></div><div className="mathpooh-progress-track" aria-label={`${percent}% complete`}><i style={{width:`${percent}%`}}/></div></>:<div className="mathpooh-dots" aria-hidden="true"><i/><i/><i/></div>}
      <div className="mathpooh-time-copy"><span>경과 {clock(elapsed)}</span><span>{eta>1?`예상 남은시간 ${clock(eta)}`:hasProgress&&safeCurrent>=Number(total)?"처리 완료 중":"전체량 확인/처리 중"}</span></div>
      <strong className="mathpooh-wait">PLEASE WAIT. DO NOT CLOSE THIS WINDOW.</strong>
    </div>
  </div>;
}
