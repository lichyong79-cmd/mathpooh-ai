import { NextRequest,NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { sourceWorkflowSummary } from "@/lib/source-workflow";
export const dynamic="force-dynamic";export const runtime="nodejs";
export async function GET(_:NextRequest,context:{params:Promise<{id:string}>}){
 const denied=await requireUser();if(denied)return denied;
 try{
  const {id}=await context.params;const s=createClient();
  const a=await s.from("source_analysis").select("id").eq("source_file_id",id).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(a.error)throw a.error;if(!a.data?.id)return NextResponse.json({success:true,...sourceWorkflowSummary([])});
  const [q,b]=await Promise.all([
   s.from("analysis_questions").select("id,question_no,status,review_result").eq("analysis_id",a.data.id).order("question_no"),
   s.from("problem_bank_questions").select("analysis_question_id,question_no").eq("source_file_id",id),
  ]);
  if(q.error)throw q.error;if(b.error)throw b.error;
  const ids=new Set((b.data??[]).map((x:any)=>String(x.analysis_question_id??"")).filter(Boolean));
  const nos=new Set((b.data??[]).map((x:any)=>Number(x.question_no)));
  const rows=(q.data??[]).map((x:any)=>({...x,bank_registered:ids.has(String(x.id))||nos.has(Number(x.question_no))}));
  return NextResponse.json({success:true,...sourceWorkflowSummary(rows)},{headers:{"Cache-Control":"no-store,max-age=0"}});
 }catch(e){return NextResponse.json({success:false,message:e instanceof Error?e.message:"상태 조회 실패"},{status:500});}
}
