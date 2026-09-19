import { DIFFICULTY_AUDIT_HOLD } from "@/lib/difficulty-assessment-policy";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { normalizeDifficulty } from "@/lib/difficulty-scale";
import { applyJudgedDifficulty, isApplicableDifficultyJudgement, DIFFICULTY_JUDGE_VERSION } from "@/lib/difficulty-judge";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request:NextRequest){
  try{
    const denied=await requireAdmin();
    if(denied)return denied;
    if(DIFFICULTY_AUDIT_HOLD)return NextResponse.json({success:false,message:"난도 기준 검증 중: 이전 미리보기 결과도 자동 적용하지 않습니다."},{status:409});

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
      if(!problemId || !isApplicableDifficultyJudgement(judgement) || row?.version !== DIFFICULTY_JUDGE_VERSION || !row?.snapshotUpdatedAt){
        failed++;results.push({problemId,ok:false,message:"유효하지 않은 미리보기 판정"});continue;
      }

      const {data:problem,error}=await supabase
        .from("problem_bank_questions")
        .select("id,difficulty,problem_dna,updated_at,question_no")
        .eq("id",problemId)
        .single();

      if(error||!problem){
        failed++;results.push({problemId,ok:false,message:error?.message||"문항 없음"});continue;
      }
      if(problem.problem_dna?.difficulty?.admin_fixed===true){
        skippedFixed++;results.push({problemId,ok:false,skippedFixed:true,message:"관리자 확정 문항"});continue;
      }

      const current=normalizeDifficulty(problem.difficulty);
      if(current!==previous || problem.updated_at !== row.snapshotUpdatedAt || judgement.solve.observed_question_no !== problem.question_no){
        stale++;results.push({problemId,ok:false,stale:true,message:`미리보기 후 문항 또는 난이도가 변경됨 (${previous||"미분류"}→${current||"미분류"})`});continue;
      }

      const dna=applyJudgedDifficulty(problem.problem_dna,judgement,current||null);
      const {error:updateError,data:saved}=await supabase
        .from("problem_bank_questions")
        .update({
          difficulty:String(judgement.final_grade),
          problem_dna:dna,
          updated_at:new Date().toISOString(),
        })
        .eq("id",problemId).eq("updated_at",problem.updated_at).select("id");

      if(updateError){
        failed++;results.push({problemId,ok:false,message:updateError.message});continue;
      }
      if (!saved?.length) {stale++;results.push({problemId,ok:false,stale:true,message:"적용 도중 문항 변경 · 다시 검증해 주세요."});continue;}
      applied++;
      results.push({problemId,ok:true,difficulty:String(judgement.final_grade)});
    }

    return NextResponse.json({success:true,requested:rows.length,applied,failed,stale,skippedFixed,results});
  }catch(error){
    return NextResponse.json({success:false,message:error instanceof Error?error.message:"미리보기 결과 적용 중 오류"},{status:500});
  }
}
