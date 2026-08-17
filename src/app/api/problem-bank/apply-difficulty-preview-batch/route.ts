import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import { normalizeDifficulty } from "@/lib/difficulty-scale";
import { applyJudgedDifficulty, type DifficultyJudgement } from "@/lib/difficulty-judge";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function validJudgement(value:any): value is DifficultyJudgement {
  if(!value || typeof value!=="object") return false;
  if(value.decision!=="graded") return false;
  if(!/^[1-8]$/.test(String(value.final_grade??""))) return false;
  if(value.review_required===true) return false;
  if(!value.solve || typeof value.solve!=="object") return false;
  return true;
}

export async function POST(request:NextRequest){
  try{
    const denied=await requireUser();
    if(denied)return denied;

    const body=await request.json().catch(()=>({}));
    const rows=Array.isArray(body?.rows)?body.rows.slice(0,100):[];
    if(!rows.length)return NextResponse.json({success:false,message:"적용할 미리보기 결과가 없습니다."},{status:400});

    const supabase=await createClient();
    let applied=0,failed=0,stale=0,skippedFixed=0;
    const results:any[]=[];

    for(const row of rows){
      const problemId=String(row?.problemId??"").trim();
      const judgement=row?.judgement;
      const previous=normalizeDifficulty(row?.previousDifficulty);
      if(!problemId || !validJudgement(judgement)){
        failed++;results.push({problemId,ok:false,message:"유효하지 않은 미리보기 판정"});continue;
      }

      const {data:problem,error}=await supabase
        .from("problem_bank_questions")
        .select("id,difficulty,problem_dna")
        .eq("id",problemId)
        .single();

      if(error||!problem){
        failed++;results.push({problemId,ok:false,message:error?.message||"문항 없음"});continue;
      }
      if(problem.problem_dna?.difficulty?.admin_fixed===true){
        skippedFixed++;results.push({problemId,ok:false,skippedFixed:true,message:"관리자 확정 문항"});continue;
      }

      const current=normalizeDifficulty(problem.difficulty);
      if(current!==previous){
        stale++;results.push({problemId,ok:false,stale:true,message:`미리보기 후 현재 난이도가 변경됨 (${previous||"미분류"}→${current||"미분류"})`});continue;
      }

      const dna=applyJudgedDifficulty(problem.problem_dna,judgement,current||null);
      const {error:updateError}=await supabase
        .from("problem_bank_questions")
        .update({
          difficulty:String(judgement.final_grade),
          problem_dna:dna,
          updated_at:new Date().toISOString(),
        })
        .eq("id",problemId);

      if(updateError){
        failed++;results.push({problemId,ok:false,message:updateError.message});continue;
      }
      applied++;
      results.push({problemId,ok:true,difficulty:String(judgement.final_grade)});
    }

    return NextResponse.json({success:true,requested:rows.length,applied,failed,stale,skippedFixed,results});
  }catch(error){
    return NextResponse.json({success:false,message:error instanceof Error?error.message:"미리보기 결과 적용 중 오류"},{status:500});
  }
}
