"use client";
import { useEffect, useState } from "react";

type Schedule = { id: string; name: string; start_date: string; end_date: string; scheduled_at?: string; exams?: unknown[] };
const localTime = (c: Schedule) => c.scheduled_at ? new Date(new Date(c.scheduled_at).getTime()+9*3600000).toISOString().slice(11,16) : "23:00";
export default function ScheduleManagement() {
  const [cycles,setCycles]=useState<Schedule[]>([]),[selected,setSelected]=useState("");
  const [form,setForm]=useState({name:"",startDate:"",endDate:"",time:"23:00"});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const load=async()=>{const r=await fetch("/api/admin/learning-cycles",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.message);setCycles(j.cycles??[]);};
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);
  const choose=(c?:Schedule)=>{setSelected(c?.id??"");setForm(c?{name:c.name,startDate:c.start_date.slice(0,10),endDate:c.end_date.slice(0,10),time:localTime(c)}:{name:"",startDate:"",endDate:"",time:"23:00"});setMessage("");};
  const save=async()=>{
    if(!form.name.trim()||!form.startDate||!form.endDate||!form.time||form.endDate<form.startDate){setMessage("일정명과 올바른 운영 기간·시작시간을 입력해 주세요.");return;}
    const old=cycles.find(c=>c.id===selected);
    const timeChanged=!old||old.start_date.slice(0,10)!==form.startDate||localTime(old)!==form.time;
    if(old&&timeChanged&&!confirm("등록 학생들의 예정시각도 변경됩니다. 일정을 수정할까요?"))return;
    setBusy(true);try{const r=await fetch("/api/admin/learning-cycles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:selected?"update":"create",id:selected,name:form.name.trim(),startDate:form.startDate,endDate:form.endDate,...(timeChanged?{scheduledAt:`${form.startDate}T${form.time}:00+09:00`}:{})})});const j=await r.json();if(!r.ok)throw Error(j.message);await load();setSelected(j.cycle.id);setMessage("응시 일정을 저장했습니다.");}catch(e){setMessage(e instanceof Error?e.message:"저장 실패");}finally{setBusy(false);}
  };
  return <div className="schedule-page">
    <header><div><h2>응시 일정 관리</h2><p>매주 참가할 날짜와 시험 시작시간을 관리합니다.</p></div><button onClick={()=>choose()}>＋ 새 일정</button></header>
    <div className="notice"><b>정규 줌 모의고사 · 수요일 밤 11시</b><span>시험지는 A/B/C 시험지 등록에서 준비하고, 회차별 시험배정에서 학생에게 배정해 주세요.</span></div>
    <div className="layout"><section className="schedule-list"><h3>운영 일정 <small>{cycles.length}개</small></h3>{cycles.map(c=><button className={selected===c.id?"chosen":""} key={c.id} onClick={()=>choose(c)}><b>{c.name}</b><span>{c.start_date.slice(0,10)} ~ {c.end_date.slice(0,10)}</span><strong>{localTime(c)} 시작</strong></button>)}{!cycles.length&&<p>등록된 일정이 없습니다.</p>}</section>
    <section className="editor"><small>{selected?"일정 수정":"새 운영 일정"}</small><h3>{selected?"응시 일정 상세":"다음 모의고사 일정을 만드세요"}</h3>
      <label>일정명<input value={form.name} placeholder="예: SOS_제6회모의고사" onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <div className="fields"><label>참가일<input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></label><label>시험 시작시간 (한국시간)<input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/></label><label>SOS 운영 종료일<input type="date" min={form.startDate} value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})}/></label></div>
      <p className="help">참가일은 모의고사를 보는 날, 운영 종료일은 해당 주차의 SOS 학습 기간 마지막 날입니다.</p>
      <button className="save" disabled={busy} onClick={()=>void save()}>{busy?"저장 중…":selected?"변경사항 저장":"일정 만들기"}</button><p role="status">{message}</p>
      <nav><a href="/admin?menu=applications">회차별 시험배정 →</a><a href="/admin?menu=exam-assignment">A/B/C 시험지 등록 →</a></nav>
    </section></div>
    <style jsx>{`.schedule-page{color:#20382b}header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:24px}h2{font-size:28px;margin:0 0 8px}p{color:#6c7770;line-height:1.7}button,a,input{font:inherit}button{cursor:pointer;border:1px solid #dce4df;border-radius:10px;background:white;padding:12px 18px}button:disabled{opacity:.6}.notice{display:grid;gap:9px;background:#edf5f0;padding:22px;border-radius:14px;margin-bottom:24px}.notice span{font-size:14px;color:#607369}.layout{display:grid;grid-template-columns:300px 1fr;gap:24px}.schedule-list,.editor{background:white;border:1px solid #e0e7e2;border-radius:18px;padding:24px}h3{margin:0 0 24px}small{color:#517260}.schedule-list button{display:grid;gap:9px;text-align:left;width:100%;margin-bottom:10px}.schedule-list span{font-size:12px;color:#758179}.schedule-list strong{font-size:13px;color:#28563d}.schedule-list .chosen{border:2px solid #28563d;background:#f2f8f4}.editor h3{font-size:23px;margin-top:10px}.editor label{display:grid;gap:10px;font-size:14px;font-weight:600;margin:20px 0}input{width:100%;min-width:0;box-sizing:border-box;border:1px solid #d4dfd7;border-radius:9px;padding:13px;color:#263d30;background:white}.fields{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.help{font-size:13px}.save{background:#245438;color:white;border:0;min-width:170px;margin-top:14px}nav{display:flex;gap:24px;border-top:1px solid #e5ebe7;padding-top:22px;margin-top:28px;flex-wrap:wrap}a{color:#245438;font-weight:600;text-decoration:none}@media(max-width:1000px){.layout{grid-template-columns:1fr}.fields{grid-template-columns:1fr}.schedule-list{max-height:350px;overflow:auto}}`}</style>
  </div>;
}
