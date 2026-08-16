export type SosSessionLike={
  phase?:unknown; status?:unknown; decision?:unknown; round_no?:unknown; roundNo?:unknown; cycle_kind?:unknown; cycleKind?:unknown;
};

export function sosStatusText(status:unknown){
  const s=String(status??"");
  if(s==="ASSIGNED")return "미응시";
  if(s==="IN_PROGRESS")return "진행중";
  if(s==="RETRAIN")return "오답중";
  if(s==="PASSED")return "완료";
  if(s==="COMPLETED")return "완료";
  return s||"-";
}

export function sosPhaseText(session:SosSessionLike){
  const phase=String(session.phase??"");
  const round=Number(session.round_no??session.roundNo??1);
  const kind=String(session.cycle_kind??session.cycleKind??"STANDARD");
  if(phase==="DIAGNOSIS")return `진단 ${round}차`;
  if(kind==="HOMEWORK")return "유사문항 숙제";
  if(round===2)return "2차 AI 유사훈련";
  return "1차 훈련";
}

export function isSosReview(session:SosSessionLike){return String(session.status??"")==="RETRAIN";}
export function isSosStarted(session:SosSessionLike){return ["IN_PROGRESS","RETRAIN","COMPLETED","PASSED"].includes(String(session.status??""));}
export function isSosOpen(session:SosSessionLike){return ["ASSIGNED","IN_PROGRESS","RETRAIN"].includes(String(session.status??""));}
export function isSosDone(session:SosSessionLike){return ["COMPLETED","PASSED"].includes(String(session.status??""));}
export function sosNeedsReview(session:SosSessionLike){
  const d=String(session.decision??"");
  return isSosReview(session)&&!d.endsWith("RESULT_REVIEW_READY");
}
