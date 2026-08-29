"use client";

import {useEffect,useRef,useState} from "react";
import MATHPOOHLoader from "./math-pooh-loader";

type WaitInfo={title:string;detail:string;kind:"analysis"|"crop"|"grading"|"exam"|"save"|"report"|"loading"};
type ActiveWait=WaitInfo&{estimatedSeconds:number};

const kindEstimate:Record<WaitInfo["kind"],number>={analysis:90,crop:45,grading:20,exam:35,save:12,report:25,loading:15};
function learnedSeconds(key:string){try{return Number(window.localStorage.getItem(`mathpooh-wait:${key}`));}catch{return 0;}}
function saveLearnedSeconds(key:string,value:number){try{window.localStorage.setItem(`mathpooh-wait:${key}`,String(value));}catch{/* 저장이 막혀도 작업 요청은 계속한다. */}}

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
  if(u.includes("recommend")||a.includes("recommend"))return {title:"AI 추천문항 생성 중",detail:"학생의 취약지점과 문제 DNA를 비교해 가장 알맞은 문항을 고르고 있습니다.",kind:"analysis"};
  if(u.includes("reanaly")||u.includes("analysis")||a.includes("analy"))return {title:"AI 분석 진행 중",detail:"문항과 학습 데이터를 분석하고 있습니다. 완료되면 결과 화면으로 자동 이동합니다.",kind:"analysis"};
  if(u.includes("sos-training")){
    if(a==="recover_diagnosis")return {title:"진단 결과 분석 중",detail:"취약점을 확인하고 1차 맞춤훈련 문항을 준비하고 있습니다.",kind:"analysis"};
    if(a==="start")return {title:"시험지 준비 중",detail:"현재 단계의 문항과 학습 기록을 안전하게 불러오고 있습니다.",kind:"exam"};
    if(a==="submit")return {title:"제출 결과 처리 중",detail:"정오답·풀이시간을 저장하고 성적표와 다음 학습 단계를 준비하고 있습니다.",kind:"grading"};
    if(a.includes("review"))return {title:"오답 교정 처리 중",detail:"재풀이 결과와 힌트 사용 기록을 저장하고 있습니다.",kind:"grading"};
    if(a==="lock_answer")return {title:"답안 저장 중",detail:"풀이시간과 답안을 안전하게 기록하고 있습니다.",kind:"save"};
  }
  if(u.includes("training-engine")||a.includes("training"))return {title:"맞춤 훈련문항 생성 중",detail:"취약점을 집중 공략할 문항을 구성하고 있습니다.",kind:"analysis"};
  if(u.includes("photo"))return {title:"풀이사진 저장 중",detail:"사진과 풀이시간 기록을 안전하게 저장하고 있습니다.",kind:"save"};
  if(u.includes("materialize")||u.includes("pdf")||a.includes("exam"))return {title:"시험지 생성 중",detail:"문항 이미지와 시험지 데이터를 준비하고 있습니다.",kind:"exam"};
  if(u.includes("regrade")||u.includes("difficulty")||u.includes("barometer")||a.includes("meter"))return {title:"바로미터 계산 중",detail:"정오답·난이도·풀이시간·교정 결과를 반영하고 있습니다.",kind:"grading"};
  if(u.includes("register")||u.includes("upload"))return {title:"자료 등록 중",detail:"파일과 문항 정보를 저장하고 있습니다.",kind:"save"};
  return {title:method==="DELETE"?"삭제 내용 반영 중":"요청 작업 처리 중",detail:"요청한 작업을 안전하게 처리하고 있습니다.",kind:"loading"};
}

function shouldTrack(input:RequestInfo|URL,init?:RequestInit){
  const url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
  const method=String(init?.method??(typeof Request!=="undefined"&&input instanceof Request?input.method:"GET")).toUpperCase();
  if(!url.includes("/api/")||method==="GET"||method==="HEAD")return false;
  const action=readAction(init).toLowerCase();
  const u=url.toLowerCase();
  // 큰 로더는 실제로 기다릴 만한 작업만 추적한다. 문항 저장/로그/힌트는 로컬 버튼 상태로 처리.
  if(u.includes("/api/admin/sos-progress/reset"))return true;
  if(u.includes("/api/student/sos-training"))return ["recover_diagnosis","start","submit","submit_review"].includes(action);
  if(u.includes("training-engine"))return true;
  if(u.includes("analysis")||u.includes("reanaly")||u.includes("recommend"))return true;
  if(u.includes("regrade")||u.includes("barometer"))return true;
  if(u.includes("pdf")||u.includes("materialize"))return true;
  return false;
}

export default function GlobalWaitOverlay(){
  const [info,setInfo]=useState<ActiveWait|null>(null);
  const count=useRef(0);
  const timer=useRef<number|null>(null);
  const latest=useRef<ActiveWait|null>(null);
  const activeKey=useRef("");
  const activeStartedAt=useRef(0);

  useEffect(()=>{
    const original=window.fetch.bind(window);
    const patched:typeof window.fetch=async(input:any,init?:RequestInit)=>{
      if(!shouldTrack(input,init))return original(input,init);
      const url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
      const method=String(init?.method??(input instanceof Request?input.method:"GET")).toUpperCase();
      const action=readAction(init);
      const described=describe(url,method,action);
      const path=new URL(url,window.location.origin).pathname;
      const key=`${method}:${path}:${action}`;
      const learned=learnedSeconds(key);
      const next:ActiveWait={...described,estimatedSeconds:Number.isFinite(learned)&&learned>2?learned:kindEstimate[described.kind]};
      count.current+=1; latest.current=next;
      if(count.current===1){
        activeKey.current=key;
        activeStartedAt.current=Date.now();
        timer.current=window.setTimeout(()=>{
          // 화면이 실제 current/total을 가진 자체 로더를 이미 표시하면
          // 전역 추정 로더가 그 위를 덮지 않는다.
          if(!document.querySelector(".mathpooh-loader"))setInfo(latest.current);
        },220);
      }else{setInfo(current=>current?next:current);}
      try{return await original(input,init);}finally{
        count.current=Math.max(0,count.current-1);
        if(count.current===0){
          const actual=Math.max(1,(Date.now()-activeStartedAt.current)/1000);
          const old=learnedSeconds(activeKey.current);
          const learned=Number.isFinite(old)&&old>0?Math.round(old*.7+actual*.3):Math.round(actual);
          saveLearnedSeconds(activeKey.current,Math.max(3,learned));
          if(timer.current!==null){window.clearTimeout(timer.current);timer.current=null;}
          setInfo(null); latest.current=null;
        }
      }
    };
    window.fetch=patched;
    return()=>{window.fetch=original;if(timer.current!==null)window.clearTimeout(timer.current);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  return info?<MATHPOOHLoader title={info.title} detail={info.detail} kind={info.kind} estimatedSeconds={info.estimatedSeconds}/>:null;
}
