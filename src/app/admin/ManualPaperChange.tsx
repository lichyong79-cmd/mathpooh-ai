"use client";
import { useRef, useState } from "react";

type Props = { row: any; catalog: any[]; exams: any[]; busy: boolean; onSaved: () => Promise<void> };
const scopeLabel = (s: string) => s === "ALGEBRA" ? "A · 대수" : s === "ALGEBRA_CALC1" ? "B · 대수+미적Ⅰ" : "C · 대수+미적Ⅰ+확통";
export default function ManualPaperChange({row,catalog,exams,busy,onSaved}: Props) {
  const [open,setOpen]=useState(false),[choice,setChoice]=useState(""),[reason,setReason]=useState("");
  const [saving,setSaving]=useState(false),[message,setMessage]=useState("");
  const inFlight=useRef(false);
  const student=Array.isArray(row.students)?row.students[0]:row.students;
  const currentId=String(row.registration?.exam_id??"");
  const locked=row.past || Boolean(row.attempt_status) || !row.registration || row.registration.status!=="assigned" || ["CANCELLED","NO_SHOW","COMPLETED"].includes(row.booking_status);
  const running=row.booking_status==="IN_PROGRESS";
  const options=catalog.map(c=>({...c,exam:exams.find(e=>e.id===c.exam_id)}))
    .filter(c=>c.exam?.test_file_path && Number(c.exam.question_count)>0 && (!running || c.scope_code===row.scope_code))
    .sort((a,b)=>String(a.scope_code).localeCompare(String(b.scope_code)) || Number(a.formal_sequence)-Number(b.formal_sequence));
  async function save() {
    if(inFlight.current || !choice || choice===currentId)return;
    const target=options.find(c=>c.exam_id===choice);if(!target)return;
    if(!window.confirm(`${student?.name??"학생"} 학생의 시험지를 변경할까요?\n${row.exam?.exam_code??row.exam?.title??"현재 시험지"} → ${target.exam.exam_code??target.exam.title}\n\n같은 유형 안에서는 개인 응시 순번을 유지합니다.\n현재 타이머·종료시각과 다른 학생의 배정은 변경하지 않습니다.\n학생에게 새 시험지를 다시 내려받도록 안내해 주세요.`))return;
    inFlight.current=true;setSaving(true);setMessage("");
    try {
      const r=await fetch("/api/admin/exam-paper-override",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({membershipId:row.id,examId:choice,expectedExamId:currentId,reason:reason.trim()||"관리자 직접 지정"})});
      const j=await r.json();if(!r.ok || !j.success)throw new Error(j.message||"시험지 변경 실패");
      setOpen(false);setChoice("");setReason("");
      setMessage(`${j.examCode??target.exam.title} 변경 완료 · 타이머 유지`);
      await onSaved();
    } catch(e){setMessage(e instanceof Error?e.message:"시험지 변경 실패");}
    finally {inFlight.current=false;setSaving(false);}
  }
  return <div className="paper-change">
    <button type="button" disabled={locked||busy||saving} onClick={()=>{setChoice(currentId);setOpen(!open);setMessage("");}} title={row.attempt_status?"응시·제출 기록 보호를 위해 변경할 수 없습니다.":!row.registration?"기본 배정 후 시험지를 변경할 수 있습니다.":"기본 추천 대신 원하는 시험지로 직접 변경"}>{saving?"변경 중…":"시험지 직접 변경"}</button>
    {open&&!locked?<div className="editor">
      <label>변경할 시험지<select aria-label={`${student?.name??"학생"} 변경할 시험지`} value={choice} disabled={saving||busy} onChange={e=>setChoice(e.target.value)}><option value="">시험지 선택</option>{options.map(c=><option key={c.exam_id} value={c.exam_id}>{c.exam.exam_code??c.exam.title} · {scopeLabel(c.scope_code)}</option>)}</select></label>
      <label>변경 사유<input maxLength={200} value={reason} disabled={saving} placeholder="예: 시험 범위 확인 후 교체" onChange={e=>setReason(e.target.value)}/></label>
      <small>{running?"공통 타이머 진행 중 · 같은 유형의 미응시 시험지로 변경합니다.":"등록된 다른 A/B/C 시험지를 선택할 수 있습니다."}<br/>타이머는 초기화하거나 따로 시작하지 않습니다.</small>
      <div className="actions"><button type="button" disabled={saving||busy||!choice||choice===currentId} onClick={()=>void save()}>선택 시험지로 변경</button><button type="button" disabled={saving} onClick={()=>setOpen(false)}>취소</button></div>
    </div>:null}
    {message?<p role="status">{message}</p>:null}
    <style jsx>{`.paper-change{margin-top:9px;min-width:160px}.paper-change button{font:inherit;border:1px solid #a9c5b0;border-radius:8px;padding:9px 12px;color:#245735;background:#f3faf5;font-weight:800;cursor:pointer}.paper-change button:disabled{opacity:.45;cursor:not-allowed}.editor{display:grid;gap:11px;margin-top:10px;padding:13px;background:#fff;border:1px solid #c9dbcf;border-radius:10px;min-width:270px;max-width:400px}.editor label{display:grid;gap:6px;font-weight:700}.editor select,.editor input{box-sizing:border-box;width:100%;min-width:0;padding:9px;border:1px solid #d4dfd8;border-radius:7px;background:#fff;font:inherit;color:#20382b}.editor small{line-height:1.6;color:#607369}.actions{display:flex;gap:8px;flex-wrap:wrap}.actions button:first-child{background:#245735;color:white}.paper-change p{font-size:12px;line-height:1.6;white-space:normal;max-width:350px}`}</style>
  </div>;
}
