"use client";
import {useEffect,useState,type ReactNode} from "react";
export default function SosQuestionAvailability({sessionId,children}:{sessionId:string;children:ReactNode}){
 const [state,setState]=useState<{id:string;allowed:boolean;message:string}>({id:"",allowed:false,message:"문항 사용 상태를 확인하고 있습니다."});
 const [mountedId,setMountedId]=useState("");
 useEffect(()=>{
  let cancelled=false,running=false,wasQuarantined=false;
  async function check(){if(running)return;running=true;try{
   const r=await fetch(`/api/student/sos-training?mode=availability&sessionId=${encodeURIComponent(sessionId)}`,{cache:"no-store",signal:AbortSignal.timeout(10000)});const d=await r.json();
   if(!r.ok||typeof d.blocked!=="boolean")throw Error(d.message||"문항 상태를 확인하지 못했습니다.");
   if(cancelled)return;
   if(wasQuarantined&&!d.blocked){window.location.reload();return;}
   if(d.blocked)wasQuarantined=true;
   if(!d.blocked)setMountedId(sessionId);
   setState({id:sessionId,allowed:!d.blocked,message:d.blocked?"오류 문항 검수 중으로 학습 사용이 중지되었습니다.":""});
  }catch{if(!cancelled)setState({id:sessionId,allowed:false,message:"문항 사용 상태를 확인하지 못했습니다. 잠시 후 자동으로 다시 확인합니다."});}finally{running=false;}}
  void check();const timer=setInterval(()=>void check(),15000);return()=>{cancelled=true;clearInterval(timer);};
 },[sessionId]);
 const allowed=state.id===sessionId&&state.allowed;
 // 확인 실패 시 사용은 차단하되 이미 열린 runner를 unmount하지 않는다.
 // 재시도 성공 후 같은 컴포넌트의 답안·문항 위치를 그대로 복원한다.
 return <>
  {!allowed?<section role="status" style={{padding:28,border:"1px solid #edd5bb",borderRadius:12,background:"#fff8ed",color:"#644728"}}>{state.id===sessionId?state.message:"문항 사용 상태를 확인하고 있습니다."}</section>:null}
  <div hidden={!allowed} inert={!allowed}>{mountedId===sessionId?children:null}</div>
 </>;
}
