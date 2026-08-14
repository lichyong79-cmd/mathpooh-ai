"use client";

import {useEffect,useRef,useState} from "react";
import MATHPOOHLoader from "./math-pooh-loader";

type WaitInfo={title:string;detail:string;kind:"analysis"|"crop"|"grading"|"exam"|"save"|"report"|"loading"};

function readAction(init?:RequestInit){
  try{
    if(typeof init?.body!=="string")return "";
    const parsed=JSON.parse(init.body);
    return String(parsed?.action??"");
  }catch{return "";}
}

function describe(url:string,method:string,action:string):WaitInfo{
  const u=url.toLowerCase();
  const a=action.toLowerCase();
  if(u.includes("recommend")||a.includes("recommend"))return {title:"AI가 추천문항을 생성하고 있습니다",detail:"학생의 취약지점과 문제 DNA를 비교해 가장 알맞은 문항을 고르고 있습니다.",kind:"analysis"};
  if(u.includes("reanaly")||u.includes("analysis")||a.includes("analy"))return {title:"AI 분석을 진행하고 있습니다",detail:"문항과 학습 데이터를 분석하고 있습니다. 결과가 준비되면 자동으로 다음 화면으로 이동합니다.",kind:"analysis"};
  if(u.includes("sos-training")){
    if(a==="recover_diagnosis")return {title:"진단 결과를 분석하고 있습니다",detail:"취약점을 확인하고 1차 맞춤훈련 문항을 준비하고 있습니다.",kind:"analysis"};
    if(a==="start")return {title:"시험지를 준비하고 있습니다",detail:"현재 단계의 문항과 학습 기록을 안전하게 불러오고 있습니다.",kind:"exam"};
    if(a==="submit")return {title:"제출 결과를 분석하고 있습니다",detail:"정오답·풀이시간을 저장하고 성적표와 다음 학습 단계를 준비하고 있습니다.",kind:"grading"};
    if(a.includes("review"))return {title:"오답 교정을 처리하고 있습니다",detail:"재풀이 결과와 힌트 사용 기록을 저장하고 있습니다.",kind:"grading"};
    if(a==="lock_answer")return {title:"답안을 저장하고 있습니다",detail:"풀이시간과 답안을 안전하게 기록하고 있습니다.",kind:"save"};
  }
  if(u.includes("training-engine")||a.includes("training"))return {title:"맞춤 훈련문항을 생성하고 있습니다",detail:"취약점을 집중 공략할 문항을 구성하고 있습니다.",kind:"analysis"};
  if(u.includes("photo"))return {title:"풀이사진을 저장하고 있습니다",detail:"사진과 풀이시간 기록을 안전하게 저장하고 있습니다.",kind:"save"};
  if(u.includes("materialize")||u.includes("pdf")||a.includes("exam"))return {title:"시험지를 생성하고 있습니다",detail:"문항 이미지와 시험지 데이터를 준비하고 있습니다.",kind:"exam"};
  if(u.includes("regrade")||u.includes("difficulty")||u.includes("barometer")||a.includes("meter"))return {title:"바로미터를 계산하고 있습니다",detail:"정오답·난이도·풀이시간·교정 결과를 반영하고 있습니다.",kind:"grading"};
  if(u.includes("register")||u.includes("upload"))return {title:"자료를 등록하고 있습니다",detail:"파일과 문항 정보를 저장하고 있습니다.",kind:"save"};
  return {title:method==="DELETE"?"삭제 내용을 반영하고 있습니다":"처리 중입니다",detail:"요청한 작업을 처리하고 있습니다. 잠시만 기다려 주세요.",kind:"loading"};
}

function shouldTrack(input:RequestInfo|URL,init?:RequestInit){
  const url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
  const method=String(init?.method??(typeof Request!=="undefined"&&input instanceof Request?input.method:"GET")).toUpperCase();
  if(!url.includes("/api/")||method==="GET"||method==="HEAD")return false;
  const action=readAction(init);
  if(["activity","reveal"].includes(action))return false;
  return true;
}

export default function GlobalWaitOverlay(){
  const [info,setInfo]=useState<WaitInfo|null>(null);
  const count=useRef(0);
  const timer=useRef<number|null>(null);
  const latest=useRef<WaitInfo|null>(null);

  useEffect(()=>{
    const original=window.fetch.bind(window);
    const patched:typeof window.fetch=async(input:any,init?:RequestInit)=>{
      if(!shouldTrack(input,init))return original(input,init);
      const url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
      const method=String(init?.method??(input instanceof Request?input.method:"GET")).toUpperCase();
      const next=describe(url,method,readAction(init));
      count.current+=1; latest.current=next;
      if(count.current===1){
        timer.current=window.setTimeout(()=>setInfo(latest.current),220);
      }else if(info){setInfo(next);}
      try{return await original(input,init);}finally{
        count.current=Math.max(0,count.current-1);
        if(count.current===0){
          if(timer.current!==null){window.clearTimeout(timer.current);timer.current=null;}
          setInfo(null); latest.current=null;
        }
      }
    };
    window.fetch=patched;
    return()=>{window.fetch=original;if(timer.current!==null)window.clearTimeout(timer.current);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  return info?<MATHPOOHLoader title={info.title} detail={info.detail} kind={info.kind}/>:null;
}
