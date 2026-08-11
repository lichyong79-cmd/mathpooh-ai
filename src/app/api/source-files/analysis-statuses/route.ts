import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { sourceWorkflowSummary } from "@/lib/source-workflow";
export const dynamic="force-dynamic"; export const runtime="nodejs";

async function all(build:(from:number,to:number)=>any){
  const rows:any[]=[]; for(let from=0;;from+=1000){
    const r=await build(from,from+999); if(r.error)throw r.error;
    const page=Array.isArray(r.data)?r.data:[]; rows.push(...page); if(page.length<1000)break;
  } return rows;
}
export async function GET(){
  const denied=await requireUser();if(denied)return denied;
  try{
    const supabase=createClient();
    const [sources,analyses,questions,bank]=await Promise.all([
      all((f,t)=>supabase.from("source_files").select("id").range(f,t)),
      all((f,t)=>supabase.from("source_analysis").select("id,source_file_id,created_at").order("created_at",{ascending:true}).range(f,t)),
      all((f,t)=>supabase.from("analysis_questions").select("id,analysis_id,question_no,status,review_result").range(f,t)),
      all((f,t)=>supabase.from("problem_bank_questions").select("source_file_id,analysis_question_id,question_no").range(f,t)),
    ]);
    const latest=new Map<string,any>(); for(const a of analyses)latest.set(String(a.source_file_id),a);
    const qByAnalysis=new Map<string,any[]>();for(const q of questions){const k=String(q.analysis_id);const arr=qByAnalysis.get(k)??[];arr.push(q);qByAnalysis.set(k,arr);}
    const bankIds=new Map<string,Set<string>>(), bankNos=new Map<string,Set<number>>();
    for(const b of bank){const s=String(b.source_file_id);if(!bankIds.has(s))bankIds.set(s,new Set());if(!bankNos.has(s))bankNos.set(s,new Set());
      if(b.analysis_question_id)bankIds.get(s)!.add(String(b.analysis_question_id));bankNos.get(s)!.add(Number(b.question_no));}
    const statuses:Record<string,any>={};
    for(const src of sources){const sid=String(src.id),a=latest.get(sid);const rows=(a?qByAnalysis.get(String(a.id))??[]:[]).map(q=>({...q,bank_registered:bankIds.get(sid)?.has(String(q.id))||bankNos.get(sid)?.has(Number(q.question_no))||false}));statuses[sid]=sourceWorkflowSummary(rows);}
    return NextResponse.json({success:true,statuses},{headers:{"Cache-Control":"no-store,max-age=0"}});
  }catch(e){return NextResponse.json({success:false,message:e instanceof Error?e.message:"상태 조회 실패"},{status:500});}
}
