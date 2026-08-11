import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { countSourceWorkflow, emptySourceWorkflowCounts, summarizeSourceWorkflow } from "@/lib/source-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_:NextRequest, context:{params:Promise<{id:string}>}) {
  const denied=await requireUser();
  if(denied) return denied;

  try {
    const {id}=await context.params;
    const supabase=createClient();

    const analysis=await supabase
      .from("source_analysis")
      .select("id")
      .eq("source_file_id",id)
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();

    if(analysis.error) throw analysis.error;
    if(!analysis.data?.id){
      return NextResponse.json({success:true,...summarizeSourceWorkflow(emptySourceWorkflowCounts())});
    }

    const [questionsResult,bankResult]=await Promise.all([
      supabase.from("analysis_questions").select("id,question_no,status").eq("analysis_id",analysis.data.id).order("question_no"),
      supabase.from("problem_bank_questions").select("analysis_question_id,question_no").eq("source_file_id",id),
    ]);

    if(questionsResult.error) throw questionsResult.error;
    if(bankResult.error) throw bankResult.error;

    const registeredIds=new Set(
      (bankResult.data??[]).map((row:any)=>String(row.analysis_question_id??"").trim()).filter(Boolean)
    );
    const registeredNos=new Set(
      (bankResult.data??[]).map((row:any)=>Number(row.question_no)).filter(Number.isFinite)
    );

    const counts=countSourceWorkflow((questionsResult.data??[]).map((q:any)=>({
      status:q.status,
      bankRegistered:
        registeredIds.has(String(q.id)) ||
        registeredNos.has(Number(q.question_no)),
    })));

    return NextResponse.json(
      {success:true,...summarizeSourceWorkflow(counts)},
      {headers:{"Cache-Control":"no-store,max-age=0"}}
    );
  } catch(error) {
    return NextResponse.json(
      {success:false,message:error instanceof Error?error.message:"상태 조회 실패"},
      {status:500}
    );
  }
}
