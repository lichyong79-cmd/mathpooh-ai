import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import {
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

    // 예전 방식은 작업장 목록을 열 때마다 analysis_questions + problem_bank_questions
    // 약 1.6만 행을 Vercel로 전부 가져와 JS에서 다시 집계했다.
    // 문제은행이 커질수록 선형으로 느려지므로 DB 집계 view에서 시험지별 1행만 받는다.
    const rows = await fetchAll((from,to)=>
      supabase
        .from("source_workflow_counts_v1")
        .select("source_file_id,total,registered,pending,review,failed,other")
        .range(from,to)
    );

    const statuses:Record<string,SourceWorkflowStatus>={};
    for(const row of rows){
      const sourceId=String(row.source_file_id??"");
      if(!sourceId) continue;
      statuses[sourceId]=summarizeSourceWorkflow({
        total:Number(row.total??0),
        registered:Number(row.registered??0),
        pending:Number(row.pending??0),
        review:Number(row.review??0),
        failed:Number(row.failed??0),
        other:Number(row.other??0),
      });
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
