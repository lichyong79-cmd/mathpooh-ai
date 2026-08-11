import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import {
  countSourceWorkflow,
  emptySourceWorkflowCounts,
  summarizeSourceWorkflow,
  type SourceWorkflowStatus,
} from "@/lib/source-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function fetchAll(build: (from:number,to:number)=>any) {
  const rows:any[]=[];
  for(let from=0;;from+=1000){
    const result=await build(from,from+999);
    if(result.error) throw result.error;
    const page=Array.isArray(result.data)?result.data:[];
    rows.push(...page);
    if(page.length<1000) break;
  }
  return rows;
}

export async function GET() {
  const denied = await requireUser();
  if (denied) return denied;

  try {
    const supabase = createClient();

    const [sources, analyses, questions, bankRows] = await Promise.all([
      fetchAll((f,t)=>supabase.from("source_files").select("id").range(f,t)),
      fetchAll((f,t)=>supabase.from("source_analysis").select("id,source_file_id,created_at").order("created_at",{ascending:true}).range(f,t)),
      fetchAll((f,t)=>supabase.from("analysis_questions").select("id,analysis_id,question_no,status").range(f,t)),
      fetchAll((f,t)=>supabase.from("problem_bank_questions").select("source_file_id,analysis_question_id,question_no").range(f,t)),
    ]);

    // 시험지별 최신 분석만 사용
    const latestAnalysisBySource=new Map<string,any>();
    for(const a of analyses) latestAnalysisBySource.set(String(a.source_file_id),a);

    const questionsByAnalysis=new Map<string,any[]>();
    for(const q of questions){
      const key=String(q.analysis_id??"");
      const list=questionsByAnalysis.get(key)??[];
      list.push(q);
      questionsByAnalysis.set(key,list);
    }

    const bankIdsBySource=new Map<string,Set<string>>();
    const bankNosBySource=new Map<string,Set<number>>();
    for(const row of bankRows){
      const sourceId=String(row.source_file_id??"");
      if(!sourceId) continue;
      if(!bankIdsBySource.has(sourceId)) bankIdsBySource.set(sourceId,new Set());
      if(!bankNosBySource.has(sourceId)) bankNosBySource.set(sourceId,new Set());

      const qid=String(row.analysis_question_id??"").trim();
      if(qid) bankIdsBySource.get(sourceId)!.add(qid);

      const qno=Number(row.question_no);
      if(Number.isFinite(qno)) bankNosBySource.get(sourceId)!.add(qno);
    }

    const statuses:Record<string,SourceWorkflowStatus>={};

    for(const source of sources){
      const sourceId=String(source.id);
      const analysis=latestAnalysisBySource.get(sourceId);

      if(!analysis){
        statuses[sourceId]=summarizeSourceWorkflow(emptySourceWorkflowCounts());
        continue;
      }

      const registeredIds=bankIdsBySource.get(sourceId)??new Set<string>();
      const registeredNos=bankNosBySource.get(sourceId)??new Set<number>();
      const qs=questionsByAnalysis.get(String(analysis.id))??[];

      const counts=countSourceWorkflow(qs.map((q:any)=>({
        status:q.status,
        bankRegistered:
          registeredIds.has(String(q.id)) ||
          registeredNos.has(Number(q.question_no)),
      })));

      statuses[sourceId]=summarizeSourceWorkflow(counts);
    }

    return NextResponse.json(
      {success:true,statuses},
      {headers:{"Cache-Control":"no-store,max-age=0"}}
    );
  } catch(error) {
    return NextResponse.json(
      {success:false,message:error instanceof Error?error.message:"상태 조회 실패"},
      {status:500}
    );
  }
}
