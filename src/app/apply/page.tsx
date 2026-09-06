"use client";
import {useEffect} from "react";
export default function ProgramApplyPage(){
 useEffect(()=>{location.replace("/parent-login?next=/p");},[]);
 return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:'Arial,"Noto Sans KR",sans-serif',background:"#f2f6f3",color:"#285c31",fontWeight:800}}>학부모 로그인으로 이동합니다…</main>;
}
