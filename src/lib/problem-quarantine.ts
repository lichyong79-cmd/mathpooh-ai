/** Live bank checks: assignment snapshots must never bypass quarantine. */
export async function blockedTrainingSessions(db:any,sessions:any[]){
 const items=sessions.flatMap(s=>s.sos_training_items??[]);
 const bankIds=[...new Set(items.map(i=>i.problem_id).filter(Boolean))];
 const aiIds=[...new Set(items.map(i=>i.generated_problem?.aiBankId).filter(Boolean))];
 const blockedBank=new Set<string>(),blockedAi=new Set<string>();
 for(const [ids,table,field,target] of [[bankIds,"problem_bank_questions","problem_dna",blockedBank],[aiIds,"sos_ai_generated_questions","verification",blockedAi]] as const){
  for(let start=0;start<ids.length;start+=200){
   const selectFields=table==="problem_bank_questions"?`id,status,${field}`:`id,${field}`;
   const rows=await db.from(table).select(selectFields).in("id",ids.slice(start,start+200));if(rows.error)throw rows.error;
   for(const row of rows.data??[]){
    const held=table==="problem_bank_questions"&&String((row as any).status??"ACTIVE")!=="ACTIVE";
    if(held||(row as any)[field]?.errorReview?.open)target.add(row.id);
   }
  }
 }
 return new Set(sessions.filter(s=>(s.sos_training_items??[]).some((i:any)=>blockedBank.has(i.problem_id)||blockedAi.has(i.generated_problem?.aiBankId))).map(s=>String(s.id)));
}
