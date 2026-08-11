export type WorkflowQuestionLike={
  status?:unknown;
  review_result?:unknown;
  bank_registered?:boolean;
};
export type WorkflowBucket="registered"|"pending"|"review"|"failed"|"other";

export function sourceWorkflowBucket(q:WorkflowQuestionLike):WorkflowBucket{
  if(q.bank_registered===true)return "registered";
  const review=q.review_result&&typeof q.review_result==="object" ? q.review_result as Record<string,unknown> : {};
  if(String(review.bank_status??"").toUpperCase()==="REGISTERED")return "registered";
  const status=String(q.status??"").toUpperCase();
  if(status==="REVIEW")return "review";
  if(status==="FAILED"||status==="REJECTED")return "failed";
  if(status==="APPROVED"||status==="AUTO_REGISTERED"||status==="REGISTERED")return "pending";
  return "other";
}

export function sourceWorkflowSummary(rows:WorkflowQuestionLike[]){
  let registered=0,pending=0,review=0,failed=0,other=0;
  for(const row of rows){
    const b=sourceWorkflowBucket(row);
    if(b==="registered")registered++;else if(b==="pending")pending++;else if(b==="review")review++;else if(b==="failed")failed++;else other++;
  }
  const total=rows.length;
  const state=total===0?"UNANALYZED":registered===total?"REGISTERED":review>0?"REVIEW":pending>0?"PENDING":failed>0?"FAILED":"ANALYZING";
  const label=total===0?"미분석":
    `전체 ${total} · 등록완료 ${registered} · 등록대기 ${pending} · 검토보류 ${review} · 제외/실패 ${failed}`;
  return {state,label,total,registered,pending,review,failed,other};
}
